/**
 * Core Configuration - Environment and app configuration
 */

export const config = {
  app: {
    name: 'phennellopy.ia',
    version: '2.0.0',
    bundleId: 'br.com.phennellopy.assistente',
  },
  api: {
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      modelsEndpoint: '/models',
      chatEndpoint: '/chat/completions',
      embeddingsEndpoint: '/embeddings',
    },
    azure: {
      baseUrl: '', // Set via env
      apiVersion: '2024-02-15-preview',
    },
    ollama: {
      baseUrl: 'http://localhost:11434',
      chatEndpoint: '/api/chat',
      embeddingsEndpoint: '/api/embeddings',
      modelsEndpoint: '/api/tags',
    },
  },
  database: {
    name: 'phennellopy.db',
    version: 1,
    tables: {
      memories: 'memories',
      chats: 'chats',
      settings: 'settings',
      sync_queue: 'sync_queue',
    },
  },
  storage: {
    prefix: 'phennellopy_',
    keys: {
      settings: 'settings',
      lastSync: 'last_sync',
      onboardingComplete: 'onboarding_complete',
    },
  },
  voice: {
    defaultLanguage: 'pt-BR',
    wakeWord: 'phennellopy',
    wakeWordThreshold: 0.7,
    maxAlternatives: 5,
    silenceTimeout: 3000,
    speechTimeout: 10000,
  },
  sync: {
    defaultIntervalMinutes: 15,
    minIntervalMinutes: 1,
    maxIntervalMinutes: 1440,
    batchSize: 50,
    retryAttempts: 3,
    retryDelayMs: 1000,
  },
  ui: {
    theme: 'dark' as const,
    animationDuration: 200,
    toastDuration: 3000,
    maxMessagesInView: 100,
  },
  pwa: {
    name: 'phennellopy.ia',
    shortName: 'Phennellopy',
    description: 'Sua assistente pessoal inteligente',
    themeColor: '#00B7FF',
    backgroundColor: '#000000',
    display: 'standalone',
    orientation: 'portrait-primary',
    scope: '/',
    startUrl: '/',
  },
} as const;

export type Config = typeof config;

// Environment variables (set at build time via Vite)
export const env = {
  VITE_OPENAI_API_KEY: import.meta.env.VITE_OPENAI_API_KEY || '',
  VITE_AZURE_OPENAI_ENDPOINT: import.meta.env.VITE_AZURE_OPENAI_ENDPOINT || '',
  VITE_AZURE_OPENAI_API_KEY: import.meta.env.VITE_AZURE_OPENAI_API_KEY || '',
  VITE_AZURE_OPENAI_DEPLOYMENT: import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT || '',
  VITE_OLLAMA_URL: import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434',
  VITE_GEMINI_API_KEY: import.meta.env.VITE_GEMINI_API_KEY || '',
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN || '',
  MODE: import.meta.env.MODE,
  DEV: import.meta.env.DEV,
  PROD: import.meta.env.PROD,
} as const;