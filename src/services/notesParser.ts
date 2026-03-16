import { Note } from '../types/index';

/**
 * Parse freeform notes text into a list of extracted keyword hints.
 * Used to give the AI additional context about what the analyst has observed.
 */
export function parseUserNotes(raw: string): string[] {
    if (!raw || !raw.trim()) return [];
    // Split on newlines/bullets and return non-empty lines as individual notes
    return raw
        .split(/[\n\r]+/)
        .map(l => l.replace(/^[-*•>\s]+/, '').trim())
        .filter(l => l.length > 3);
}

export class NotesParser {
    private notes: Note[];

    constructor(notes: Note[]) {
        this.notes = notes;
    }

    public parseNotes(): string[] {
        return this.notes.flatMap(note => parseUserNotes(note.content));
    }
}