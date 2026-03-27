import React, { useState, useMemo } from 'react';
import { QUERIES, QUERY_CATEGORIES, QueryDef, QueryCategory } from '../utils/graphQueries';
import { BHGraph } from '../services/bloodhoundParser';

interface Props {
    graph: BHGraph;
    ownedIds: Set<string>;
    onToggleOwned: (id: string) => void;
    /** Called whenever a query is run; the parent renders the resulting subgraph. */
    onSubgraph: (subgraph: BHGraph, findings: string[], count: number) => void;
}

const BloodHoundQueries: React.FC<Props> = ({ graph, ownedIds, onToggleOwned, onSubgraph }) => {
    const [activeCategory, setActiveCategory] = useState<QueryCategory>('paths');
    const [activeQueryId,  setActiveQueryId]  = useState<string | null>(null);
    const [findings,       setFindings]       = useState<string[]>([]);
    const [resultCount,    setResultCount]    = useState<number | null>(null);
    const [ownedInput,     setOwnedInput]     = useState('');
    const [ownedOpen,      setOwnedOpen]      = useState(true);

    // O(1) lookup maps built once per graph change instead of linear find() calls
    const nodeByName = useMemo(
        () => new Map(graph.nodes.map(n => [n.name.toLowerCase(), n])),
        [graph.nodes],
    );
    const nodeById = useMemo(
        () => new Map(graph.nodes.map(n => [n.id.toLowerCase(), n])),
        [graph.nodes],
    );

    const visibleQueries = useMemo(
        () => QUERIES.filter(q => q.category === activeCategory),
        [activeCategory],
    );

    const runQuery = (q: QueryDef) => {
        const r = q.run(graph, ownedIds);
        setActiveQueryId(q.id);
        setFindings(r.findings);
        setResultCount(r.count);
        onSubgraph(r.subgraph, r.findings, r.count);
    };

    const addOwned = () => {
        const lines = ownedInput
            .split(/[\n,;]/)
            .map(s => s.trim())
            .filter(Boolean);

        for (const line of lines) {
            const key = line.toLowerCase();
            const matched =
                nodeByName.get(key) ??
                nodeById.get(key) ??
                // Partial SID suffix fallback (only if the above exact lookups missed)
                graph.nodes.find(n => n.id.toLowerCase().includes(key));
            if (matched) onToggleOwned(matched.id);
        }
        setOwnedInput('');
    };

    const ownedNodes = useMemo(
        () => graph.nodes.filter(n => ownedIds.has(n.id)),
        [graph.nodes, ownedIds],
    );

    return (
        <div className="bh-queries-wrap">

            {/* ── Owned Objects Panel ─────────────────────────────────── */}
            <div className="bh-owned-panel">
                <button
                    className="bh-owned-header"
                    onClick={() => setOwnedOpen(o => !o)}
                    aria-expanded={ownedOpen}
                >
                    <span>🏴 Owned Objects</span>
                    <span className="bh-owned-count">{ownedIds.size}</span>
                    <span className="bh-owned-chevron">{ownedOpen ? '▲' : '▼'}</span>
                </button>

                {ownedOpen && (
                    <div className="bh-owned-body">
                        <p className="bh-owned-hint">
                            Right-click a node in the graph to mark it owned, or type names / SIDs below.
                        </p>

                        {ownedNodes.length > 0 && (
                            <div className="bh-owned-tags">
                                {ownedNodes.map(n => (
                                    <span key={n.id} className="bh-owned-tag">
                                        {n.name}
                                        <button
                                            onClick={() => onToggleOwned(n.id)}
                                            aria-label={`Remove ${n.name}`}
                                        >✕</button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="bh-owned-add-row">
                            <textarea
                                className="bh-owned-input"
                                rows={2}
                                value={ownedInput}
                                onChange={e => setOwnedInput(e.target.value)}
                                placeholder="Paste names or SIDs (comma / newline separated)"
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        addOwned();
                                    }
                                }}
                            />
                            <button className="btn btn-small bh-owned-add-btn" onClick={addOwned}>
                                + Add
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Query Browser ────────────────────────────────────────── */}
            <div className="bh-queries-body">

                {/* Category sidebar */}
                <nav className="bh-query-sidebar">
                    {QUERY_CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            className={`bh-cat-btn${activeCategory === cat.id ? ' active' : ''}`}
                            onClick={() => { setActiveCategory(cat.id); setFindings([]); setResultCount(null); setActiveQueryId(null); }}
                        >
                            <span className="bh-cat-icon">{cat.icon}</span>
                            <span className="bh-cat-label">{cat.label}</span>
                        </button>
                    ))}
                </nav>

                {/* Main: query buttons + result */}
                <div className="bh-query-main">
                    <div className="bh-query-list">
                        {visibleQueries.map(q => {
                            const needsOwned = q.requiresOwned && ownedIds.size === 0;
                            const isActive   = activeQueryId === q.id;
                            return (
                                <button
                                    key={q.id}
                                    className={[
                                        'bh-query-btn',
                                        isActive   ? 'active'   : '',
                                        needsOwned ? 'disabled' : '',
                                    ].join(' ').trim()}
                                    title={needsOwned ? 'Mark owned objects first (right-click nodes)' : q.description}
                                    onClick={() => !needsOwned && runQuery(q)}
                                >
                                    <span className="bh-query-icon">{q.icon}</span>
                                    <div className="bh-query-text">
                                        <span className="bh-query-name">{q.name}</span>
                                        <span className="bh-query-desc">{q.description}</span>
                                    </div>
                                    {q.requiresOwned && (
                                        <span className="bh-query-badge" title="Requires owned objects">🏴</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Findings — shown below query list, graph goes in parent's right panel */}
                    {findings.length > 0 && (
                        <div className="bh-query-result">
                            <div className={`bh-result-findings${resultCount === 0 ? ' bh-result-empty' : ''}`}>
                                {findings.map((line, i) => (
                                    <p
                                        key={i}
                                        className={line.startsWith('  ') ? 'bh-find-sub' : 'bh-find-main'}
                                    >
                                        {line}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BloodHoundQueries;
