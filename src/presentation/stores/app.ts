/**
 * App Store - Global application state using Zustand
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AppSettings, ChatMessage, Memory, SyncStatus, NetworkStatus, VoiceCommand } from '../../domain/entities';
import { hybridAIService } from '../../data/services/ai/hybrid';

interface AppState {
  // Settings
  settings: AppSettings;
  setSettings: (settings: Partial<AppSettings>) => void;
  
  // Chat
  messages: ChatMessage[];
  currentSessionId: string;
  addMessage: (message: ChatMessage) => void;
  clearMessages: (sessionId?: string) => void;
  setSessionId: (id: string) => void;
  
  // Memories
  memories: Memory[];
  setMemories: (memories: Memory[]) => void;
  addMemory: (memory: Memory) => void;
  updateMemory: (id: string, data: Partial<Memory>) => void;
  removeMemory: (id: string) => void;
  
  // Voice
  isListening: boolean;
  isSpeaking: boolean;
  setListening: (listening: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  lastVoiceCommand: VoiceCommand | null;
  setLastVoiceCommand: (command: VoiceCommand | null) => void;
  
  // Sync
  syncStatus: SyncStatus;
  setSyncStatus: (status: Partial<SyncStatus>) => void;
  
  // Network
  networkStatus: NetworkStatus;
  setNetworkStatus: (status: NetworkStatus) => void;
  
  // UI
  theme: 'dark' | 'light' | 'system';
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  
  // AI
  aiProvider: string;
  setAIProvider: (provider: string) => void;
  aiModels: string[];
  setAIModels: (models: string[]) => void;
  
  // System
  initialized: boolean;
  setInitialized: (value: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Settings
      settings: {
        id: 'default',
        aiProvider: 'openai',
        aiModelConfig: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 2000,
          topP: 1,
          presencePenalty: 0,
          frequencyPenalty: 0,
        },
        voiceSettings: {
          language: 'pt-BR',
          rate: 0.75,
          pitch: 1.0,
          volume: 1.0,
          recognitionLanguage: 'pt-BR',
          continuousRecognition: true,
          interimResults: true,
        },
        theme: 'dark',
        language: 'pt-BR',
        wakeWordEnabled: true,
        wakeWord: 'phennellopy',
        autoSpeak: true,
        offlineMode: false,
        syncEnabled: true,
        syncInterval: 15,
        dataRetentionDays: 365,
        notificationsEnabled: true,
        hapticsEnabled: true,
        updatedAt: new Date(),
      },
      setSettings: (partial) => set(state => ({
        settings: { ...state.settings, ...partial, updatedAt: new Date() },
      })),

      // Chat
      messages: [],
      currentSessionId: 'default',
      addMessage: (message) => set(state => ({
        messages: [...state.messages, message].slice(-100),
      })),
      clearMessages: (sessionId) => set(state => ({
        messages: sessionId 
          ? state.messages.filter(m => m.metadata?.sessionId !== sessionId)
          : [],
      })),
      setSessionId: (id) => set({ currentSessionId: id }),

      // Memories
      memories: [],
      setMemories: (memories) => set({ memories }),
      addMemory: (memory) => set(state => ({ memories: [memory, ...state.memories] })),
      updateMemory: (id, data) => set(state => ({
        memories: state.memories.map(m => m.id === id ? { ...m, ...data } : m),
      })),
      removeMemory: (id) => set(state => ({
        memories: state.memories.filter(m => m.id !== id),
      })),

      // Voice
      isListening: false,
      isSpeaking: false,
      setListening: (listening) => set({ isListening: listening }),
      setSpeaking: (speaking) => set({ isSpeaking: speaking }),
      lastVoiceCommand: null,
      setLastVoiceCommand: (command) => set({ lastVoiceCommand: command }),

      // Sync
      syncStatus: {
        lastSync: null,
        pendingChanges: 0,
        isSyncing: false,
        error: null,
      },
      setSyncStatus: (status) => set(state => ({
        syncStatus: { ...state.syncStatus, ...status },
      })),

      // Network
      networkStatus: {
        online: true,
        type: 'unknown',
        effectiveType: 'unknown',
        downlink: 10,
        rtt: 50,
      },
      setNetworkStatus: (status) => set({ networkStatus: status }),

      // UI
      theme: 'dark',
      setTheme: (theme) => set({ theme }),
      sidebarOpen: false,
      toggleSidebar: () => set(state => ({ sidebarOpen: !state.sidebarOpen })),

      // AI
      aiProvider: 'auto',
      setAIProvider: (provider) => {
        set({ aiProvider: provider });
        hybridAIService.setProvider(provider as any);
      },
      aiModels: [],
      setAIModels: (models) => set({ aiModels: models }),

      // System
      initialized: false,
      setInitialized: (value) => set({ initialized: value }),
    }),
    {
      name: 'phennellopy-app-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
        theme: state.theme,
        aiProvider: state.aiProvider,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);