import React from 'react';

interface NotesViewerProps {
    notes: string[];
}

const NotesViewer: React.FC<NotesViewerProps> = ({ notes }) => {
    return (
        <div className="notes-viewer">
            <h2>User Notes</h2>
            <ul>
                {notes.map((note, index) => (
                    <li key={index}>{note}</li>
                ))}
            </ul>
        </div>
    );
};

export default NotesViewer;