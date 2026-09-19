/**
 * Repository Interfaces - Domain contracts for data access
 * Implemented in data layer, used by use cases
 */

import type {
  Memory,
  ChatMessage,
  AppSettings,
  SyncStatus,
  NetworkStatus,
  AIResponse,
  VoiceCommand,
  AIModelConfig,
  TokenUsage,
  ToolCall,
  VoiceIntent,
  AIProvider,
  VoiceSettings,
} from '../entities';

export type {
  Memory,
  ChatMessage,
  AppSettings,
  SyncStatus,
  NetworkStatus,
  AIResponse,
  VoiceCommand,
  AIModelConfig,
  TokenUsage,
  ToolCall,
  VoiceIntent,
  AIProvider,
  VoiceSettings,
};

export interface IMemoryRepository {
  findAll(): Promise<Memory[]>;
  findById(id: string): Promise<Memory | null>;
  findByQuestionText(text: string): Promise<Memory[]>;
  searchByEmbedding(embedding: number[], limit?: number, threshold?: number): Promise<Memory[]>;
  create(memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'synced'>): Promise<Memory>;
  update(id: string, data: Partial<Memory>): Promise<Memory | null>;
  delete(id: string): Promise<boolean>;
  deleteAll(): Promise<number>;
  count(): Promise<number>;
  getUnsynced(): Promise<Memory[]>;
  markSynced(ids: string[]): Promise<void>;
}

export interface IChatRepository {
  findAll(sessionId?: string): Promise<ChatMessage[]>;
  findById(id: string): Promise<ChatMessage | null>;
  create(message: Omit<ChatMessage, 'id' | 'timestamp'>): Promise<ChatMessage>;
  update(id: string, data: Partial<ChatMessage>): Promise<ChatMessage | null>;
  delete(id: string): Promise<boolean>;
  deleteAll(sessionId?: string): Promise<number>;
  getRecent(limit: number, sessionId?: string): Promise<ChatMessage[]>;
}

export interface ISettingsRepository {
  get(): Promise<AppSettings>;
  update(settings: Partial<AppSettings>): Promise<AppSettings>;
  reset(): Promise<AppSettings>;
}

export interface ISyncRepository {
  getStatus(): Promise<SyncStatus>;
  updateStatus(status: Partial<SyncStatus>): Promise<void>;
  queueChange(entity: string, entityId: string, operation: 'create' | 'update' | 'delete', data: unknown): Promise<void>;
  getPendingChanges(): Promise<Array<{ entity: string; entityId: string; operation: string; data: unknown }>>;
  clearPendingChanges(ids: string[]): Promise<void>;
}

export interface INetworkRepository {
  getStatus(): Promise<NetworkStatus>;
  onStatusChange(callback: (status: NetworkStatus) => void): () => void;
}

export interface IAIService {
  chat(messages: ChatMessage[], config: AIModelConfig): Promise<AIResponse>;
  streamChat(messages: ChatMessage[], config: AIModelConfig, onChunk: (chunk: string) => void): Promise<AIResponse>;
  getEmbedding(text: string, config: AIModelConfig): Promise<number[]>;
  isAvailable(): Promise<boolean>;
  getModels(): Promise<string[]>;
}

export interface IVoiceService {
  startListening(options: VoiceRecognitionOptions): Promise<void>;
  stopListening(): Promise<void>;
  onResult(callback: (command: VoiceCommand) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
  speak(text: string, options?: VoiceSynthesisOptions): Promise<void>;
  stopSpeaking(): Promise<void>;
  getVoices(): Promise<VoiceInfo[]>;
  isListening(): boolean;
  isSpeaking(): boolean;
}

export interface VoiceRecognitionOptions {
  language: string;
  continuous: boolean;
  interimResults: boolean;
  maxResults: number;
  prompt?: string;
}

export interface VoiceSynthesisOptions {
  language: string;
  rate: number;
  pitch: number;
  volume: number;
  voiceId?: string;
}

export interface VoiceInfo {
  id: string;
  name: string;
  language: string;
  localService: boolean;
  default: boolean;
}

export interface IStorageService {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  getAllKeys(): Promise<string[]>;
}

export interface IFileService {
  readFile(path: string): Promise<string>;
  writeFile(path: string, data: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  getUri(path: string): Promise<string>;
  listFiles(path: string): Promise<string[]>;
}