/**
 * AI Service - Ollama Implementation (Local AI)
 */

import type { IAIService, AIModelConfig, ChatMessage, AIResponse, TokenUsage, ToolDefinition } from '@domain/repositories';
import { AIServiceError } from '@core/errors';
import { env } from '@core/config';

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaTool {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  tools?: OllamaTool[];
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

/**
 * Maps our provider-agnostic ChatMessage[] into Ollama's /api/chat shape.
 * Ollama's tool support (models that support it, e.g. llama3.1+) is simpler
 * than OpenAI's: no call ids to echo back, just role 'tool' with the result
 * content, and an assistant turn's tool_calls carry only name + arguments.
 */
function toOllamaMessages(messages: ChatMessage[]): OllamaMessage[] {
  return messages.map((m): OllamaMessage => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls.map(tc => ({ function: { name: tc.name, arguments: tc.arguments } })),
      };
    }
    return { role: m.role as 'system' | 'user' | 'assistant', content: m.content };
  });
}

function toOllamaTools(tools?: ToolDefinition[]): Pick<OllamaChatRequest, 'tools'> {
  if (!tools || tools.length === 0) return {};
  return {
    tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
  };
}

function toolCallsFrom(message: OllamaMessage): AIResponse['toolCalls'] {
  if (!message.tool_calls?.length) return undefined;
  return message.tool_calls.map((tc, i) => ({
    id: `${tc.function.name}-${Date.now()}-${i}`,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));
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

  async chat(messages: ChatMessage[], config: AIModelConfig, tools?: ToolDefinition[]): Promise<AIResponse> {
    const requestBody: OllamaChatRequest = {
      model: config.model || this.defaultModel,
      messages: toOllamaMessages(messages),
      stream: false,
      options: this.buildOptions(config),
      ...toOllamaTools(tools),
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
        toolCalls: toolCallsFrom(data.message),
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
    onChunk: (chunk: string) => void,
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    const requestBody: OllamaChatRequest = {
      model: config.model || this.defaultModel,
      messages: toOllamaMessages(messages),
      stream: true,
      options: this.buildOptions(config),
      ...toOllamaTools(tools),
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
      let toolCalls: AIResponse['toolCalls'];

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

            // Ollama doesn't stream tool_calls incrementally - they arrive
            // whole, typically on the final (done:true) chunk.
            const calls = toolCallsFrom(parsed.message);
            if (calls) toolCalls = calls;

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
        toolCalls,
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
