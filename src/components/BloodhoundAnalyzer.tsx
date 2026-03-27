import React, { useState, useMemo } from 'react';
import { BloodhoundResult } from '../types';
import { parseBloodhoundResults, parseBloodhoundGraph } from '../services/bloodhoundParser';
import BloodHoundGraph from './BloodHoundGraph';
import BloodHoundQueries from './BloodHoundQueries';

interface BloodhoundAnalyzerProps {
    results: BloodhoundResult[] | string;
}

type AnalyzerView = 'graph' | 'queries' | 'list';

const BloodhoundAnalyzer: React.FC<BloodhoundAnalyzerProps> = ({ results }) => {
    const [view,     setView]     = useState<AnalyzerView>('graph');
    const [ownedIds, setOwnedIds] = useState<Set<string>>(new Set());

    const rawJson      = typeof results === 'string' ? results : null;
    const analyzedData = typeof results === 'string'
        ? parseBloodhoundResults(results)
        : results;

    const graph = useMemo(() => {
        if (!rawJson) return null;
        return parseBloodhoundGraph(rawJson);
    }, [rawJson]);

    const toggleOwned = (id: string) =>
        setOwnedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    if (!analyzedData || analyzedData.length === 0) return null;

    return (
        <div className="bloodhound-analyzer-results">
            <div className="bh-view-toggle">
                <button
                    className={view === 'graph'   ? 'active' : ''}
                    onClick={() => setView('graph')}
                >
                    🕸 Graph
                </button>
                <button
                    className={view === 'queries' ? 'active' : ''}
                    onClick={() => setView('queries')}
                >
                    🔍 Queries
                    {ownedIds.size > 0 && (
                        <span className="bh-owned-indicator">{ownedIds.size} owned</span>
                    )}
                </button>
                <button
                    className={view === 'list'    ? 'active' : ''}
                    onClick={() => setView('list')}
                >
                    📋 List ({analyzedData.length})
                </button>
            </div>

            {view === 'graph' && graph && graph.nodes.length > 0 && (
                <BloodHoundGraph
                    graph={graph}
                    ownedIds={ownedIds}
                    onToggleOwned={toggleOwned}
                />
            )}
            {view === 'graph' && (!graph || graph.nodes.length === 0) && (
                <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>
                    No graph data — paste or upload a SharpHound ZIP / JSON first.
                </p>
            )}

            {view === 'queries' && graph && (
                <BloodHoundQueries
                    graph={graph}
                    ownedIds={ownedIds}
                    onToggleOwned={toggleOwned}
                />
            )}
            {view === 'queries' && !graph && (
                <p style={{ color: 'var(--text-dim)', marginTop: '1rem' }}>
                    Upload a SharpHound ZIP / JSON first.
                </p>
            )}

            {view === 'list' && (
                <ul>
                    {analyzedData.map((data, index) => (
                        <li key={index} className={`type-${data.type}`}>
                            <strong>[{data.type}]</strong> {data.name}
                            {data.details && (
                                <span style={{ color: 'var(--text-dim)' }}> — {data.details}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default BloodhoundAnalyzer;

