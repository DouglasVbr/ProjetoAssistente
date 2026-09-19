/**
 * Domain Entities - Core business objects
 * Independent of frameworks, databases, or external services
 */

export interface Memory {
  id: string;
  questionText: string;
  questionVoice: string;
  answerText: string;
  answerVoice: string;
  embeddings?: number[];
  createdAt: Date;
  updatedAt: Date;
  synced: boolean;
  metadata?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: Date;
  audioUrl?: string;
  /** Set on an 'assistant' message that asked to call one or more tools. */
  toolCalls?: ToolCall[];
  /** Set on a 'tool' message: which call (by id) this message answers. */
  toolCallId?: string;
  /** Set on a 'tool' message: the tool's name, for providers (Gemini) that need it. */
  toolName?: string;
  metadata?: Record<string, unknown>;
}

export interface VoiceCommand {
  text: string;
  confidence: number;
  isWakeWord: boolean;
  intent?: VoiceIntent;
  entities?: Record<string, string>;
}

export type VoiceIntent =
  | 'chat'
  | 'memory_create'
  | 'memory_read'
  | 'memory_update'
  | 'memory_delete'
  | 'memory_list'
  | 'settings_open'
  | 'help'
  | 'unknown';

export interface AIResponse {
  text: string;
  audioUrl?: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
  model: string;
  provider: AIProvider;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Describes one callable action the AI can invoke, in a JSON-Schema-ish shape
 * every provider (OpenAI, Gemini, Ollama) can translate into its own native
 * function/tool-calling request format. Kept provider-agnostic on purpose:
 * `data/services/ai/*` each map this into their own wire format.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<
      string,
      { type: string; description?: string; enum?: string[] }
    >;
    required?: string[];
  };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type AIProvider = 'openai' | 'azure' | 'ollama' | 'onnx' | 'gemini' | 'local' | 'memory' | 'auto';

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  endpoint?: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  presencePenalty: number;
  frequencyPenalty: number;
}

export interface AppSettings {
  id: string;
  aiProvider: AIProvider;
  aiModelConfig: AIModelConfig;
  voiceSettings: VoiceSettings;
  theme: 'dark' | 'light' | 'system';
  language: string;
  wakeWordEnabled: boolean;
  wakeWord: string;
  autoSpeak: boolean;
  offlineMode: boolean;
  syncEnabled: boolean;
  syncInterval: number;
  dataRetentionDays: number;
  notificationsEnabled: boolean;
  hapticsEnabled: boolean;
  updatedAt: Date;
}

export interface VoiceSettings {
  language: string;
  rate: number;
  pitch: number;
  volume: number;
  voiceId?: string;
  recognitionLanguage: string;
  continuousRecognition: boolean;
  interimResults: boolean;
}

export interface SyncStatus {
  lastSync: Date | null;
  pendingChanges: number;
  isSyncing: boolean;
  error: string | null;
}

export interface NetworkStatus {
  online: boolean;
  type: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
  effectiveType: '2g' | '3g' | '4g' | '5g' | 'slow-2g' | 'unknown';
  downlink: number;
  rtt: number;
}
