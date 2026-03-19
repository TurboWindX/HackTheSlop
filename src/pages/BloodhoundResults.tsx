import React from 'react';
import BloodhoundAnalyzer from '../components/BloodhoundAnalyzer';

// BloodHound analysis is handled via the Dashboard's BloodHound tab.
// This page is kept as a simple redirect wrapper.
const BloodhoundResults: React.FC = () => {
    return (
        <div>
            <h1>BloodHound Results</h1>
            <BloodhoundAnalyzer results={[]} />
        </div>
    );
};

export default BloodhoundResults;
