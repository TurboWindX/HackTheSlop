export interface SearchResult {
    title:       string;
    url:         string;
    description: string;
}

export async function braveSearch(query: string): Promise<SearchResult[]> {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `Search returned ${res.status}`);
    }
    const data = await res.json();
    return data.results ?? [];
}

/** Format results as a context block to inject before the user message */
export function formatResultsForPrompt(results: SearchResult[]): string {
    if (!results.length) return '';
    const lines = results.map((r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description}`
    );
    return `--- Web Search Results ---\n${lines.join('\n\n')}\n--- End Search Results ---\n\n`;
}
