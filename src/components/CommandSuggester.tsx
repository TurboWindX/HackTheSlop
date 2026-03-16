import React, { useState } from 'react';
import { aiService } from '../services/aiService';
import { pentestPhases } from '../data/phases';

interface CommandSuggesterProps {
    bloodhoundData?: string;
    userNotes?: string;
}

const CommandSuggester: React.FC<CommandSuggesterProps> = ({ bloodhoundData, userNotes }) => {
    const [technique, setTechnique]   = useState('');
    const [output, setOutput]         = useState('');
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState<string | null>(null);

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

    // Flatten all technique names from phases for the dropdown
    const allTechniques = pentestPhases.map(p => ({ id: p.id, name: p.name }));

    return (
        <div className="command-suggester">
            <h2>Command Generator</h2>
            <div className="suggester-controls">
                <select
                    value={technique}
                    onChange={e => setTechnique(e.target.value)}
                >
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
            {error && <div className="chat-error">{error}</div>}
            {output && (
                <pre className="command-output">{output}</pre>
            )}
        </div>
    );
};

export default CommandSuggester;