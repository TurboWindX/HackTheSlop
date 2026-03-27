import React, { useState, useMemo } from 'react';
import { QUERIES, QUERY_CATEGORIES, QueryDef, QueryResult, QueryCategory } from '../utils/graphQueries';
import { BHGraph } from '../services/bloodhoundParser';
import BloodHoundGraph from './BloodHoundGraph';

interface Props {
    graph: BHGraph;
    ownedIds: Set<string>;
    onToggleOwned: (id: string) => void;
}

const BloodHoundQueries: React.FC<Props> = ({ graph, ownedIds, onToggleOwned }) => {
    const [activeCategory, setActiveCategory] = useState<QueryCategory>('paths');
    const [activeQueryId,  setActiveQueryId]  = useState<string | null>(null);
    const [result,         setResult]         = useState<QueryResult | null>(null);
    const [ownedInput,     setOwnedInput]     = useState('');
    const [ownedOpen,      setOwnedOpen]      = useState(true);

    const visibleQueries = useMemo(
        () => QUERIES.filter(q => q.category === activeCategory),
        [activeCategory],
    );

    const runQuery = (q: QueryDef) => {
        setActiveQueryId(q.id);
        setResult(q.run(graph, ownedIds));
    };

    const addOwned = () => {
        const lines = ownedInput
            .split(/[\n,;]/)
            .map(s => s.trim())
            .filter(Boolean);

        for (const line of lines) {
            const matched = graph.nodes.find(
                n =>
                    n.name.toLowerCase() === line.toLowerCase() ||
                    n.id.toLowerCase()   === line.toLowerCase()  ||
                    n.id.toUpperCase().includes(line.toUpperCase()) // partial SID match
            );
            if (matched) onToggleOwned(matched.id);
        }
        setOwnedInput('');
    };

    const ownedNodes = graph.nodes.filter(n => ownedIds.has(n.id));

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
                            onClick={() => { setActiveCategory(cat.id); setResult(null); setActiveQueryId(null); }}
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

                    {/* Result panel */}
                    {result && (
                        <div className="bh-query-result">
                            <div className={`bh-result-findings${result.count === 0 ? ' bh-result-empty' : ''}`}>
                                {result.findings.map((line, i) => (
                                    <p
                                        key={i}
                                        className={line.startsWith('  ') ? 'bh-find-sub' : 'bh-find-main'}
                                    >
                                        {line}
                                    </p>
                                ))}
                            </div>

                            {result.subgraph.nodes.length > 0 ? (
                                <BloodHoundGraph
                                    graph={result.subgraph}
                                    ownedIds={ownedIds}
                                    onToggleOwned={onToggleOwned}
                                    compact
                                />
                            ) : (
                                <div className="bh-query-noresult">No matching objects found.</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BloodHoundQueries;
