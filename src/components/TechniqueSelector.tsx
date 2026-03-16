import React, { useState } from 'react';

const techniques = [
    { id: 'adcs', name: 'Active Directory Certificate Services (ADCS)' },
    { id: 'mssql', name: 'Microsoft SQL Server' },
    { id: 'kerberos', name: 'Kerberos Authentication' },
    { id: 'lateral', name: 'Lateral Movement' },
];

const TechniqueSelector = ({ onSelect }) => {
    const [selectedTechnique, setSelectedTechnique] = useState('');

    const handleChange = (event) => {
        const techniqueId = event.target.value;
        setSelectedTechnique(techniqueId);
        onSelect(techniqueId);
    };

    return (
        <div>
            <label htmlFor="technique-selector">Select a Technique:</label>
            <select id="technique-selector" value={selectedTechnique} onChange={handleChange}>
                <option value="">--Choose a technique--</option>
                {techniques.map((technique) => (
                    <option key={technique.id} value={technique.id}>
                        {technique.name}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default TechniqueSelector;