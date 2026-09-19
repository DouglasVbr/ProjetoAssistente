/**
 * Settings Use Cases - Business logic for app configuration
 */

import type { AppSettings, VoiceSettings, AIModelConfig, AIProvider } from '../entities';
import type { ISettingsRepository } from '../repositories';

const DEFAULT_SETTINGS: AppSettings = {
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
};

export class SettingsUseCases {
  constructor(private settingsRepo: ISettingsRepository) {}

  async getSettings(): Promise<AppSettings> {
    const settings = await this.settingsRepo.get();
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...partial, updatedAt: new Date() };
    return this.settingsRepo.update(updated);
  }

  async updateAIProvider(provider: AIProvider): Promise<AppSettings> {
    const modelConfigs: Record<AIProvider, Partial<AIModelConfig>> = {
      openai: { provider: 'openai', model: 'gpt-4o-mini' },
      azure: { provider: 'azure', model: 'gpt-4o', endpoint: '' },
      ollama: { provider: 'ollama', model: 'llama3.1:8b', endpoint: 'http://localhost:11434' },
      onnx: { provider: 'onnx', model: 'phi-3-mini', endpoint: '' },
      gemini: { provider: 'gemini', model: 'gemini-1.5-flash' },
      local: { provider: 'local', model: 'local' },
      memory: { provider: 'memory', model: 'memory' },
      auto: { provider: 'auto', model: 'auto' },
    };

    return this.updateSettings({
      aiProvider: provider,
      aiModelConfig: { ...DEFAULT_SETTINGS.aiModelConfig, ...modelConfigs[provider] },
    });
  }

  async updateAIModelConfig(config: Partial<AIModelConfig>): Promise<AppSettings> {
    const current = await this.getSettings();
    return this.updateSettings({
      aiModelConfig: { ...current.aiModelConfig, ...config },
    });
  }

  async updateVoiceSettings(settings: Partial<VoiceSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    return this.updateSettings({
      voiceSettings: { ...current.voiceSettings, ...settings },
    });
  }

  async updateTheme(theme: 'dark' | 'light' | 'system'): Promise<AppSettings> {
    return this.updateSettings({ theme });
  }

  async updateLanguage(language: string): Promise<AppSettings> {
    return this.updateSettings({ 
      language, 
      voiceSettings: { ...DEFAULT_SETTINGS.voiceSettings, recognitionLanguage: language } 
    });
  }

  async toggleWakeWord(enabled: boolean): Promise<AppSettings> {
    return this.updateSettings({ wakeWordEnabled: enabled });
  }

  async updateWakeWord(word: string): Promise<AppSettings> {
    return this.updateSettings({ wakeWord: word.toLowerCase().trim() });
  }

  async toggleAutoSpeak(enabled: boolean): Promise<AppSettings> {
    return this.updateSettings({ autoSpeak: enabled });
  }

  async toggleOfflineMode(enabled: boolean): Promise<AppSettings> {
    return this.updateSettings({ offlineMode: enabled });
  }

  async toggleSync(enabled: boolean): Promise<AppSettings> {
    return this.updateSettings({ syncEnabled: enabled });
  }

  async updateSyncInterval(minutes: number): Promise<AppSettings> {
    return this.updateSettings({ syncInterval: Math.max(1, minutes) });
  }

  async resetSettings(): Promise<AppSettings> {
    return this.settingsRepo.reset();
  }

  async exportSettings(): Promise<string> {
    const settings = await this.getSettings();
    return JSON.stringify(settings, null, 2);
  }

  async importSettings(json: string): Promise<AppSettings> {
    try {
      const imported = JSON.parse(json) as Partial<AppSettings>;
      return this.updateSettings(imported);
    } catch {
      throw new Error('Invalid settings format');
    }
  }
}