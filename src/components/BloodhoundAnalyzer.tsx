import React, { useState, useEffect, useRef } from 'react';
import { BloodhoundResult } from '../types';
import { BHGraph } from '../services/bloodhoundParser';
import BloodHoundGraph from './BloodHoundGraph';
import BloodHoundQueries from './BloodHoundQueries';

const LIST_PAGE = 250;

interface BloodhoundAnalyzerProps {
    results: BloodhoundResult[] | string;
}

const BloodhoundAnalyzer: React.FC<BloodhoundAnalyzerProps> = ({ results }) => {
    const [ownedIds,     setOwnedIds]     = useState<Set<string>>(new Set());
    const [graph,        setGraph]        = useState<BHGraph | null>(null);
    const [analyzedData, setAnalyzedData] = useState<BloodhoundResult[]>([]);
    const [parsing,      setParsing]      = useState(false);

    // Right-panel state — only populated when a query is explicitly run
    const [subgraph,   setSubgraph]   = useState<BHGraph | null>(null);
    const [queryTitle, setQueryTitle] = useState<string>('');

    // Full-graph explorer — opt-in only, mounts ForceGraph2D on demand
    const [showFullGraph, setShowFullGraph] = useState(false);

    // Node-list panel
    const [showList,  setShowList]  = useState(false);
    const [listLimit, setListLimit] = useState(LIST_PAGE);

    // Web Worker for off-thread JSON parsing
    const workerRef  = useRef<Worker | null>(null);
    const parseIdRef = useRef(0);

    useEffect(() => {
        const w = new Worker(
            new URL('../workers/bhParser.worker.ts', import.meta.url),
            { type: 'module' }
        );
        w.onmessage = (e: MessageEvent) => {
            const { id, ok, graph: g, flat } = e.data;
            if (id !== parseIdRef.current) return; // stale response
            if (ok) {
                setGraph(g);
                setAnalyzedData(flat);
                setListLimit(LIST_PAGE);
            }
            setParsing(false);
        };
        workerRef.current = w;
        return () => { w.terminate(); };
    }, []);

    useEffect(() => {
        if (typeof results !== 'string') {
            setAnalyzedData(results);
            setGraph(null);
            setParsing(false);
            return;
        }

        if (!results || !results.trim()) {
            setAnalyzedData([]);
            setGraph(null);
            setParsing(false);
            return;
        }

        setParsing(true);
        setSubgraph(null);
        setShowFullGraph(false);

        const id = ++parseIdRef.current;
        workerRef.current?.postMessage({ raw: results, id });
    }, [results]);

    const toggleOwned = (id: string) =>
        setOwnedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });

    const handleSubgraph = (sg: BHGraph, findings: string[], _count: number) => {
        setSubgraph(sg);
        setShowFullGraph(false);
        setQueryTitle(findings[0] ?? '');
    };

    if (parsing) {
        return <div className="bh-parsing-notice">Parsing SharpHound data...</div>;
    }

    if (!graph && (!analyzedData || analyzedData.length === 0)) return null;

    const rightContent = showFullGraph
        ? graph
        : (subgraph && subgraph.nodes.length > 0 ? subgraph : null);

    return (
        <div className="bh-workspace">

            {/* Stats / action bar */}
            <div className="bh-stats-bar">
                <div className="bh-stats-pills">
                    {graph && (
                        <>
                            <span className="bh-stat">{graph.nodes.length.toLocaleString()} nodes</span>
                            <span className="bh-stat">{graph.edges.length.toLocaleString()} edges</span>
                        </>
                    )}
                </div>
                <div className="bh-stats-actions">
                    <button
                        className={`btn btn-small${showList ? ' active' : ''}`}
                        onClick={() => setShowList(v => !v)}
                        title="Browse all parsed nodes"
                    >
                        Node List {showList ? '(hide)' : '(show)'}
                    </button>
                    {graph && (
                        <button
                            className={`btn btn-small bh-fullgraph-btn${showFullGraph ? ' active' : ''}`}
                            onClick={() => { setShowFullGraph(v => !v); setSubgraph(null); }}
                            title="Load the entire graph - can be slow with 1000+ nodes"
                        >
                            {showFullGraph ? 'Close Full Graph' : 'Full Graph Explorer'}
                        </button>
                    )}
                </div>
            </div>

            {/* Node list (collapsible) */}
            {showList && analyzedData.length > 0 && (
                <div className="bh-virtual-list">
                    <ul>
                        {analyzedData.slice(0, listLimit).map((data, i) => (
                            <li key={i} className={`type-${data.type}`}>
                                <strong>[{data.type}]</strong> {data.name}
                                {data.details && (
                                    <span style={{ color: 'var(--text-dim)' }}> - {data.details}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                    {analyzedData.length > listLimit && (
                        <button
                            className="btn btn-small bh-load-more"
                            onClick={() => setListLimit(l => l + LIST_PAGE)}
                        >
                            Load {Math.min(LIST_PAGE, analyzedData.length - listLimit)} more
                            <span className="bh-load-more-dim">
                                ({analyzedData.length - listLimit} remaining)
                            </span>
                        </button>
                    )}
                </div>
            )}

            {/* Main workspace */}
            <div className="bh-main-grid">

                {/* Left: query panel */}
                <div className="bh-left-panel">
                    {graph ? (
                        <BloodHoundQueries
                            graph={graph}
                            ownedIds={ownedIds}
                            onToggleOwned={toggleOwned}
                            onSubgraph={handleSubgraph}
                        />
                    ) : (
                        <p style={{ color: 'var(--text-dim)', fontSize: '.9em', marginTop: '1rem' }}>
                            Upload or paste SharpHound data above to run queries.
                        </p>
                    )}
                </div>

                {/* Right: graph canvas */}
                <div className="bh-right-panel">
                    {rightContent ? (
                        <BloodHoundGraph
                            key={showFullGraph ? '__full__' : queryTitle}
                            graph={rightContent}
                            ownedIds={ownedIds}
                            onToggleOwned={toggleOwned}
                            compact={!showFullGraph}
                        />
                    ) : (
                        <div className="bh-graph-placeholder">
                            <div className="bh-placeholder-icon">[graph]</div>
                            <p className="bh-placeholder-text">
                                Run a query on the left to visualize the attack path
                            </p>
                            {graph && !showFullGraph && (
                                <p className="bh-placeholder-sub">
                                    Or use <strong>Full Graph Explorer</strong> to browse all{' '}
                                    {graph.nodes.length.toLocaleString()} nodes
                                </p>
                            )}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default BloodhoundAnalyzer;

