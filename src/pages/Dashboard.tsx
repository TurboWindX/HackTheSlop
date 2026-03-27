import React, { useState, useRef } from 'react';
import { Engagement } from '../types';
import EngagementSetup from '../components/EngagementSetup';
import GuidanceChat from '../components/GuidanceChat';
import BloodhoundAnalyzer from '../components/BloodhoundAnalyzer';
import CommandSuggester from '../components/CommandSuggester';
import LabScenarios from '../components/LabScenarios';
import { engagementService } from '../services/engagementService';
import JSZip from 'jszip';

// ── BloodHound tab — ZIP upload + JSON paste ─────────────────────────────────
const BloodHoundTab: React.FC<{ onJsonParsed: (json: string) => void }> = ({ onJsonParsed }) => {
    const [rawJson, setRawJson] = useState('');
    const [status, setStatus]   = useState('');
    const [error, setError]     = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const handleZip = async (file: File) => {
        setError('');
        setStatus('Extracting ZIP…');
        try {
            const zip   = await JSZip.loadAsync(file);
            const parts: object[] = [];

            const jobs = Object.values(zip.files).filter(f =>
                !f.dir && f.name.toLowerCase().endsWith('.json')
            ).map(async f => {
                const text = await f.async('string');
                try {
                    const parsed = JSON.parse(text);
                    // BloodHound CE: each file has { data: [...], meta: { type: 'users', … } }
                    if (parsed.data && Array.isArray(parsed.data)) {
                        const bhType = parsed.meta?.type ?? '';
                        parts.push(...parsed.data.map((o: any) => ({ ...o, _bhType: bhType })));
                    } else if (Array.isArray(parsed)) {
                        parts.push(...parsed);
                    } else {
                        parts.push(parsed);
                    }
                } catch { /* skip non-JSON */ }
            });

            await Promise.all(jobs);
            const merged = JSON.stringify(parts);
            setRawJson(merged);
            onJsonParsed(merged);
            setStatus(`✓ Loaded ${parts.length} objects from ${Object.keys(zip.files).filter(n => n.endsWith('.json')).length} JSON files`);
        } catch (e: any) {
            setError('Failed to read ZIP: ' + e.message);
            setStatus('');
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.name.endsWith('.zip')) {
            handleZip(f);
        } else if (f.name.endsWith('.json')) {
            const reader = new FileReader();
            reader.onload = ev => {
                const text = ev.target?.result as string ?? '';
                setRawJson(text);
                onJsonParsed(text);
                setStatus('✓ JSON file loaded');
            };
            reader.readAsText(f);
        } else {
            setError('Please upload a .zip or .json file');
        }
    };

    const handlePaste = (text: string) => {
        setRawJson(text);
        onJsonParsed(text);
        setStatus('');
        setError('');
    };

    return (
        <div className="bloodhound-tab">
            <h2>BloodHound Analysis</h2>

            <div className="bh-upload-row">
                <label className="bh-upload-btn">
                    📂 Upload ZIP or JSON
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".zip,.json"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                </label>
                {status && <span className="bh-status ok">{status}</span>}
                {error  && <span className="bh-status err">{error}</span>}
            </div>

            <label className="bh-paste-label">
                Or paste raw BloodHound JSON:
                <textarea
                    className="bh-paste"
                    rows={6}
                    value={rawJson}
                    onChange={e => handlePaste(e.target.value)}
                    placeholder='{"nodes": [...]} or raw array'
                />
            </label>

            {/* Pass raw JSON so the analyzer can render both the graph and the node list */}
            <BloodhoundAnalyzer results={rawJson} />
        </div>
    );
};

type Tab = 'loot' | 'guide' | 'bloodhound' | 'commands' | 'lab';

const Dashboard: React.FC = () => {
    const [engagement, setEngagement] = useState<Engagement | null>(
        engagementService.getEngagement()
    );
    const [activeTab, setActiveTab] = useState<Tab>('guide');
    const [bloodhoundJson, setBloodhoundJson] = useState('');

    const handleEngagementSaved = (eng: Engagement) => {
        setEngagement(eng);
    };

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <h1>TurboHax</h1>
                {engagement && (
                    <div className="engagement-badge">
                        <span className="badge-label">Loot:</span>
                        <span className="badge-value">{engagement.name}</span>
                        <span className="badge-user">{engagementService.getUpn(engagement)}</span>
                        <button
                            className="btn-small"
                            onClick={() => setActiveTab('loot')}
                        >
                            Edit
                        </button>
                    </div>
                )}
            </header>

            <nav className="tab-nav">
                <button
                    className={activeTab === 'loot' ? 'active' : ''}
                    onClick={() => setActiveTab('loot')}
                >
                    🎯 Loot
                </button>
                <button
                    className={activeTab === 'guide' ? 'active' : ''}
                    onClick={() => setActiveTab('guide')}
                >
                    🧙 Sherpa
                </button>
                <button
                    className={activeTab === 'bloodhound' ? 'active' : ''}
                    onClick={() => setActiveTab('bloodhound')}
                >
                    🩸 BloodHound
                </button>
                <button
                    className={activeTab === 'commands' ? 'active' : ''}
                    onClick={() => setActiveTab('commands')}
                >
                    ⚡ Commands
                </button>
                <button
                    className={activeTab === 'lab' ? 'active' : ''}
                    onClick={() => setActiveTab('lab')}
                >
                    🖥️ Lab
                </button>
            </nav>

            <main className="tab-content">
                {activeTab === 'loot' && (
                    <EngagementSetup onEngagementSaved={handleEngagementSaved} />
                )}

                {activeTab === 'guide' && (
                    <GuidanceChat engagement={engagement} bloodhoundJson={bloodhoundJson} />
                )}

                {activeTab === 'bloodhound' && (
                    <BloodHoundTab onJsonParsed={setBloodhoundJson} />
                )}

                {activeTab === 'commands' && (
                    <CommandSuggester bloodhoundData={bloodhoundJson} userNotes={engagement?.notes ?? ''} engagement={engagement} />
                )}

                {activeTab === 'lab' && (
                    <LabScenarios />
                )}
            </main>
        </div>
    );
};

export default Dashboard;