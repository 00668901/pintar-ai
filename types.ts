export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  images?: string[]; // Array of Base64 strings
  timestamp: number;
  usage?: {
    promptTokens: number;
    responseTokens: number;
    totalTokens: number;
  };
  quiz?: QuizQuestion[]; // Optional quiz associated with this message
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastModified: number;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: string; // The correct answer text
  explanation: string;
}

export interface Note {
  id: string;
  title: string;
  content: string; // The summary
  quiz?: QuizQuestion[]; // Generated quiz
  originalFiles: string[]; // Base64 of files used
  sourceFileNames?: string[]; // Names of the files converted
  createdAt: number;
  syncedTo?: 'google' | 'dropbox' | null; // Track cloud sync status
}

export enum LearningMode {
  GENERAL = 'General Tutor',
  MATH = 'Math Solver',
  INTERACTIVE = 'Q&A Interaktif',
  SUMMARIZER = 'Summarizer',
  WRITING = 'Essay Helper'
}

export interface VisionFile {
  data: string; // base64
  mimeType: string;
}

export type AppView = 'chat' | 'notes' | 'note-detail';

export interface User {
  name: string;
  email: string;
  picture: string;
}