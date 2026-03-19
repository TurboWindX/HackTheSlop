import React from 'react';
import CommandSuggester from '../components/CommandSuggester';

// This standalone page is superseded by the Dashboard Commands tab.
const Suggestions: React.FC = () => (
    <div style={{ padding: '24px' }}>
        <CommandSuggester />
    </div>
);

export default Suggestions;