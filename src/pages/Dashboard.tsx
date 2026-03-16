import React, { useState } from 'react';
import { Engagement } from '../types';
import EngagementSetup from '../components/EngagementSetup';
import GuidanceChat from '../components/GuidanceChat';
import BloodhoundAnalyzer from '../components/BloodhoundAnalyzer';
import CommandSuggester from '../components/CommandSuggester';
import LabScenarios from '../components/LabScenarios';
import { engagementService } from '../services/engagementService';

type Tab = 'setup' | 'guide' | 'bloodhound' | 'commands' | 'lab';

const Dashboard: React.FC = () => {
    const [engagement, setEngagement] = useState<Engagement | null>(
        engagementService.getEngagement()
    );
    const [activeTab, setActiveTab] = useState<Tab>(engagement ? 'guide' : 'setup');
    const [bloodhoundJson, setBloodhoundJson] = useState('');

    const handleEngagementSaved = (eng: Engagement) => {
        setEngagement(eng);
        setActiveTab('guide');
    };

    return (
        <div className="dashboard">
            <header className="dashboard-header">
                <h1>Pentest Helper</h1>
                {engagement && (
                    <div className="engagement-badge">
                        <span className="badge-label">Active:</span>
                        <span className="badge-value">{engagement.name}</span>
                        <span className="badge-user">{engagementService.getUpn(engagement)}</span>
                        <button
                            className="btn-small"
                            onClick={() => setActiveTab('setup')}
                        >
                            Edit
                        </button>
                    </div>
                )}
            </header>

            <nav className="tab-nav">
                <button
                    className={activeTab === 'setup' ? 'active' : ''}
                    onClick={() => setActiveTab('setup')}
                >
                    Setup
                </button>
                <button
                    className={activeTab === 'guide' ? 'active' : ''}
                    onClick={() => setActiveTab('guide')}
                    disabled={!engagement}
                >
                    AI Guide
                </button>
                <button
                    className={activeTab === 'bloodhound' ? 'active' : ''}
                    onClick={() => setActiveTab('bloodhound')}
                    disabled={!engagement}
                >
                    BloodHound
                </button>
                <button
                    className={activeTab === 'commands' ? 'active' : ''}
                    onClick={() => setActiveTab('commands')}
                    disabled={!engagement}
                >
                    Commands
                </button>
                <button
                    className={activeTab === 'lab' ? 'active' : ''}
                    onClick={() => setActiveTab('lab')}
                >
                    Lab
                </button>
            </nav>

            <main className="tab-content">
                {activeTab === 'setup' && (
                    <EngagementSetup onEngagementSaved={handleEngagementSaved} />
                )}

                {activeTab === 'guide' && engagement && (
                    <GuidanceChat
                        engagement={engagement}
                        bloodhoundJson={bloodhoundJson}
                    />
                )}

                {activeTab === 'bloodhound' && engagement && (
                    <div className="bloodhound-tab">
                        <h2>BloodHound Analysis</h2>
                        <label>
                            Paste BloodHound JSON export:
                            <textarea
                                rows={10}
                                value={bloodhoundJson}
                                onChange={e => setBloodhoundJson(e.target.value)}
                                placeholder='{"nodes": [...], "edges": [...]}'
                            />
                        </label>
                        <BloodhoundAnalyzer results={[]} />
                    </div>
                )}

                {activeTab === 'commands' && engagement && (
                    <CommandSuggester
                        bloodhoundData={bloodhoundJson}
                        userNotes={engagement.notes ?? ''}
                    />
                )}

                {activeTab === 'lab' && (
                    <LabScenarios />
                )}
            </main>
        </div>
    );
};

export default Dashboard;