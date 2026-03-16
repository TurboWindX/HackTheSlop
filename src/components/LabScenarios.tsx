import React, { useState } from 'react';
import { labScenarios, LabScenario } from '../data/labScenarios';

const LabScenarios: React.FC = () => {
    const [selected, setSelected] = useState<LabScenario | null>(null);
    const [copied, setCopied] = useState('');

    const copyToClipboard = (text: string, key: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(''), 1500);
        });
    };

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
                    Select a focused scenario to spin up — or use the interactive launcher: <code>cd lab && .\launch.ps1</code>
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
                        <button
                            className="btn-small"
                            onClick={() => setSelected(null)}
                        >
                            ✕ Close
                        </button>
                    </div>

                    {/* Launch commands */}
                    <div className="detail-section">
                        <h4>Launch</h4>
                        <div className="cmd-block">
                            <div className="cmd-row">
                                <code>{launchCmd(selected)}</code>
                                <button
                                    className="btn-copy"
                                    onClick={() => copyToClipboard(launchCmd(selected), 'launch')}
                                >
                                    {copied === 'launch' ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <div className="cmd-row">
                                <code>{destroyCmd(selected)}</code>
                                <button
                                    className="btn-copy"
                                    onClick={() => copyToClipboard(destroyCmd(selected), 'destroy')}
                                >
                                    {copied === 'destroy' ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <div className="cmd-row">
                                <code>cd lab && .\\launch.ps1</code>
                                <button
                                    className="btn-copy"
                                    onClick={() => copyToClipboard('cd lab && .\\launch.ps1', 'launcher')}
                                >
                                    {copied === 'launcher' ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* VMs */}
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

                    {/* Techniques */}
                    <div className="detail-section">
                        <h4>Attack Techniques</h4>
                        {selected.techniques.map(group => (
                            <div key={group.category} className="technique-group">
                                <div className="technique-category">{group.category}</div>
                                <ul className="technique-list">
                                    {group.items.map((item, i) => (
                                        <li key={i}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    {/* Accounts */}
                    {selected.accounts.length > 0 && (
                        <div className="detail-section">
                            <h4>Key Accounts</h4>
                            <table className="vm-table">
                                <thead>
                                    <tr><th>Username</th><th>Password</th><th>Vulnerability</th></tr>
                                </thead>
                                <tbody>
                                    {selected.accounts.map(acc => (
                                        <tr key={acc.user}>
                                            <td><code>{acc.user}</code></td>
                                            <td><code>{acc.pass}</code></td>
                                            <td className="vuln-cell">{acc.vuln}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Tools */}
                    <div className="detail-section">
                        <h4>Recommended Tools</h4>
                        <div className="tool-chips">
                            {selected.tools.map(t => (
                                <span key={t} className="tool-chip">{t}</span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LabScenarios;
