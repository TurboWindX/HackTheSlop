import React, { useState } from 'react';
import { aiService } from '../services/aiService';
import { pentestPhases } from '../data/phases';
import { kerberosCommands } from '../data/kerberos';
import { adcsCommands } from '../data/adcs';
import { lateralMovementCommands } from '../data/lateral';
import { mssqlCommands } from '../data/mssql';
import { Engagement } from '../types';

interface CommandSuggesterProps {
    bloodhoundData?: string;
    userNotes?: string;
    engagement?: Engagement | null;
}

// ── static reference data ────────────────────────────────────────────────────
const REFERENCE_CATEGORIES = [
    { id: 'all',      label: 'All'            },
    { id: 'kerberos', label: 'Kerberos'       },
    { id: 'adcs',     label: 'ADCS'           },
    { id: 'lateral',  label: 'Lateral Movement'},
    { id: 'mssql',    label: 'MSSQL'          },
] as const;

type CatId = typeof REFERENCE_CATEGORIES[number]['id'];

interface RefEntry {
    category: CatId;
    name: string;
    description: string;
    command: string;
}

function buildRefEntries(): RefEntry[] {
    const entries: RefEntry[] = [];

    // kerberos: flat commands array {name, description, command}
    for (const c of kerberosCommands.commands) {
        entries.push({ category: 'kerberos', name: c.name, description: c.description, command: c.command });
    }

    // adcs: category groups, each {description, commands: string[]}
    for (const [groupKey, group] of Object.entries(adcsCommands) as [string, { description: string; commands: string[] }][]) {
        const groupName = groupKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        for (const cmd of group.commands) {
            entries.push({ category: 'adcs', name: `ADCS ${groupName}`, description: group.description, command: cmd });
        }
    }

    // lateral: techniques array, each {name, description, commands: string[]}
    for (const tech of lateralMovementCommands.techniques) {
        for (const cmd of tech.commands) {
            entries.push({ category: 'lateral', name: tech.name, description: tech.description, command: cmd });
        }
    }

    // mssql: category groups with string[] values
    for (const [groupKey, cmds] of Object.entries(mssqlCommands) as [string, string[]][]) {
        const groupName = groupKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
        for (const cmd of cmds) {
            entries.push({ category: 'mssql', name: `MSSQL ${groupName}`, description: '', command: cmd });
        }
    }

    return entries;
}

const ALL_REF_ENTRIES = buildRefEntries();

function applyVars(template: string, eng: Engagement | null | undefined): string {
    if (!eng) return template;
    const firstCred = eng.creds?.[0];
    const firstHash = eng.hashes?.[0];
    return template
        .replace(/{{DOMAIN}}/g,    eng.domain   || firstCred?.domain   || 'DOMAIN')
        .replace(/{{DC_IP}}/g,     eng.dcIp                            || 'DC_IP')
        .replace(/{{USERNAME}}/g,  eng.username  || firstCred?.username || 'USERNAME')
        .replace(/{{PASSWORD}}/g,  eng.password  || firstCred?.password || 'PASSWORD')
        .replace(/{{NTLM_HASH}}/g, eng.ntlmHash  || firstHash?.hash    || 'NTLM_HASH')
        .replace(/{{TARGET}}/g,    eng.dcIp                            || 'TARGET')
        .replace(/{{UPN}}/g,       eng.username  ? `${eng.username}@${eng.domain ?? 'DOMAIN'}` : 'UPN');
}

const CommandSuggester: React.FC<CommandSuggesterProps> = ({ bloodhoundData, userNotes, engagement }) => {
    const [technique, setTechnique]   = useState('');
    const [output, setOutput]         = useState('');
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState<string | null>(null);

    // ── reference panel state ────────────────────────────────────────────────
    const [activeCategory, setActiveCategory] = useState<CatId>('all');
    const [search, setSearch]                 = useState('');
    const [copied, setCopied]                 = useState<string | null>(null);

    const handleGenerate = async () => {
        if (!technique) return;
        setLoading(true);
        setError(null);
        setOutput('');
        try {
            const context = [
                bloodhoundData ? `BloodHound data:\n${bloodhoundData.slice(0, 2000)}` : '',
                userNotes      ? `Notes:\n${userNotes}` : '',
            ].filter(Boolean).join('\n\n');
            const result = await aiService.generateCommands(technique, context || undefined);
            setOutput(result);
        } catch (err: any) {
            setError(err.message ?? 'Failed to reach LM Studio.');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(id);
            setTimeout(() => setCopied(null), 1800);
        });
    };

    const allTechniques = pentestPhases.map(p => ({ id: p.id, name: p.name }));

    const filtered = ALL_REF_ENTRIES.filter(e => {
        const catMatch = activeCategory === 'all' || e.category === activeCategory;
        const q = search.toLowerCase();
        const textMatch = !q || e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.command.toLowerCase().includes(q);
        return catMatch && textMatch;
    });

    return (
        <div className="command-suggester">

            {/* ── AI Generator ────────────────────────────────────────── */}
            <h2>AI Command Generator</h2>
            <div className="suggester-controls">
                <select value={technique} onChange={e => setTechnique(e.target.value)}>
                    <option value="">-- Select a technique --</option>
                    {allTechniques.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                </select>
                <button
                    className="btn-primary"
                    onClick={handleGenerate}
                    disabled={!technique || loading}
                >
                    {loading ? 'Generating…' : 'Generate Commands'}
                </button>
            </div>
            {error  && <div className="chat-error">{error}</div>}
            {output && <pre className="command-output">{output}</pre>}

            {/* ── Static Reference ────────────────────────────────────── */}
            <div className="ref-section">
                <h2 className="ref-heading">Command Reference</h2>
                <p className="ref-subheading">
                    All commands below are pre-filled with your current engagement vars.
                    {engagement ? null : <span className="ref-no-eng"> (Save loot to auto-fill vars)</span>}
                </p>

                <div className="ref-controls">
                    <div className="ref-cats">
                        {REFERENCE_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                className={`ref-cat-btn${activeCategory === cat.id ? ' active' : ''}`}
                                onClick={() => setActiveCategory(cat.id)}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>
                    <input
                        className="ref-search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Filter commands…"
                    />
                </div>

                <div className="ref-cards">
                    {filtered.length === 0 && (
                        <div className="ref-empty">No commands match your filter.</div>
                    )}
                    {filtered.map((entry, idx) => {
                        const resolved = applyVars(entry.command, engagement);
                        const cardId   = `${entry.category}-${idx}`;
                        return (
                            <div key={cardId} className={`ref-card ref-card-${entry.category}`}>
                                <div className="ref-card-header">
                                    <span className="ref-card-name">{entry.name}</span>
                                    <span className={`ref-tag ref-tag-${entry.category}`}>{entry.category}</span>
                                </div>
                                <p className="ref-card-desc">{entry.description}</p>
                                <div className="ref-cmd-row">
                                    <code className="ref-cmd">{resolved}</code>
                                    <button
                                        className={`ref-copy-btn${copied === cardId ? ' copied' : ''}`}
                                        onClick={() => handleCopy(resolved, cardId)}
                                        title="Copy to clipboard"
                                    >
                                        {copied === cardId ? '✓' : '⎘'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
};

export default CommandSuggester;