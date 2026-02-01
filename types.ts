
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  images?: string[];
  sources?: GroundingSource[];
  audioBuffer?: AudioBuffer; // For zero-latency playback
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export type LegalMethod = 'NONE' | 'IRAC' | 'IPAC' | 'CREC';
export type SourceScope = 'NIGERIA' | 'GLOBAL';
export type VoiceGender = 'MALE' | 'FEMALE';

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  lastModified: number;
}

export enum AppStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  ERROR = 'error'
}
