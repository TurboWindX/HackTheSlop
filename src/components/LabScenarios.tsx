import React, { useState, useRef, useCallback, useEffect } from 'react';
import { labScenarios, LabScenario } from '../data/labScenarios';

// ── Spoiler component ─────────────────────────────────────────────────────────
const Spoiler: React.FC<{ text: string }> = ({ text }) => {
    const [shown, setShown] = useState(false);
    return (
        <span
            className={`spoiler ${shown ? 'spoiler-revealed' : 'spoiler-hidden'}`}
            onClick={(e) => { e.stopPropagation(); setShown(v => !v); }}
            title={shown ? 'Click to hide' : 'Click to reveal'}
        >
            {shown ? text : '••••••••'}
        </span>
    );
};

type LabState = 'idle' | 'launching' | 'destroying' | 'done' | 'error';

const LabScenarios: React.FC = () => {
    const [selected, setSelected] = useState<LabScenario | null>(null);
    const [copied, setCopied] = useState('');
    const [labState, setLabState] = useState<LabState>('idle');
    const [output, setOutput] = useState('');
    const [confirmDestroy, setConfirmDestroy] = useState(false);
    const outputRef = useRef<HTMLPreElement>(null);

    const copyToClipboard = (text: string, key: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(''), 1500);
        });
    };

    // On scenario select, check whether a job is already running server-side and
    // reconnect to its buffered log stream so a page refresh doesn't lose output.
    useEffect(() => {
        if (!selected) return;
        let cancelled = false;

        const reconnect = async () => {
            try {
                const res = await fetch(`/api/lab/logs?dir=${encodeURIComponent(selected.launchDir)}`);
                if (!res.ok || !res.body) return;   // 404 = no active job, that's fine

                // Job exists — treat it as a reconnect
                setLabState('launching');
                setOutput('');

                const reader = res.body.getReader();
                const decoder = new TextDecoder();
                while (!cancelled) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    setOutput(prev => prev + chunk);
                    if (outputRef.current) {
                        outputRef.current.scrollTop = outputRef.current.scrollHeight;
                    }
                }
                if (!cancelled) setLabState('done');
            } catch {
                // Network error — no active job or server not running, silently ignore
            }
        };

        reconnect();
        return () => { cancelled = true; };
    }, [selected?.launchDir]);

    const runVagrant = useCallback(async (scenario: LabScenario, action: 'launch' | 'destroy') => {
        setLabState(action === 'launch' ? 'launching' : 'destroying');
        setOutput('');
        setConfirmDestroy(false);

        try {
            const res = await fetch(`/api/lab/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ launchDir: scenario.launchDir }),
            });

            if (!res.ok || !res.body) {
                setOutput(`[Error] HTTP ${res.status} — Is Vite running in dev mode?`);
                setLabState('error');
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                setOutput(prev => prev + chunk);
                if (outputRef.current) {
                    outputRef.current.scrollTop = outputRef.current.scrollHeight;
                }
            }
            setLabState('done');
        } catch (err: unknown) {
            setOutput(`[Error] ${err instanceof Error ? err.message : String(err)}`);
            setLabState('error');
        }
    }, []);

    const launchCmd = (s: LabScenario) =>
        s.launchDir === '.'
            ? 'cd lab && vagrant up'
            : `cd lab/${s.launchDir} && vagrant up`;

    const destroyCmd = (s: LabScenario) =>
        s.launchDir === '.'
            ? 'cd lab && vagrant destroy -f'
            : `cd lab/${s.launchDir} && vagrant destroy -f`;

    return (
        <div className="lab-scenarios">
            <div className="lab-header">
                <h2>AD Lab Scenarios</h2>
                <p className="lab-subtitle">
                    Select a focused scenario to spin up — or use the interactive launcher: <code>cd lab &amp;&amp; .\launch.ps1</code>
                </p>
            </div>

            <div className="scenario-grid">
                {labScenarios.map(s => (
                    <div
                        key={s.id}
                        className={`scenario-card ${selected?.id === s.id ? 'selected' : ''}`}
                        style={{ borderColor: s.color }}
                        onClick={() => setSelected(selected?.id === s.id ? null : s)}
                    >
                        <div className="scenario-card-header">
                            <h3 style={{ color: s.color }}>{s.name}</h3>
                            <div className="scenario-meta">
                                <span className="meta-chip">{s.vms.length} VM{s.vms.length > 1 ? 's' : ''}</span>
                                <span className="meta-chip">{s.ramGB} GB RAM</span>
                                <span className="meta-chip">~{s.provisionMinutes} min</span>
                            </div>
                        </div>
                        <p className="scenario-tagline">{s.tagline}</p>
                        <div className="scenario-vms">
                            {s.vms.map(vm => (
                                <div key={vm.name} className="vm-badge">
                                    <span className="vm-name">{vm.name}</span>
                                    <span className="vm-ip">{vm.ip}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {selected && (
                <div className="scenario-detail">
                    <div className="detail-header" style={{ borderColor: selected.color }}>
                        <h3 style={{ color: selected.color }}>{selected.name}</h3>
                        <button className="btn-small" onClick={() => setSelected(null)}>✕ Close</button>
                    </div>

                    {/* ── Scope ───────────────────────────────────────────── */}
                    <div className="detail-section scope-section">
                        <h4>Scope</h4>
                        <code className="scope-range">{selected.scope.description}</code>
                        <div className="scope-ips">
                            {selected.scope.ranges.map(r => (
                                <span key={r} className="scope-ip-chip">{r}</span>
                            ))}
                        </div>
                    </div>

                    {/* ── Assumed Breach ──────────────────────────────────── */}
                    <div className="detail-section breach-section">
                        <h4>Assumed Breach</h4>
                        <p className="breach-note">{selected.assumedBreach.note}</p>
                        <div className="breach-creds">
                            <div className="cred-row">
                                <span className="cred-label">Domain</span>
                                <code className="cred-value">{selected.assumedBreach.domain}</code>
                            </div>
                            <div className="cred-row">
                                <span className="cred-label">Username</span>
                                <code className="cred-value">{selected.assumedBreach.user}</code>
                                <button className="btn-copy" onClick={() => copyToClipboard(selected.assumedBreach.user, 'breach-user')}>
                                    {copied === 'breach-user' ? '✓' : 'Copy'}
                                </button>
                            </div>
                            <div className="cred-row">
                                <span className="cred-label">Password</span>
                                <Spoiler text={selected.assumedBreach.pass} />
                                <button className="btn-copy" onClick={() => copyToClipboard(selected.assumedBreach.pass, 'breach-pass')}>
                                    {copied === 'breach-pass' ? '✓' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* ── Launch Lab ──────────────────────────────────────── */}
                    <div className="detail-section">
                        <h4>Launch Lab</h4>
                        <div className="launch-actions">
                            <button
                                className={`btn-launch ${labState === 'launching' ? 'running' : ''}`}
                                disabled={labState === 'launching' || labState === 'destroying'}
                                onClick={() => runVagrant(selected, 'launch')}
                            >
                                {labState === 'launching' ? '⟳  Launching…' : '▶  Launch Lab'}
                            </button>

                            {!confirmDestroy ? (
                                <button
                                    className="btn-destroy"
                                    disabled={labState === 'launching' || labState === 'destroying'}
                                    onClick={() => setConfirmDestroy(true)}
                                >
                                    {labState === 'destroying' ? '⟳  Destroying…' : '■  Destroy'}
                                </button>
                            ) : (
                                <span className="destroy-confirm">
                                    <span>Destroy all VMs?</span>
                                    <button className="btn-destroy" onClick={() => runVagrant(selected, 'destroy')}>
                                        Yes, destroy
                                    </button>
                                    <button className="btn-small" onClick={() => setConfirmDestroy(false)}>Cancel</button>
                                </span>
                            )}

                            <div className="launch-manual">
                                <code>{launchCmd(selected)}</code>
                                <button className="btn-copy" onClick={() => copyToClipboard(launchCmd(selected), 'launch-cmd')}>
                                    {copied === 'launch-cmd' ? '✓' : 'Copy'}
                                </button>
                            </div>
                        </div>

                        {(output || labState === 'launching' || labState === 'destroying') && (
                            <div className="lab-terminal-wrap">
                                <div className={`lab-terminal-status ${labState}`}>
                                    {labState === 'launching'  && '● Launching…'}
                                    {labState === 'destroying' && '● Destroying…'}
                                    {labState === 'done'       && '✓ Done'}
                                    {labState === 'error'      && '✗ Error'}
                                </div>
                                <pre ref={outputRef} className="lab-terminal">{output || ' '}</pre>
                            </div>
                        )}
                    </div>

                    {/* ── VMs ─────────────────────────────────────────────── */}
                    <div className="detail-section">
                        <h4>Virtual Machines</h4>
                        <table className="vm-table">
                            <thead>
                                <tr><th>Host</th><th>IP</th><th>Role</th></tr>
                            </thead>
                            <tbody>
                                {selected.vms.map(vm => (
                                    <tr key={vm.name}>
                                        <td className="vm-name-cell">{vm.name}</td>
                                        <td><code>{vm.ip}</code></td>
                                        <td>{vm.role}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ── Techniques ──────────────────────────────────────── */}
                    <div className="detail-section">
                        <h4>Attack Techniques</h4>
                        {selected.techniques.map(group => (
                            <div key={group.category} className="technique-group">
                                <div className="technique-category">{group.category}</div>
                                <ul className="technique-list">
                                    {group.items.map((item, i) => <li key={i}>{item}</li>)}
                                </ul>
                            </div>
                        ))}
                    </div>

                    {/* ── Key Accounts ────────────────────────────────────── */}
                    {selected.accounts.length > 0 && (
                        <div className="detail-section">
                            <h4>
                                Key Accounts
                                <span className="spoiler-hint">(click password to reveal)</span>
                            </h4>
                            <table className="vm-table">
                                <thead>
                                    <tr><th>Username</th><th>Password</th><th>Vulnerability</th></tr>
                                </thead>
                                <tbody>
                                    {selected.accounts.map(acc => (
                                        <tr key={acc.user}>
                                            <td><code>{acc.user}</code></td>
                                            <td><Spoiler text={acc.pass} /></td>
                                            <td className="vuln-cell">{acc.vuln}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ── Tools ───────────────────────────────────────────── */}
                    <div className="detail-section">
                        <h4>Recommended Tools</h4>
                        <div className="tool-chips">
                            {selected.tools.map(t => (
                                <span key={t} className="tool-chip">{t}</span>
                            ))}
                        </div>
                    </div>

                    {/* ── Destroy cmd (copy-only) ──────────────────────────── */}
                    <div className="detail-section">
                        <h4>Destroy Command</h4>
                        <div className="cmd-row">
                            <code>{destroyCmd(selected)}</code>
                            <button className="btn-copy" onClick={() => copyToClipboard(destroyCmd(selected), 'destroy-cmd')}>
                                {copied === 'destroy-cmd' ? '✓' : 'Copy'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LabScenarios;
