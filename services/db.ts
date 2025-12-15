import { openDB, DBSchema } from 'idb';
import { Note, ChatSession } from '../types';

interface PintarDB extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { 'by-date': number };
  };
  sessions: {
    key: string;
    value: ChatSession;
    indexes: { 'by-date': number };
  };
}

const DB_NAME = 'pintar-ai-db';
const DB_VERSION = 1;

const dbPromise = openDB<PintarDB>(DB_NAME, DB_VERSION, {
  upgrade(db) {
    // Create Note Store
    const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
    noteStore.createIndex('by-date', 'createdAt');

    // Create Session Store
    const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
    sessionStore.createIndex('by-date', 'lastModified');
  },
});

export const db = {
  // --- Notes Operations ---
  async getAllNotes(): Promise<Note[]> {
    const db = await dbPromise;
    // Get all and sort by date descending manually or via index
    const notes = await db.getAllFromIndex('notes', 'by-date');
    return notes.reverse(); // Newest first
  },

  async saveNote(note: Note): Promise<string> {
    const db = await dbPromise;
    await db.put('notes', note);
    return note.id;
  },

  async deleteNote(id: string): Promise<void> {
    const db = await dbPromise;
    await db.delete('notes', id);
  },

  // --- Session Operations ---
  async getAllSessions(): Promise<ChatSession[]> {
    const db = await dbPromise;
    const sessions = await db.getAllFromIndex('sessions', 'by-date');
    return sessions.reverse(); // Newest first
  },

  async saveSession(session: ChatSession): Promise<string> {
    const db = await dbPromise;
    await db.put('sessions', session);
    return session.id;
  },

  async deleteSession(id: string): Promise<void> {
    const db = await dbPromise;
    await db.delete('sessions', id);
  },
  
  async clearAllSessions(): Promise<void> {
    const db = await dbPromise;
    await db.clear('sessions');
  }
};
