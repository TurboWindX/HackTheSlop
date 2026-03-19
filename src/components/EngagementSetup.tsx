import React, { useState } from 'react';
import { Engagement, CredEntry, HashEntry, LMStudioConfig } from '../types';
import { engagementService } from '../services/engagementService';
import { aiService, defaultLMStudioConfig } from '../services/aiService';

// ── Hashcat mode reference ───────────────────────────────────────────────────
const HASH_TYPES = [
    { label: 'NTLM',                              mode: '1000'  },
    { label: 'Net-NTLMv1',                        mode: '5500'  },
    { label: 'Net-NTLMv2',                        mode: '5600'  },
    { label: 'Kerberos 5 AS-REQ (pre-auth)',      mode: '7500'  },
    { label: 'Kerberos 5 TGS-REP (Kerberoast)',   mode: '13100' },
    { label: 'Kerberos 5 AS-REP (AS-REP Roast)',  mode: '18200' },
    { label: 'DPAPI masterkey',                   mode: '15900' },
    { label: 'MsCache2 / DCC2',                   mode: '2100'  },
    { label: 'MD5',                               mode: '0'     },
    { label: 'SHA-1',                             mode: '100'   },
    { label: 'SHA-256',                           mode: '1400'  },
    { label: 'bcrypt',                            mode: '3200'  },
    { label: 'Other / Unknown',                   mode: ''      },
];

interface EngagementSetupProps {
    onEngagementSaved: (engagement: Engagement) => void;
}

const EngagementSetup: React.FC<EngagementSetupProps> = ({ onEngagementSaved }) => {
    const existing = engagementService.getEngagement();

    // ── engagement info ──────────────────────────────────────────────────────
    const [name,     setName]     = useState(existing?.name     ?? '');
    const [domain,   setDomain]   = useState(existing?.domain   ?? '');
    const [dcIp,     setDcIp]     = useState(existing?.dcIp     ?? '');
    const [scopeRaw, setScopeRaw] = useState(existing?.scope.join('\n') ?? '');
    const [notes,    setNotes]    = useState(existing?.notes    ?? '');

    // ── credentials ──────────────────────────────────────────────────────────
    const [creds,        setCreds]        = useState<CredEntry[]>(existing?.creds ?? []);
    const [credUser,     setCredUser]     = useState('');
    const [credDom,      setCredDom]      = useState('');
    const [credPass,     setCredPass]     = useState('');
    const [credNote,     setCredNote]     = useState('');
    const [showCredPass, setShowCredPass] = useState(false);

    // ── hashes ───────────────────────────────────────────────────────────────
    const [hashes,    setHashes]    = useState<HashEntry[]>(existing?.hashes ?? []);
    const [hashUser,  setHashUser]  = useState('');
    const [hashDom,   setHashDom]   = useState('');
    const [hashValue, setHashValue] = useState('');
    const [hashType,  setHashType]  = useState('NTLM');
    const [hashMode,  setHashMode]  = useState('1000');
    const [hashNote,  setHashNote]  = useState('');

    // ── LM Studio ────────────────────────────────────────────────────────────
    const [lmPrimary,   setLmPrimary]   = useState(defaultLMStudioConfig.primaryUrl);
    const [lmSecondary, setLmSecondary] = useState(defaultLMStudioConfig.secondaryUrl ?? '');

    const [saved, setSaved] = useState(false);

    // ── handlers ─────────────────────────────────────────────────────────────
    const addCred = () => {
        if (!credUser && !credPass) return;
        const entry: CredEntry = {
            id:       crypto.randomUUID(),
            username: credUser || undefined,
            domain:   credDom  || undefined,
            password: credPass || undefined,
            note:     credNote || undefined,
        };
        setCreds(prev => [...prev, entry]);
        setCredUser(''); setCredDom(''); setCredPass(''); setCredNote('');
    };

    const removeCred = (id: string) => setCreds(prev => prev.filter(c => c.id !== id));

    const addHash = () => {
        if (!hashValue.trim()) return;
        const entry: HashEntry = {
            id:          crypto.randomUUID(),
            username:    hashUser || undefined,
            domain:      hashDom  || undefined,
            hash:        hashValue.trim(),
            hashType,
            hashcatMode: hashMode || undefined,
            note:        hashNote || undefined,
        };
        setHashes(prev => [...prev, entry]);
        setHashUser(''); setHashDom(''); setHashValue(''); setHashNote('');
        setHashType('NTLM'); setHashMode('1000');
    };

    const removeHash = (id: string) => setHashes(prev => prev.filter(h => h.id !== id));

    const handleHashTypeChange = (label: string) => {
        setHashType(label);
        const found = HASH_TYPES.find(t => t.label === label);
        if (found) setHashMode(found.mode);
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();

        const firstCred = creds[0];
        const firstHash = hashes[0];

        const engagement: Engagement = {
            id:        existing?.id ?? crypto.randomUUID(),
            name:      name || `Session ${new Date().toLocaleDateString()}`,
            domain:    domain    || firstCred?.domain   || undefined,
            dcIp:      dcIp      || undefined,
            username:  firstCred?.username || undefined,
            password:  firstCred?.password || undefined,
            ntlmHash:  firstHash?.hash     || undefined,
            creds,
            hashes,
            scope:     engagementService.parseScope(scopeRaw),
            notes:     notes || undefined,
            createdAt: existing?.createdAt ?? new Date(),
        };

        engagementService.setEngagement(engagement);
        aiService.updateConfig({ primaryUrl: lmPrimary, secondaryUrl: lmSecondary || undefined });

        setSaved(true);
        onEngagementSaved(engagement);
        setTimeout(() => setSaved(false), 2500);
    };

    const handleClear = () => {
        engagementService.clearEngagement();
        setName(''); setDomain(''); setDcIp(''); setScopeRaw(''); setNotes('');
        setCreds([]); setHashes([]);
    };

    return (
        <div className="loot-board">

            <div className="loot-title-row">
                <h2>🎯 Loot</h2>
                <p className="loot-hint">Drop creds, hashes, and intel here as you collect them. Everything is optional — save any time.</p>
            </div>

            <form onSubmit={handleSave}>

                {/* ── Engagement Info ─────────────────────────────────── */}
                <div className="loot-section">
                    <h3 className="loot-section-title">Engagement</h3>
                    <div className="loot-row-3">
                        <label className="loot-field">
                            <span>Title</span>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="ACME Corp Internal Pentest" />
                        </label>
                        <label className="loot-field">
                            <span>Domain</span>
                            <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="corp.local" autoComplete="off" />
                        </label>
                        <label className="loot-field">
                            <span>DC IP</span>
                            <input value={dcIp} onChange={e => setDcIp(e.target.value)} placeholder="10.10.10.1" autoComplete="off" />
                        </label>
                    </div>
                    <label className="loot-field loot-field-full">
                        <span>Scope <span className="loot-optional">(one per line or comma-separated)</span></span>
                        <textarea value={scopeRaw} onChange={e => setScopeRaw(e.target.value)} rows={3} placeholder={"10.10.10.0/24\n192.168.1.50"} />
                    </label>
                    <label className="loot-field loot-field-full">
                        <span>Notes</span>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Finance VLAN out of scope, DA found: john.doe..." />
                    </label>
                </div>

                {/* ── Credentials ─────────────────────────────────────── */}
                <div className="loot-section">
                    <h3 className="loot-section-title">Credentials</h3>

                    {creds.length > 0 && (
                        <div className="loot-cards">
                            {creds.map(c => (
                                <div key={c.id} className="loot-card cred-card">
                                    <button type="button" className="loot-card-remove" onClick={() => removeCred(c.id)} title="Remove">✕</button>
                                    <div className="loot-card-line">
                                        <span className="lk">user</span>
                                        <span className="lv">{c.username ?? <em>unknown</em>}</span>
                                    </div>
                                    {c.domain && (
                                        <div className="loot-card-line">
                                            <span className="lk">domain</span>
                                            <span className="lv">{c.domain}</span>
                                        </div>
                                    )}
                                    <div className="loot-card-line">
                                        <span className="lk">pass</span>
                                        <span className="lv">{c.password ? <code>{c.password}</code> : <em>unknown</em>}</span>
                                    </div>
                                    {c.note && <div className="loot-card-line loot-card-note">{c.note}</div>}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="loot-adder">
                        <div className="loot-adder-row">
                            <input className="loot-adder-input" value={credUser} onChange={e => setCredUser(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCred())}
                                placeholder="username (optional)" autoComplete="off" />
                            <input className="loot-adder-input" value={credDom} onChange={e => setCredDom(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCred())}
                                placeholder="domain (optional)" autoComplete="off" />
                            <div className="loot-pw-wrap">
                                <input
                                    className="loot-adder-input"
                                    type={showCredPass ? 'text' : 'password'}
                                    value={credPass}
                                    onChange={e => setCredPass(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCred())}
                                    placeholder="password (optional)"
                                    autoComplete="new-password"
                                />
                                <button type="button" className="loot-pw-toggle" onClick={() => setShowCredPass(p => !p)}>
                                    {showCredPass ? '🙈' : '👁'}
                                </button>
                            </div>
                            <input className="loot-adder-input loot-adder-note" value={credNote} onChange={e => setCredNote(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCred())}
                                placeholder="note (e.g. DA, service acct)" autoComplete="off" />
                            <button type="button" className="loot-adder-btn" onClick={addCred}>+ Add</button>
                        </div>
                    </div>
                </div>

                {/* ── Hashes ──────────────────────────────────────────── */}
                <div className="loot-section">
                    <h3 className="loot-section-title">Hashes</h3>

                    {hashes.length > 0 && (
                        <div className="loot-cards">
                            {hashes.map(h => (
                                <div key={h.id} className="loot-card hash-card">
                                    <button type="button" className="loot-card-remove" onClick={() => removeHash(h.id)} title="Remove">✕</button>
                                    <div className="loot-card-line">
                                        <span className="lk">type</span>
                                        <span className="lv hash-type-label">{h.hashType}{h.hashcatMode ? ` (mode ${h.hashcatMode})` : ''}</span>
                                    </div>
                                    {(h.username || h.domain) && (
                                        <div className="loot-card-line">
                                            <span className="lk">acct</span>
                                            <span className="lv">{[h.domain, h.username].filter(Boolean).join('\\')}</span>
                                        </div>
                                    )}
                                    <div className="loot-card-line">
                                        <span className="lk">hash</span>
                                        <code className="lv hash-value">{h.hash.length > 56 ? h.hash.slice(0, 54) + '…' : h.hash}</code>
                                    </div>
                                    {h.note && <div className="loot-card-line loot-card-note">{h.note}</div>}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="loot-adder">
                        <div className="loot-adder-row">
                            <input className="loot-adder-input" value={hashUser} onChange={e => setHashUser(e.target.value)} placeholder="username (optional)" autoComplete="off" />
                            <input className="loot-adder-input" value={hashDom}  onChange={e => setHashDom(e.target.value)}  placeholder="domain (optional)"   autoComplete="off" />
                        </div>
                        <div className="loot-adder-row loot-adder-hash-row">
                            <input className="loot-adder-input loot-adder-hash" value={hashValue} onChange={e => setHashValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addHash())}
                                placeholder="hash value" autoComplete="off" />
                            <select className="loot-adder-select" value={hashType} onChange={e => handleHashTypeChange(e.target.value)}>
                                {HASH_TYPES.map(t => <option key={t.label} value={t.label}>{t.label}</option>)}
                            </select>
                            <input className="loot-adder-input loot-adder-mode" value={hashMode} onChange={e => setHashMode(e.target.value)}
                                placeholder="hashcat mode" autoComplete="off" title="Hashcat mode number (auto-filled by type)" />
                            <input className="loot-adder-input loot-adder-note" value={hashNote} onChange={e => setHashNote(e.target.value)} placeholder="note" autoComplete="off" />
                            <button type="button" className="loot-adder-btn" onClick={addHash}>+ Add</button>
                        </div>
                    </div>
                </div>

                {/* ── LM Studio ───────────────────────────────────────── */}
                <div className="loot-section">
                    <h3 className="loot-section-title">LM Studio</h3>
                    <div className="loot-row-2">
                        <label className="loot-field">
                            <span>Primary URL <span className="loot-optional">(this machine)</span></span>
                            <input value={lmPrimary} onChange={e => setLmPrimary(e.target.value)} placeholder="http://localhost:1234" />
                        </label>
                        <label className="loot-field">
                            <span>Secondary URL <span className="loot-optional">(fallback)</span></span>
                            <input value={lmSecondary} onChange={e => setLmSecondary(e.target.value)} placeholder="http://192.168.1.50:1234" />
                        </label>
                    </div>
                </div>

                <div className="loot-actions">
                    <button type="submit" className="btn-primary">{saved ? '✓ Saved!' : 'Save'}</button>
                    <button type="button" className="btn-danger" onClick={handleClear}>Clear Session</button>
                </div>

            </form>
        </div>
    );
};

export default EngagementSetup;