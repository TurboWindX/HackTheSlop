import React, { useState } from 'react';
import { Engagement, LMStudioConfig } from '../types';
import { engagementService } from '../services/engagementService';
import { aiService, defaultLMStudioConfig } from '../services/aiService';

interface EngagementSetupProps {
    onEngagementSaved: (engagement: Engagement) => void;
}

const EngagementSetup: React.FC<EngagementSetupProps> = ({ onEngagementSaved }) => {
    const existing = engagementService.getEngagement();

    const [name, setName]         = useState(existing?.name ?? '');
    const [username, setUsername] = useState(existing?.username ?? '');
    const [domain, setDomain]     = useState(existing?.domain ?? '');
    const [password, setPassword] = useState(existing?.password ?? '');
    const [ntlmHash, setNtlmHash] = useState(existing?.ntlmHash ?? '');
    const [dcIp, setDcIp]         = useState(existing?.dcIp ?? '');
    const [scopeRaw, setScopeRaw] = useState(existing?.scope.join('\n') ?? '');
    const [notes, setNotes]       = useState(existing?.notes ?? '');

    const [lmPrimary, setLmPrimary]     = useState(defaultLMStudioConfig.primaryUrl);
    const [lmSecondary, setLmSecondary] = useState(defaultLMStudioConfig.secondaryUrl ?? '');
    const [showPassword, setShowPassword] = useState(false);

    const [saved, setSaved] = useState(false);

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();

        const engagement: Engagement = {
            id:        crypto.randomUUID(),
            name:      name || `Engagement ${new Date().toLocaleDateString()}`,
            username,
            domain,
            password,
            ntlmHash:  ntlmHash || undefined,
            dcIp:      dcIp || undefined,
            scope:     engagementService.parseScope(scopeRaw),
            notes:     notes || undefined,
            createdAt: new Date(),
        };

        engagementService.setEngagement(engagement);

        const lmConfig: Partial<LMStudioConfig> = {
            primaryUrl:   lmPrimary,
            secondaryUrl: lmSecondary || undefined,
        };
        aiService.updateConfig(lmConfig);

        setSaved(true);
        onEngagementSaved(engagement);
        setTimeout(() => setSaved(false), 3000);
    };

    const handleClear = () => {
        engagementService.clearEngagement();
        setName(''); setUsername(''); setDomain(''); setPassword('');
        setNtlmHash(''); setDcIp(''); setScopeRaw(''); setNotes('');
    };

    return (
        <div className="engagement-setup">
            <h2>Engagement Setup</h2>
            <p className="hint">
                Credentials are saved to localStorage and persist across reloads. Use <strong>Clear Session</strong> at end of engagement, or wipe the browser profile.
            </p>
            <form onSubmit={handleSave}>
                <section>
                    <h3>Engagement Info</h3>
                    <label>
                        Name
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. ACME Corp Internal Pentest"
                        />
                    </label>
                </section>

                <section>
                    <h3>Credentials</h3>
                    <label>
                        Username
                        <input
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            placeholder="alex  (or alex@mydomain.local)"
                            required
                            autoComplete="off"
                        />
                    </label>
                    <label>
                        Domain
                        <input
                            type="text"
                            value={domain}
                            onChange={e => setDomain(e.target.value)}
                            placeholder="mydomain.local"
                            required
                            autoComplete="off"
                        />
                    </label>
                    <label>
                        Password
                        <div className="password-row">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Testpass123"
                                required
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="toggle-pw"
                                onClick={() => setShowPassword(p => !p)}
                            >
                                {showPassword ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </label>
                    <label>
                        NTLM Hash <span className="optional">(optional — fill in after obtaining)</span>
                        <input
                            type="text"
                            value={ntlmHash}
                            onChange={e => setNtlmHash(e.target.value)}
                            placeholder="aad3b435b51404eeaad3b435b51404ee:..."
                            autoComplete="off"
                        />
                    </label>
                    <label>
                        Domain Controller IP
                        <input
                            type="text"
                            value={dcIp}
                            onChange={e => setDcIp(e.target.value)}
                            placeholder="10.10.10.1"
                            autoComplete="off"
                        />
                    </label>
                </section>

                <section>
                    <h3>Scope</h3>
                    <label>
                        In-scope IPs / CIDRs <span className="hint-small">(one per line or comma-separated)</span>
                        <textarea
                            value={scopeRaw}
                            onChange={e => setScopeRaw(e.target.value)}
                            rows={5}
                            placeholder={"10.10.10.0/24\n192.168.20.3\n10.134.20.5"}
                        />
                    </label>
                </section>

                <section>
                    <h3>Notes</h3>
                    <label>
                        Engagement notes / context
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={4}
                            placeholder="e.g. Finance VLAN is out of scope, avoid 10.10.10.50..."
                        />
                    </label>
                </section>

                <section>
                    <h3>LM Studio Config</h3>
                    <label>
                        Primary URL <span className="hint-small">(this machine)</span>
                        <input
                            type="text"
                            value={lmPrimary}
                            onChange={e => setLmPrimary(e.target.value)}
                            placeholder="http://localhost:1234"
                        />
                    </label>
                    <label>
                        Secondary URL <span className="hint-small">(second machine — optional fallback)</span>
                        <input
                            type="text"
                            value={lmSecondary}
                            onChange={e => setLmSecondary(e.target.value)}
                            placeholder="http://192.168.1.50:1234"
                        />
                    </label>
                </section>

                <div className="form-actions">
                    <button type="submit" className="btn-primary">
                        {saved ? 'Saved!' : 'Save Engagement'}
                    </button>
                    <button type="button" className="btn-danger" onClick={handleClear}>
                        Clear Session
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EngagementSetup;
