import { BloodhoundResult } from '../types';

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