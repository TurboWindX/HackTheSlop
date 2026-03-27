import { BloodhoundResult } from '../types';

// ── Graph types ───────────────────────────────────────────────────────────────

export interface BHGraphNode {
    id: string;
    name: string;
    type: string; // User | Computer | Group | Domain | GPO | OU | Container | …
    properties?: Record<string, any>;
}

export interface BHGraphEdge {
    source: string;
    target: string;
    label: string; // MemberOf | AdminTo | HasSession | GenericAll | …
}

export interface BHGraph {
    nodes: BHGraphNode[];
    edges: BHGraphEdge[];
}

// ── Edge categorisation helpers ───────────────────────────────────────────────

export const DANGEROUS_EDGES = new Set([
    'AdminTo', 'GenericAll', 'GenericWrite', 'WriteDACL', 'WriteOwner',
    'DCSync', 'GetChanges', 'GetChangesAll', 'ForceChangePassword',
    'ReadLAPSPassword', 'ReadGMSAPassword', 'AllowedToAct',
    'AllowedToDelegate', 'HasSIDHistory', 'Owns', 'AddMember',
    'AddSelf', 'WriteAccountRestrictions',
]);

// ── Graph parser ──────────────────────────────────────────────────────────────

export function parseBloodhoundGraph(raw: string): BHGraph {
    if (!raw || !raw.trim()) return { nodes: [], edges: [] };

    try {
        const json = JSON.parse(raw);

        // BloodHound CE / BHCE export: { nodes: [...], edges: [...] }
        if (json.nodes && json.edges && Array.isArray(json.nodes)) {
            const nodes: BHGraphNode[] = json.nodes.map((n: any) => ({
                id:         n.objectid ?? n.ObjectIdentifier ?? String(Math.random()),
                name:       n.Properties?.name ?? n.label ?? n.objectid ?? 'Unknown',
                type:       n.kind ?? n.type ?? 'Node',
                properties: n.Properties,
            }));
            const edges: BHGraphEdge[] = (json.edges as any[]).map(e => ({
                source: e.source ?? e.StartNode,
                target: e.target ?? e.EndNode,
                label:  e.kind  ?? e.label ?? e.type ?? 'Rel',
            })).filter(e => e.source && e.target);
            return { nodes, edges };
        }

        // Single SharpHound file: { data: [...], meta: { type: 'users', … } }
        if (json.data && Array.isArray(json.data)) {
            const metaType = json.meta?.type ?? '';
            return extractGraphFromItems(
                json.data.map((o: any) => ({ ...o, _bhType: metaType }))
            );
        }

        // Flat array (merged ZIP objects, may already carry _bhType)
        if (Array.isArray(json)) return extractGraphFromItems(json);

        // Single object
        return extractGraphFromItems([json]);
    } catch {
        return { nodes: [], edges: [] };
    }
}

function bhTypeToKind(metaType: string): string {
    const map: Record<string, string> = {
        users: 'User', computers: 'Computer', groups: 'Group',
        domains: 'Domain', gpos: 'GPO', ous: 'OU',
        containers: 'Container', aiacas: 'AIACA',
        certtemplates: 'CertTemplate', enterprisecas: 'EnterpriseCA',
        ntauthstores: 'NTAuthStore', rootcas: 'RootCA',
        // SharpHound CE file names for ADCS objects
        cas: 'EnterpriseCA', adcsca: 'EnterpriseCA',
        certificationauthorities: 'EnterpriseCA',
    };
    return map[metaType.toLowerCase()] ?? metaType;
}

function inferType(obj: any): string {
    if (obj.LocalAdmins !== undefined || obj.Sessions !== undefined)  return 'Computer';
    if (obj.Members !== undefined)                                     return 'Group';
    if (obj.Trusts   !== undefined)                                    return 'Domain';
    if (obj.Properties?.gpcpath !== undefined)                         return 'GPO';
    return 'User';
}

function extractGraphFromItems(items: any[]): BHGraph {
    const nodesMap = new Map<string, BHGraphNode>();
    const edges: BHGraphEdge[] = [];

    for (const obj of items) {
        const id = obj.ObjectIdentifier ?? obj.objectid;
        if (!id) continue;

        const type = obj._bhType ? bhTypeToKind(obj._bhType) : inferType(obj);
        const name = obj.Properties?.name ?? obj.name ?? id;
        nodesMap.set(id, { id, name, type, properties: obj.Properties });

        // Group membership
        if (Array.isArray(obj.Members)) {
            for (const m of obj.Members) {
                const mId = m.ObjectIdentifier ?? m.objectid;
                if (mId) edges.push({ source: mId, target: id, label: 'MemberOf' });
            }
        }

        // ACEs (on any object)
        if (Array.isArray(obj.Aces)) {
            for (const ace of obj.Aces) {
                const src = ace.PrincipalSID ?? ace.PrincipalName;
                if (src && ace.RightName)
                    edges.push({ source: src, target: id, label: ace.RightName });
            }
        }

        // Local admins on a computer
        const localAdmins = obj.LocalAdmins?.Results ?? obj.LocalAdmins;
        if (Array.isArray(localAdmins)) {
            for (const m of localAdmins) {
                const mId = m.ObjectIdentifier ?? m.objectid;
                if (mId) edges.push({ source: mId, target: id, label: 'AdminTo' });
            }
        }

        // Sessions on a computer
        const sessions = obj.Sessions?.Results ?? obj.Sessions;
        if (Array.isArray(sessions)) {
            for (const s of sessions) {
                const uId = s.UserSID ?? s.ObjectIdentifier;
                if (uId) edges.push({ source: uId, target: id, label: 'HasSession' });
            }
        }

        // Remote Desktop Users
        const rdp = obj.RemoteDesktopUsers?.Results ?? obj.RemoteDesktopUsers;
        if (Array.isArray(rdp)) {
            for (const m of rdp) {
                const mId = m.ObjectIdentifier ?? m.objectid;
                if (mId) edges.push({ source: mId, target: id, label: 'CanRDP' });
            }
        }

        // Remote Management / PSRemote
        const psrem = obj.RemoteManagementUsers?.Results ?? obj.RemoteManagementUsers;
        if (Array.isArray(psrem)) {
            for (const m of psrem) {
                const mId = m.ObjectIdentifier ?? m.objectid;
                if (mId) edges.push({ source: mId, target: id, label: 'CanPSRemote' });
            }
        }

        // DCOM Users
        const dcom = obj.DcomUsers?.Results ?? obj.DcomUsers;
        if (Array.isArray(dcom)) {
            for (const m of dcom) {
                const mId = m.ObjectIdentifier ?? m.objectid;
                if (mId) edges.push({ source: mId, target: id, label: 'ExecuteDCOM' });
            }
        }

        // Allowed to Act (RBCD)
        if (Array.isArray(obj.AllowedToAct)) {
            for (const m of obj.AllowedToAct) {
                const mId = m.ObjectIdentifier ?? m.objectid;
                if (mId) edges.push({ source: mId, target: id, label: 'AllowedToAct' });
            }
        }

        // Constrained Delegation
        if (Array.isArray(obj.AllowedToDelegate)) {
            for (const m of obj.AllowedToDelegate) {
                const mId = m.ObjectIdentifier ?? m.objectid;
                if (mId) edges.push({ source: id, target: mId, label: 'AllowedToDelegate' });
            }
        }

        // SID History
        if (Array.isArray(obj.HasSIDHistory)) {
            for (const m of obj.HasSIDHistory) {
                const mId = m.ObjectIdentifier ?? m.objectid;
                if (mId) edges.push({ source: id, target: mId, label: 'HasSIDHistory' });
            }
        }

        // Domain Trusts
        if (Array.isArray(obj.Trusts)) {
            for (const t of obj.Trusts) {
                if (t.TargetDomainSid)
                    edges.push({ source: id, target: t.TargetDomainSid, label: t.TrustType ?? 'TrustedBy' });
            }
        }

        // ── ADCS ─────────────────────────────────────────────────────────────

        // EnterpriseCA → template (PublishedTo edge: template is the source, CA is target in BH CE)
        // SharpHound stores CertTemplates[] on EnterpriseCA objects
        const certTemplates = obj.CertTemplates ?? obj.CertificateTemplates;
        if (Array.isArray(certTemplates)) {
            for (const t of certTemplates) {
                const tId = t.ObjectIdentifier ?? t.objectid ?? (typeof t === 'string' ? t : null);
                if (tId) edges.push({ source: tId, target: id, label: 'PublishedTo' });
            }
        }

        // Enroll / AutoEnroll rights (stored on CertTemplate as EnrollmentAgentRestrictedRights,
        // or on the Enrollment array)
        const enrollRights = obj.Enrollment ?? obj.EnrollmentRights ?? obj.EnrolledBy;
        if (Array.isArray(enrollRights)) {
            for (const e of enrollRights) {
                const eId = e.ObjectIdentifier ?? e.objectid;
                if (eId) edges.push({ source: eId, target: id, label: 'Enroll' });
            }
        }

        // Some versions embed ACEs with RightName 'Enroll' / 'AutoEnroll'
        // These are already handled by the Aces loop above via ace.RightName
    }

    // Stub nodes referenced in edges but never seen as a primary object
    const allEdges = edges.filter(e => e.source && e.target && e.source !== e.target);
    for (const e of allEdges) {
        if (!nodesMap.has(e.source))
            nodesMap.set(e.source, { id: e.source, name: e.source.slice(-12), type: 'Unknown' });
        if (!nodesMap.has(e.target))
            nodesMap.set(e.target, { id: e.target, name: e.target.slice(-12), type: 'Unknown' });
    }

    return { nodes: Array.from(nodesMap.values()), edges: allEdges };
}

// ── Legacy flat-list parser (AI context / list view) ─────────────────────────

/**
 * Parse raw BloodHound JSON (pasted by the analyst) into a flat list of
 * BloodhoundResult objects that the AI and UI components can consume.
 *
 * Handles both the legacy BloodHound 4 format and the newer BloodHound CE
 * format where nodes/edges are wrapped under separate keys.
 */
export function parseBloodhoundResults(raw: string | BloodhoundResult[]): BloodhoundResult[] {
    if (Array.isArray(raw)) return raw;
    if (!raw || !raw.trim()) return [];

    try {
        const json = JSON.parse(raw);

        // BloodHound CE / BHCE format: { nodes: [...], edges: [...] }
        if (json.nodes && Array.isArray(json.nodes)) {
            return json.nodes.map((n: any) => ({
                id:      n.objectid ?? n.ObjectIdentifier ?? String(Math.random()),
                name:    n.Properties?.name ?? n.label ?? n.objectid ?? 'Unknown',
                type:    n.kind ?? n.type ?? 'Node',
                details: summarizeNode(n),
            }));
        }

        // Legacy format: top-level array
        if (Array.isArray(json)) {
            return json.map((n: any) => ({
                id:      n.ObjectIdentifier ?? n.id ?? String(Math.random()),
                name:    n.Properties?.name ?? n.name ?? 'Unknown',
                type:    n.type ?? 'Node',
                details: summarizeNode(n),
            }));
        }

        // Single object
        return [{
            id:      json.ObjectIdentifier ?? 'unknown',
            name:    json.Properties?.name ?? 'Unknown',
            type:    json.type ?? 'Node',
            details: summarizeNode(json),
        }];
    } catch {
        return [{ id: 'parse-error', name: 'Parse Error', type: 'Error',
            details: 'Could not parse BloodHound JSON. Paste the raw export from the BloodHound UI.' }];
    }
}

function summarizeNode(n: any): string {
    const props = n.Properties ?? {};
    const parts: string[] = [];
    if (props.enabled     !== undefined) parts.push(`enabled=${props.enabled}`);
    if (props.admincount  !== undefined) parts.push(`admincount=${props.admincount}`);
    if (props.hasspn      !== undefined) parts.push(`hasspn=${props.hasspn}`);
    if (props.dontreqpreauth !== undefined) parts.push(`asrep=${props.dontreqpreauth}`);
    if (props.description)               parts.push(`desc=${props.description}`);
    if (n.Aces?.length)                  parts.push(`aces=${n.Aces.length}`);
    return parts.join(' | ') || JSON.stringify(n).slice(0, 120);
}