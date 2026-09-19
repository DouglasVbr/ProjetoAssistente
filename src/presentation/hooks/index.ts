/**
 * Presentation Hooks - Custom React hooks for the UI layer
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useAppStore } from '../stores/app';
import { hybridAIService } from '../../data/services/ai/hybrid';
import { CapacitorVoiceService, WebVoiceService } from '../../data/services/voice/capacitor-voice';
import { sqliteService } from '../../data/storage/sqlite';
import { indexedDBService } from '../../data/storage/indexeddb';
import { Events } from '../../domain/events';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Haptics } from '@capacitor/haptics';
import { type AIModelConfig, type ChatMessage, type Memory, type VoiceCommand } from '../../domain/entities';
import { v4 as uuidv4 } from 'uuid';

/**
 * Shared voice service instance. `useAppInit` creates and initializes it once
 * (it already wires onResult/onError to the chat pipeline); `useVoice` drives
 * the same instance so the mic button in the UI actually starts/stops/speaks
 * instead of only flipping UI state.
 */
let sharedVoiceService: CapacitorVoiceService | WebVoiceService | null = null;

/**
 * Initialize the application
 */
export function useAppInit() {
  const { setInitialized, setNetworkStatus, settings, setSettings, setAIProvider, aiProvider } = useAppStore();
  const voiceServiceRef = useRef<CapacitorVoiceService | WebVoiceService | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        if (Capacitor.isNativePlatform()) {
          await sqliteService.initialize();
        } else {
          await indexedDBService.initialize();
        }

        if (Capacitor.isNativePlatform()) {
          voiceServiceRef.current = new CapacitorVoiceService();
        } else {
          voiceServiceRef.current = new WebVoiceService();
        }
        sharedVoiceService = voiceServiceRef.current;
        await voiceServiceRef.current.initialize();

        const unsubResult = voiceServiceRef.current.onResult((command) => {
          useAppStore.getState().setLastVoiceCommand(command);
          handleVoiceCommand(command);
        });

        const unsubError = voiceServiceRef.current.onError((error) => {
          console.error('Voice error:', error);
        });

        if (Capacitor.isPluginAvailable('Network')) {
          const status = await Network.getStatus();
          setNetworkStatus({
            online: status.connected,
            type: status.connectionType as any,
            effectiveType: 'unknown',
            downlink: 10,
            rtt: 50,
          });

          Network.addListener('networkStatusChange', (status) => {
            setNetworkStatus({
              online: status.connected,
              type: status.connectionType as any,
              effectiveType: 'unknown',
              downlink: 10,
              rtt: 50,
            });
            
            if (status.connected) {
              Events.network.online();
            } else {
              Events.network.offline();
            }
          });
        }

        try {
          const models = await hybridAIService.getModels();
          useAppStore.getState().setAIModels(models);
        } catch {
          // Ignore
        }

        applyTheme(settings.theme);

        if (mounted) {
          setInitialized(true);
        }

        return () => {
          unsubResult();
          unsubError();
          voiceServiceRef.current?.cleanup();
          sharedVoiceService = null;
        };
      } catch (error) {
        console.error('Initialization error:', error);
        if (mounted) {
          setInitialized(true);
        }
      }
    }

    initialize();
  }, [setInitialized, setNetworkStatus, settings.theme, setSettings, setAIProvider, aiProvider]);

  const handleVoiceCommand = useCallback(async (command: VoiceCommand) => {
    if (!command.text) return;

    const { isListening, isSpeaking, settings, addMessage, memories } = useAppStore.getState();
    
    if (settings.wakeWordEnabled && command.isWakeWord) {
      return;
    }

    if (!isListening && !command.isWakeWord) return;

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: command.text,
      timestamp: new Date(),
      metadata: { voice: true, confidence: command.confidence },
    };
    addMessage(userMessage);

    const aiConfig: AIModelConfig = {
      provider: settings.aiProvider,
      model: settings.aiModelConfig.model,
      temperature: settings.aiModelConfig.temperature,
      maxTokens: settings.aiModelConfig.maxTokens,
      topP: settings.aiModelConfig.topP,
      presencePenalty: settings.aiModelConfig.presencePenalty,
      frequencyPenalty: settings.aiModelConfig.frequencyPenalty,
    };

    try {
      let response = '';
      const memoryMatch = memories.find(m => 
        m.questionText.toLowerCase() === command.text.toLowerCase() ||
        m.questionVoice.toLowerCase() === command.text.toLowerCase()
      );

      if (memoryMatch) {
        response = memoryMatch.answerText;
      } else {
        const messages = useAppStore.getState().messages;
        const aiResponse = await hybridAIService.chat(messages, aiConfig);
        response = aiResponse.text;
      }

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      addMessage(assistantMessage);

      if (settings.autoSpeak && !isSpeaking) {
        await voiceServiceRef.current?.speak(response, {
          language: settings.voiceSettings.language,
          rate: settings.voiceSettings.rate,
          pitch: settings.voiceSettings.pitch,
          volume: settings.voiceSettings.volume,
        });
      }
    } catch (error) {
      console.error('Voice command error:', error);
    }
  }, []);

  return { voiceService: voiceServiceRef.current };
}

/**
 * Apply theme to document
 */
function applyTheme(theme: 'dark' | 'light' | 'system'): void {
  const root = document.documentElement;
  
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
    root.classList.toggle('light', !prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
    root.classList.toggle('light', theme === 'light');
  }
}

/**
 * Hook for theme management
 */
export function useTheme() {
  const { theme, setTheme, settings } = useAppStore();

  useEffect(() => {
    applyTheme(theme);
    
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e: MediaQueryListEvent) => applyTheme('system');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const themes: ('dark' | 'light' | 'system')[] = ['dark', 'light', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
    useAppStore.getState().setSettings({ theme: nextTheme });
  }, [theme, setTheme]);

  return { theme, setTheme: toggleTheme };
}

/**
 * Hook for chat functionality
 */
export function useChat() {
  const { messages, currentSessionId, addMessage, clearMessages, setSessionId } = useAppStore();
  const [streaming, setStreaming] = useState(false);

  const sendMessage = useCallback(async (content: string) => {
    const { settings } = useAppStore.getState();
    
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date(),
    };
    addMessage(userMessage);

    const aiConfig: AIModelConfig = {
      provider: settings.aiProvider,
      model: settings.aiModelConfig.model,
      temperature: settings.aiModelConfig.temperature,
      maxTokens: settings.aiModelConfig.maxTokens,
      topP: settings.aiModelConfig.topP,
      presencePenalty: settings.aiModelConfig.presencePenalty,
      frequencyPenalty: settings.aiModelConfig.frequencyPenalty,
    };

    setStreaming(true);
    let fullResponse = '';

    try {
      await hybridAIService.streamChat(
        [...useAppStore.getState().messages, userMessage],
        aiConfig,
        (chunk) => {
          fullResponse += chunk;
        }
      );

      const assistantMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date(),
      };
      addMessage(assistantMessage);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem.',
        timestamp: new Date(),
      };
      addMessage(errorMessage);
    } finally {
      setStreaming(false);
    }
  }, [addMessage]);

  return {
    messages,
    currentSessionId,
    sendMessage,
    clearMessages: () => clearMessages(currentSessionId),
    setSessionId,
    streaming,
  };
}

/**
 * Hook for voice functionality
 */
export function useVoice() {
  const { isListening, isSpeaking, setListening, setSpeaking, settings, lastVoiceCommand } = useAppStore();

  const startListening = useCallback(async () => {
    if (isListening) return;

    if (!sharedVoiceService) {
      console.error('Voice service not ready yet');
      return;
    }

    try {
      setListening(true);
      await sharedVoiceService.startListening({
        language: settings.voiceSettings.language,
        continuous: true,
        interimResults: true,
        maxResults: 5,
      });
    } catch (error) {
      console.error('Start listening error:', error);
      setListening(false);
    }
  }, [isListening, setListening, settings.voiceSettings.language]);

  const stopListening = useCallback(async () => {
    if (!isListening) return;

    try {
      await sharedVoiceService?.stopListening();
    } catch (error) {
      console.error('Stop listening error:', error);
    } finally {
      setListening(false);
    }
  }, [isListening, setListening]);

  const speak = useCallback(async (text: string) => {
    if (isSpeaking || !text) return;

    if (!sharedVoiceService) {
      console.error('Voice service not ready yet');
      return;
    }

    setSpeaking(true);
    try {
      await sharedVoiceService.speak(text, {
        language: settings.voiceSettings.language,
        rate: settings.voiceSettings.rate,
        pitch: settings.voiceSettings.pitch,
        volume: settings.voiceSettings.volume,
      });
    } catch (error) {
      console.error('Speak error:', error);
    } finally {
      setSpeaking(false);
    }
  }, [isSpeaking, setSpeaking, settings.voiceSettings]);

  const stopSpeaking = useCallback(async () => {
    if (!isSpeaking) return;

    try {
      await sharedVoiceService?.stopSpeaking();
    } catch (error) {
      console.error('Stop speaking error:', error);
    } finally {
      setSpeaking(false);
    }
  }, [isSpeaking, setSpeaking]);

  return {
    isListening,
    isSpeaking,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    lastVoiceCommand,
  };
}

/**
 * Hook for memories management
 */
export function useMemories() {
  const { memories, setMemories, addMemory, updateMemory, removeMemory } = useAppStore();
  const [loading, setLoading] = useState(false);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      let allMemories: Memory[];
      if (Capacitor.isNativePlatform()) {
        allMemories = await sqliteService.findAll();
      } else {
        allMemories = await indexedDBService.findAll();
      }
      setMemories(allMemories);
    } catch (error) {
      console.error('Load memories error:', error);
    } finally {
      setLoading(false);
    }
  }, [setMemories]);

  const createMemory = useCallback(async (data: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'synced'>) => {
    try {
      let memory: Memory;
      if (Capacitor.isNativePlatform()) {
        memory = await sqliteService.create(data);
      } else {
        memory = await indexedDBService.create(data);
      }
      addMemory(memory);
      return memory;
    } catch (error) {
      console.error('Create memory error:', error);
      throw error;
    }
  }, [addMemory]);

  const updateMemoryById = useCallback(async (id: string, data: Partial<Memory>) => {
    try {
      let updated: Memory | null;
      if (Capacitor.isNativePlatform()) {
        updated = await sqliteService.update(id, data);
      } else {
        updated = await indexedDBService.update(id, data);
      }
      if (updated) updateMemory(id, data);
      return updated;
    } catch (error) {
      console.error('Update memory error:', error);
      throw error;
    }
  }, [updateMemory]);

  const deleteMemory = useCallback(async (id: string) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await sqliteService.delete(id);
      } else {
        await indexedDBService.delete(id);
      }
      removeMemory(id);
    } catch (error) {
      console.error('Delete memory error:', error);
      throw error;
    }
  }, [removeMemory]);

  const deleteAllMemories = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await sqliteService.deleteAll();
      } else {
        await indexedDBService.deleteAll();
      }
      setMemories([]);
    } catch (error) {
      console.error('Delete all memories error:', error);
      throw error;
    }
  }, [setMemories]);

  return {
    memories,
    loading,
    loadMemories,
    createMemory,
    updateMemory: updateMemoryById,
    deleteMemory,
    deleteAllMemories,
  };
}

/**
 * Hook for settings management
 */
export function useSettings() {
  const { settings, setSettings } = useAppStore();

  const updateSettings = useCallback(async (partial: Partial<typeof settings>) => {
    setSettings(partial);
  }, [setSettings]);

  return { settings, updateSettings };
}

/**
 * Hook for haptic feedback
 */
export function useHaptics() {
  const { settings } = useAppStore();

  const impact = useCallback(async (style: 'light' | 'medium' | 'heavy' = 'light') => {
    if (!settings.hapticsEnabled) return;
    try {
      if (Capacitor.isPluginAvailable('Haptics')) {
        await Haptics.impact({ style: style as any });
      }
    } catch {
      // Ignore
    }
  }, [settings.hapticsEnabled]);

  const notification = useCallback(async (type: 'success' | 'warning' | 'error') => {
    if (!settings.hapticsEnabled) return;
    try {
      if (Capacitor.isPluginAvailable('Haptics')) {
        await Haptics.notification({ type: type as any });
      }
    } catch {
      // Ignore
    }
  }, [settings.hapticsEnabled]);

  const vibrate = useCallback(async (duration: number = 100) => {
    if (!settings.hapticsEnabled) return;
    try {
      if (Capacitor.isPluginAvailable('Haptics')) {
        await Haptics.vibrate({ duration });
      }
    } catch {
      // Ignore
    }
  }, [settings.hapticsEnabled]);

  return { impact, notification, vibrate };
}

/**
 * Hook for sync functionality
 */
export function useSync() {
  const { syncStatus, setSyncStatus, settings } = useAppStore();
  const [syncing, setSyncing] = useState(false);

  const sync = useCallback(async () => {
    if (syncing || !settings.syncEnabled) return;
    
    setSyncing(true);
    setSyncStatus({ isSyncing: true, error: null });
    
    try {
      await new Promise(r => setTimeout(r, 1000));
      
      setSyncStatus({ 
        lastSync: new Date(), 
        pendingChanges: 0, 
        isSyncing: false,
        error: null,
      });
    } catch (error) {
      setSyncStatus({ 
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      });
    } finally {
      setSyncing(false);
    }
  }, [syncing, settings.syncEnabled, setSyncStatus]);

  return { syncStatus, sync, syncing };
}