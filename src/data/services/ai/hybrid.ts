/**
 * Hybrid AI Service - Combines cloud and local AI with automatic fallback
 */

import type { IAIService, AIModelConfig, ChatMessage, AIResponse, ToolDefinition } from '@domain/repositories';
import { OpenAIService } from './openai';
import { OllamaService } from './ollama';
import { GeminiService } from './gemini';
import { AIServiceError } from '@core/errors';
import { env } from '@core/config';
import { sleep } from '@core/utils';

export type AIProviderType = 'openai' | 'azure' | 'ollama' | 'gemini' | 'auto';

interface ProviderConfig {
  type: AIProviderType;
  service: IAIService;
  priority: number;
  enabled: boolean;
  lastFailure?: Date;
  failureCount: number;
}

export class HybridAIService implements IAIService {
  private providers: Map<string, ProviderConfig> = new Map();
  private currentProvider: AIProviderType = 'auto';
  private fallbackEnabled = true;
  private maxFailuresBeforeFallback = 3;
  private failureCooldownMs = 60000;

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    if (env.VITE_OPENAI_API_KEY) {
      this.providers.set('openai', {
        type: 'openai',
        service: new OpenAIService(),
        priority: 1,
        enabled: true,
        failureCount: 0,
      });
    }

    this.providers.set('ollama', {
      type: 'ollama',
      service: new OllamaService(),
      priority: 2,
      enabled: true,
      failureCount: 0,
    });

    if (env.VITE_AZURE_OPENAI_ENDPOINT && env.VITE_AZURE_OPENAI_API_KEY) {
      this.providers.set('azure', {
        type: 'azure',
        service: new OpenAIService(env.VITE_AZURE_OPENAI_API_KEY, env.VITE_AZURE_OPENAI_ENDPOINT),
        priority: 1,
        enabled: true,
        failureCount: 0,
      });
    }

    if (env.VITE_GEMINI_API_KEY) {
      this.providers.set('gemini', {
        type: 'gemini',
        service: new GeminiService(),
        priority: 1,
        enabled: true,
        failureCount: 0,
      });
    }
  }

  setProvider(provider: AIProviderType): void {
    this.currentProvider = provider;
  }

  setFallbackEnabled(enabled: boolean): void {
    this.fallbackEnabled = enabled;
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.entries())
      .filter(([_, config]) => config.enabled)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([name]) => name);
  }

  getCurrentProvider(): AIProviderType {
    return this.currentProvider;
  }

  async chat(messages: ChatMessage[], config: AIModelConfig, tools?: ToolDefinition[]): Promise<AIResponse> {
    const provider = await this.selectProvider(config);
    return this.executeWithFallback('chat', provider, messages, config, tools);
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIModelConfig,
    onChunk: (chunk: string) => void,
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    const provider = await this.selectProvider(config);
    return this.executeWithFallback('streamChat', provider, messages, config, onChunk, tools);
  }

  async getEmbedding(text: string, config: AIModelConfig): Promise<number[]> {
    const provider = await this.selectProvider(config);
    return this.executeWithFallback('getEmbedding', provider, text, config);
  }

  async isAvailable(): Promise<boolean> {
    for (const [name, config] of this.providers) {
      if (config.enabled && await this.isProviderHealthy(name)) {
        return true;
      }
    }
    return false;
  }

  async getModels(): Promise<string[]> {
    const allModels: string[] = [];
    for (const [name, config] of this.providers) {
      if (config.enabled) {
        try {
          const models = await config.service.getModels();
          allModels.push(...models.map(m => `${name}:${m}`));
        } catch {
          // Ignore errors
        }
      }
    }
    return allModels;
  }

  private async selectProvider(config: AIModelConfig): Promise<string> {
    if (config.provider && config.provider !== 'auto') {
      if (this.providers.has(config.provider)) {
        return config.provider;
      }
    }

    if (this.currentProvider !== 'auto' && this.providers.has(this.currentProvider)) {
      const provider = this.providers.get(this.currentProvider)!;
      if (provider.enabled && await this.isProviderHealthy(this.currentProvider)) {
        return this.currentProvider;
      }
    }

    const available = this.getAvailableProviders();
    for (const name of available) {
      if (await this.isProviderHealthy(name)) {
        return name;
      }
    }

    return available[0] || 'ollama';
  }

  private async isProviderHealthy(name: string): Promise<boolean> {
    const config = this.providers.get(name);
    if (!config || !config.enabled) return false;

    if (config.lastFailure) {
      const timeSinceFailure = Date.now() - config.lastFailure.getTime();
      if (timeSinceFailure < this.failureCooldownMs) {
        return false;
      }
    }

    return await config.service.isAvailable();
  }

  private async executeWithFallback<T>(
    method: 'chat' | 'streamChat' | 'getEmbedding',
    primaryProvider: string,
    ...args: unknown[]
  ): Promise<T> {
    const triedProviders = new Set<string>();
    let lastError: Error;

    try {
      return await this.callProviderMethod(method, primaryProvider, ...args) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      triedProviders.add(primaryProvider);
      this.recordFailure(primaryProvider);
    }

    if (this.fallbackEnabled) {
      const fallbackProviders = this.getAvailableProviders()
        .filter(p => !triedProviders.has(p))
        .sort((a, b) => (this.providers.get(a)?.priority || 99) - (this.providers.get(b)?.priority || 99));

      for (const provider of fallbackProviders) {
        if (!(await this.isProviderHealthy(provider))) continue;

        try {
          console.log(`Falling back to ${provider} for ${method}`);
          return await this.callProviderMethod(method, provider, ...args) as T;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          triedProviders.add(provider);
          this.recordFailure(provider);
        }
      }
    }

    throw new AIServiceError(
      `All AI providers failed. Last error: ${lastError?.message}`,
      'hybrid',
      lastError
    );
  }

  private async callProviderMethod(
    method: 'chat' | 'streamChat' | 'getEmbedding',
    providerName: string,
    ...args: unknown[]
  ): Promise<unknown> {
    const config = this.providers.get(providerName);
    if (!config) throw new Error(`Provider ${providerName} not found`);

    const service = config.service;

    switch (method) {
      case 'chat':
        return service.chat(args[0] as ChatMessage[], args[1] as AIModelConfig, args[2] as ToolDefinition[] | undefined);
      case 'streamChat':
        return service.streamChat(
          args[0] as ChatMessage[],
          args[1] as AIModelConfig,
          args[2] as (chunk: string) => void,
          args[3] as ToolDefinition[] | undefined
        );
      case 'getEmbedding':
        return service.getEmbedding(args[0] as string, args[1] as AIModelConfig);
      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private recordFailure(providerName: string): void {
    const config = this.providers.get(providerName);
    if (!config) return;

    config.failureCount++;
    config.lastFailure = new Date();

    if (config.failureCount >= this.maxFailuresBeforeFallback) {
      config.enabled = false;
      console.warn(`Provider ${providerName} disabled after ${config.failureCount} failures`);

      setTimeout(() => {
        config.enabled = true;
        config.failureCount = 0;
        console.log(`Provider ${providerName} re-enabled`);
      }, this.failureCooldownMs * 5);
    }
  }

  async checkProviderHealth(providerName: string): Promise<boolean> {
    const config = this.providers.get(providerName);
    if (!config) return false;

    try {
      return await config.service.isAvailable();
    } catch {
      return false;
    }
  }

  enableProvider(providerName: string): void {
    const config = this.providers.get(providerName);
    if (config) {
      config.enabled = true;
      config.failureCount = 0;
    }
  }

  disableProvider(providerName: string): void {
    const config = this.providers.get(providerName);
    if (config) {
      config.enabled = false;
    }
  }
}

export const hybridAIService = new HybridAIService();
