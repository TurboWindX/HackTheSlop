import { parseBloodhoundGraph, parseBloodhoundResults } from '../services/bloodhoundParser';

interface ParseRequest {
    raw: string;
    id: number;
}

self.onmessage = (e: MessageEvent<ParseRequest>) => {
    const { raw, id } = e.data;
    try {
        const graph = parseBloodhoundGraph(raw);
        const flat  = parseBloodhoundResults(raw);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (self as any).postMessage({ id, ok: true, graph, flat });
    } catch (err: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (self as any).postMessage({ id, ok: false, error: String(err) });
    }
};
