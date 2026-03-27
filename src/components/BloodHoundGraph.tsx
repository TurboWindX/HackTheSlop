import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { BHGraph, BHGraphNode, DANGEROUS_EDGES } from '../services/bloodhoundParser';

// ── Visual constants ──────────────────────────────────────────────────────────

const NODE_R = 6;

export const NODE_COLORS: Record<string, string> = {
    User:         '#58a6ff',
    Computer:     '#3fb950',
    Group:        '#bc8cff',
    Domain:       '#f0883e',
    GPO:          '#d29922',
    OU:           '#8b949e',
    CertTemplate: '#ff7b72',
    EnterpriseCA: '#ffa657',
    RootCA:       '#ffa657',
    AIACA:        '#ffa657',
    NTAuthStore:  '#e3b341',
    Container:    '#6e7681',
    // ADCS aliases
    ADCSCA:       '#ffa657',
    CA:           '#ffa657',
    Unknown:      '#444',
};

export const EDGE_COLORS: Record<string, string> = {
    MemberOf:              '#6e7681',
    AdminTo:               '#f85149',
    HasSession:            '#58a6ff',
    CanRDP:                '#3fb950',
    CanPSRemote:           '#3fb950',
    ExecuteDCOM:           '#d29922',
    AllowedToAct:          '#f0883e',
    AllowedToDelegate:     '#f0883e',
    HasSIDHistory:         '#f0883e',
    GenericAll:            '#f85149',
    GenericWrite:          '#f85149',
    WriteDACL:             '#d29922',
    WriteOwner:            '#d29922',
    DCSync:                '#f85149',
    GetChanges:            '#f85149',
    GetChangesAll:         '#f85149',
    Owns:                  '#d29922',
    AddMember:             '#f85149',
    AddSelf:               '#f85149',
    ForceChangePassword:   '#f85149',
    ReadLAPSPassword:      '#f85149',
    ReadGMSAPassword:      '#f85149',
    WriteAccountRestrictions: '#f0883e',
    TrustedBy:             '#bc8cff',
    ParentChild:           '#6e7681',
    // ADCS
    Enroll:                '#3fb950',
    AutoEnroll:            '#3fb950',
    PublishedTo:           '#8b949e',
    ManageCertificates:    '#f85149',
    ManageCA:              '#f85149',
    AllExtendedRights:     '#d29922',
};

type FilterMode = 'dangerous' | 'connected' | 'all';

interface Props {
    graph: BHGraph;
    ownedIds?:      Set<string>;
    onToggleOwned?: (id: string) => void;
    /** Reduced height, no edge legend — for embedded use in query results */
    compact?:       boolean;
}

const BloodHoundGraph: React.FC<Props> = ({ graph, ownedIds = new Set(), onToggleOwned, compact = false }) => {
    const containerRef                = useRef<HTMLDivElement>(null);
    const [dims, setDims]             = useState({ width: 900, height: 560 });
    const [selectedNode, setSelected] = useState<BHGraphNode | null>(null);
    const [filterMode, setFilterMode] = useState<FilterMode>('dangerous');
    const [maxNodes, setMaxNodes]     = useState(500);

    // which edge-type checkboxes are ticked
    const [enabledEdges, setEnabledEdges] = useState<Set<string>>(() => {
        const all = new Set<string>();
        Object.keys(EDGE_COLORS).forEach(k => all.add(k));
        return all;
    });

    // ResizeObserver so the canvas fills the container properly
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(entries => {
            const r = entries[0].contentRect;
            setDims({ width: r.width || 900, height: r.height || 560 });
        });
        ro.observe(el);
        setDims({ width: el.clientWidth || 900, height: el.clientHeight || 560 });
        return () => ro.disconnect();
    }, []);

    // Count occurrences of each edge label in the raw graph
    const edgeCounts = useMemo(() => {
        const c: Record<string, number> = {};
        graph.edges.forEach(e => { c[e.label] = (c[e.label] ?? 0) + 1; });
        return c;
    }, [graph.edges]);

    // Sorted list of all observed edge labels (descending count)
    const sortedLabels = useMemo(
        () => Object.entries(edgeCounts).sort((a, b) => b[1] - a[1]),
        [edgeCounts]
    );

    // Build the graphData fed to ForceGraph2D
    const graphData = useMemo(() => {
        let links = graph.edges
            .filter(e => enabledEdges.has(e.label))
            .map(e => ({ source: e.source, target: e.target, label: e.label }));

        if (filterMode === 'dangerous')
            links = links.filter(e => DANGEROUS_EDGES.has(e.label));

        const usedIds = new Set<string>();
        links.forEach(l => { usedIds.add(l.source); usedIds.add(l.target); });

        let nodes = graph.nodes
            .filter(n => filterMode === 'all' || usedIds.has(n.id))
            .slice(0, maxNodes)
            .map(n => ({ ...n }));   // shallow copy — ForceGraph2D mutates x/y/vx/vy

        const nodeIds = new Set(nodes.map(n => n.id));
        links = links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

        return { nodes, links };
    }, [graph, enabledEdges, filterMode, maxNodes]);

    const nodeCanvasObject = useCallback(
        (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const color      = NODE_COLORS[node.type as string] ?? NODE_COLORS.Unknown;
            const isSelected = selectedNode?.id === node.id;
            const isOwned    = ownedIds.has(node.id as string);

            // Selection ring
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, NODE_R + 4, 0, 2 * Math.PI);
                ctx.fillStyle = 'rgba(255,255,255,0.12)';
                ctx.fill();
            }

            // Node circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, NODE_R, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            if (isSelected) {
                ctx.strokeStyle = '#fff';
                ctx.lineWidth   = 1.5 / globalScale;
                ctx.stroke();
            }

            // Owned indicator: small orange flag square top-right
            if (isOwned) {
                const sz = NODE_R * 0.55;
                ctx.fillStyle = '#f0883e';
                ctx.fillRect(node.x + NODE_R * 0.55, node.y - NODE_R - sz, sz, sz);
                // flag pole
                ctx.strokeStyle = '#f0883e';
                ctx.lineWidth   = 1 / globalScale;
                ctx.beginPath();
                ctx.moveTo(node.x + NODE_R * 0.55, node.y - NODE_R - sz);
                ctx.lineTo(node.x + NODE_R * 0.55, node.y - NODE_R + sz);
                ctx.stroke();
            }

            // Type initial inside node
            const sz = Math.max(5, 8 / globalScale);
            ctx.font         = `bold ${sz}px sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle    = '#000';
            ctx.fillText((node.type as string)[0] ?? '?', node.x, node.y);

            // Label below node when zoomed in enough
            if (globalScale > 1.5) {
                const lsz  = Math.max(4, 10 / globalScale);
                ctx.font       = `${lsz}px sans-serif`;
                ctx.fillStyle  = isOwned ? '#f0883e' : '#c9d1d9';
                const label    = (node.name as string).split('@')[0].slice(0, 24);
                ctx.fillText(label, node.x, node.y + NODE_R + lsz + 1);
            }
        },
        [selectedNode, ownedIds]
    );

    const linkColor = useCallback(
        (link: any) => EDGE_COLORS[link.label as string] ?? '#444',
        []
    );
    const linkWidth = useCallback(
        (link: any) => (DANGEROUS_EDGES.has(link.label) ? 2 : 1),
        []
    );

    const toggleEdge = (label: string) =>
        setEnabledEdges(prev => {
            const next = new Set(prev);
            next.has(label) ? next.delete(label) : next.add(label);
            return next;
        });

    const handleNodeClick = useCallback(
        (node: any) => setSelected(prev => prev?.id === node.id ? null : node),
        []
    );

    const handleNodeRightClick = useCallback(
        (node: any) => onToggleOwned?.(node.id as string),
        [onToggleOwned]
    );

    return (
        <div className={`bh-graph-wrap${compact ? ' bh-graph-compact' : ''}`}>

            {/* ── Toolbar ── */}
            <div className="bh-graph-toolbar">
                <div className="bh-graph-stats">
                    <span className="bh-stat">{graph.nodes.length} nodes</span>
                    <span className="bh-stat">{graph.edges.length} edges</span>
                    <span className="bh-stat-dim">
                        showing {graphData.nodes.length} / {graphData.links.length}
                    </span>
                </div>

                <div className="bh-graph-filters">
                    <span className="bh-filter-label">View:</span>
                    {(['dangerous', 'connected', 'all'] as FilterMode[]).map(m => (
                        <button
                            key={m}
                            className={`bh-filter-btn${filterMode === m ? ' active' : ''}`}
                            onClick={() => setFilterMode(m)}
                        >
                            {m}
                        </button>
                    ))}
                </div>

                <div className="bh-graph-filters">
                    <span className="bh-filter-label">Max nodes:</span>
                    <input
                        type="range" min={50} max={1500} step={50}
                        value={maxNodes}
                        onChange={e => setMaxNodes(Number(e.target.value))}
                    />
                    <span className="bh-filter-label">{maxNodes}</span>
                    {maxNodes > 800 && (
                        <span className="bh-filter-warn">⚠ may be slow</span>
                    )}
                </div>
            </div>

            {/* ── Body: legend + canvas ── */}
            <div className={`bh-graph-body${compact ? ' bh-graph-body-compact' : ''}`}>

                {/* Edge / node legend — hidden in compact mode */}
                {!compact && <div className="bh-edge-legend">
                    <div className="bh-legend-title">Edge Types</div>
                    {sortedLabels.map(([label, count]) => (
                        <label key={label} className="bh-legend-row">
                            <input
                                type="checkbox"
                                checked={enabledEdges.has(label)}
                                onChange={() => toggleEdge(label)}
                            />
                            <span
                                className="bh-legend-dot"
                                style={{ background: EDGE_COLORS[label] ?? '#444' }}
                            />
                            <span className="bh-legend-name">{label}</span>
                            <span className="bh-legend-count">{count}</span>
                        </label>
                    ))}

                    <div className="bh-legend-title" style={{ marginTop: 12 }}>Node Types</div>
                    {Object.entries(NODE_COLORS)
                        .filter(([k]) => k !== 'Unknown')
                        .map(([type, color]) => (
                            <div key={type} className="bh-legend-row no-check">
                                <span className="bh-legend-dot" style={{ background: color }} />
                                <span className="bh-legend-name">{type}</span>
                            </div>
                        ))}
                </div>}

                {/* Canvas */}
                <div ref={containerRef} className="bh-graph-canvas">
                    {graphData.nodes.length === 0 ? (
                        <div className="bh-graph-empty">
                            {filterMode === 'dangerous'
                                ? 'No dangerous edges found — try switching to "connected" or "all" view.'
                                : 'No data to display.'}
                        </div>
                    ) : (
                        <ForceGraph2D
                            graphData={graphData}
                            width={dims.width}
                            height={dims.height}
                            nodeCanvasObject={nodeCanvasObject}
                            nodeCanvasObjectMode={() => 'replace'}
                            linkColor={linkColor}
                            linkWidth={linkWidth}
                            linkDirectionalArrowLength={5}
                            linkDirectionalArrowRelPos={1}
                            linkLabel={(link: any) => link.label}
                            onNodeClick={handleNodeClick}
                            onNodeRightClick={handleNodeRightClick}
                            backgroundColor="#0d1117"
                            // Physics sim tuning — stops sooner so the page doesn't stutter
                            warmupTicks={graphData.nodes.length > 300 ? 30 : 60}
                            cooldownTicks={graphData.nodes.length > 500 ? 80 : 200}
                            cooldownTime={8000}
                            d3AlphaDecay={graphData.nodes.length > 300 ? 0.05 : 0.03}
                            d3VelocityDecay={0.4}
                            // Disable dragging when the graph is huge (each drag tick is expensive)
                            enableNodeDrag={graphData.nodes.length <= 600}
                        />
                    )}
                </div>
            </div>

            {/* ── Selected node panel ── */}
            {selectedNode && (
                <div className="bh-node-panel">
                    <div className="bh-node-panel-header">
                        <span
                            className="bh-node-type-badge"
                            style={{ background: NODE_COLORS[selectedNode.type] ?? '#555' }}
                        >
                            {selectedNode.type}
                        </span>
                        <strong className="bh-node-name">{selectedNode.name}</strong>
                        <button className="bh-panel-close" onClick={() => setSelected(null)}>✕</button>
                    </div>

                    <div className="bh-node-panel-body">
                        <div className="bh-prop-row">
                            <span>ObjectId</span>
                            <code>{selectedNode.id}</code>
                        </div>
                        {selectedNode.properties &&
                            Object.entries(selectedNode.properties)
                                .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== '')
                                .slice(0, 20)
                                .map(([k, v]) => (
                                    <div key={k} className="bh-prop-row">
                                        <span>{k}</span>
                                        <code>{String(v)}</code>
                                    </div>
                                ))}
                    </div>

                    <div className="bh-node-panel-footer">
                        <span>Outgoing: {graph.edges.filter(e => e.source === selectedNode.id).length}</span>
                        <span>Incoming: {graph.edges.filter(e => e.target === selectedNode.id).length}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BloodHoundGraph;
