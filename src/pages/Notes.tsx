import React from 'react';
import NotesViewer from '../components/NotesViewer';

const Notes: React.FC = () => {
    return (
        <div>
            <h1>User Notes</h1>
            <NotesViewer />
        </div>
    );
};

export default Notes;