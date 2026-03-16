import React from 'react';
import { BloodhoundResult } from '../types';
import { parseBloodhoundResults } from '../services/bloodhoundParser';

interface BloodhoundAnalyzerProps {
    results: BloodhoundResult[] | string;
}

const BloodhoundAnalyzer: React.FC<BloodhoundAnalyzerProps> = ({ results }) => {
    const analyzedData = typeof results === 'string'
        ? parseBloodhoundResults(results)
        : results;

    if (!analyzedData || analyzedData.length === 0) return null;

    return (
        <div className="bloodhound-analyzer-results">
            <h2>Parsed Findings ({analyzedData.length})</h2>
            <ul>
                {analyzedData.map((data, index) => (
                    <li key={index} className={`type-${data.type}`}>
                        <strong>[{data.type}]</strong> {data.name}
                        {data.details && <span style={{ color: 'var(--text-dim)' }}> — {data.details}</span>}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default BloodhoundAnalyzer;