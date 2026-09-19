/**
 * AI Service - Ollama Implementation (Local AI)
 */

import type { IAIService, AIModelConfig, ChatMessage, AIResponse, TokenUsage } from '@domain/repositories';
import { AIServiceError } from '@core/errors';
import { env } from '@core/config';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  options?: {
    temperature: number;
    top_p: number;
    num_predict: number;
    presence_penalty: number;
    frequency_penalty: number;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  eval_count: number;
  eval_duration: number;
}

interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaEmbeddingRequest {
  model: string;
  prompt: string;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

interface OllamaModelsResponse {
  models: Array<{ name: string; model: string; modified_at: string; size: number; digest: string }>;
}

export class OllamaService implements IAIService {
  private baseUrl: string;
  private defaultModel: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || env.VITE_OLLAMA_URL || 'http://localhost:11434';
    this.defaultModel = 'llama3.1:8b';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  private buildOptions(config: AIModelConfig) {
    return {
      temperature: config.temperature,
      top_p: config.topP,
      num_predict: config.maxTokens,
      presence_penalty: config.presencePenalty,
      frequency_penalty: config.frequencyPenalty,
    };
  }

  async chat(messages: ChatMessage[], config: AIModelConfig): Promise<AIResponse> {
    const requestBody: OllamaChatRequest = {
      model: config.model || this.defaultModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: false,
      options: this.buildOptions(config),
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `Ollama API error: ${response.status}`,
          'ollama',
          new Error(JSON.stringify(error))
        );
      }

      const data: OllamaChatResponse = await response.json();

      return {
        text: data.message.content || '',
        usage: {
          promptTokens: data.prompt_eval_count,
          completionTokens: data.eval_count,
          totalTokens: data.prompt_eval_count + data.eval_count,
        },
        model: data.model,
        provider: 'ollama',
      };
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('Ollama request failed', 'ollama', error as Error);
    }
  }

  async streamChat(
    messages: ChatMessage[],
    config: AIModelConfig,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    const requestBody: OllamaChatRequest = {
      model: config.model || this.defaultModel,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      options: this.buildOptions(config),
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `Ollama streaming error: ${response.status}`,
          'ollama',
          new Error(JSON.stringify(error))
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let usage: TokenUsage | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const parsed: OllamaStreamChunk = JSON.parse(line);
            
            if (parsed.message.content) {
              fullText += parsed.message.content;
              onChunk(parsed.message.content);
            }

            if (parsed.done && parsed.prompt_eval_count !== undefined) {
              usage = {
                promptTokens: parsed.prompt_eval_count,
                completionTokens: parsed.eval_count || 0,
                totalTokens: (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0),
              };
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      return {
        text: fullText,
        usage,
        model: config.model || this.defaultModel,
        provider: 'ollama',
      };
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('Ollama streaming failed', 'ollama', error as Error);
    }
  }

  async getEmbedding(text: string, config: AIModelConfig): Promise<number[]> {
    const embeddingModel = config.model?.includes('embed') ? config.model : 'nomic-embed-text';

    const requestBody: OllamaEmbeddingRequest = {
      model: embeddingModel,
      prompt: text,
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        return new Array(768).fill(0);
      }

      const data: OllamaEmbeddingResponse = await response.json();
      return data.embedding || new Array(768).fill(0);
    } catch {
      return new Array(768).fill(0);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) return [];
      
      const data: OllamaModelsResponse = await response.json();
      return data.models.map(m => m.name).sort();
    } catch {
      return [];
    }
  }

  async pullModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: modelName, stream: false }),
    });
    
    if (!response.ok) {
      throw new AIServiceError(`Failed to pull model ${modelName}`, 'ollama');
    }
  }

  async deleteModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/delete`, {
      method: 'DELETE',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: modelName }),
    });
    
    if (!response.ok) {
      throw new AIServiceError(`Failed to delete model ${modelName}`, 'ollama');
    }
  }
}