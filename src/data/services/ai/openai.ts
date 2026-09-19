/**
 * AI Service - OpenAI Implementation
 */

import type { IAIService, AIModelConfig, ChatMessage, AIResponse, TokenUsage, ToolDefinition } from '@domain/repositories';
import { AIServiceError } from '@core/errors';
import { config as appConfig, env } from '@core/config';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature: number;
  max_tokens: number;
  top_p: number;
  presence_penalty: number;
  frequency_penalty: number;
  stream?: boolean;
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { content?: string; role?: string; tool_calls?: OpenAIMessage['tool_calls'] };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIEmbeddingRequest {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64';
}

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

interface OpenAIModelsResponse {
  object: string;
  data: Array<{ id: string; object: string; created: number; owned_by: string }>;
}

/**
 * Maps our provider-agnostic ChatMessage[] (which can carry a 'tool' role and
 * an assistant message's toolCalls) into OpenAI's wire format: a tool result
 * becomes `{role:'tool', tool_call_id, content}`, and an assistant message
 * that asked for tool calls carries them back as `tool_calls` (OpenAI expects
 * this echoed on resend, matched by id, before it will read the following
 * tool messages).
 */
function toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((m): OpenAIMessage => {
    if (m.role === 'tool') {
      return { role: 'tool', content: m.content, tool_call_id: m.toolCallId };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: m.role as 'system' | 'user' | 'assistant', content: m.content };
  });
}

function toOpenAITools(tools?: ToolDefinition[]): Pick<OpenAIChatRequest, 'tools' | 'tool_choice'> {
  if (!tools || tools.length === 0) return {};
  return {
    tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
    tool_choice: 'auto',
  };
}

export class OpenAIService implements IAIService {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey || env.VITE_OPENAI_API_KEY;
    this.baseUrl = baseUrl || appConfig.api.openai.baseUrl;
    this.defaultModel = 'gpt-4o-mini';
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  async chat(messages: ChatMessage[], modelConfig: AIModelConfig, tools?: ToolDefinition[]): Promise<AIResponse> {
    const requestBody: OpenAIChatRequest = {
      ...this.buildRequestBody(messages, modelConfig, tools),
    };

    try {
      const response = await fetch(`${this.baseUrl}${appConfig.api.openai.chatEndpoint}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `OpenAI API error: ${response.status}`,
          'openai',
          new Error(JSON.stringify(error))
        );
      }

      const data: OpenAIChatResponse = await response.json();
      const choice = data.choices[0];

      return {
        text: choice.message.content || '',
        toolCalls: choice.message.tool_calls?.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })),
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        model: data.model,
        provider: 'openai',
      };
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('OpenAI request failed', 'openai', error as Error);
    }
  }

  async streamChat(
    messages: ChatMessage[],
    modelConfig: AIModelConfig,
    onChunk: (chunk: string) => void,
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    const requestBody: OpenAIChatRequest = {
      ...this.buildRequestBody(messages, modelConfig, tools),
      stream: true,
    };

    try {
      const response = await fetch(`${this.baseUrl}${appConfig.api.openai.chatEndpoint}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `OpenAI streaming error: ${response.status}`,
          'openai',
          new Error(JSON.stringify(error))
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let toolCalls: AIResponse['toolCalls'] = [];
      let usage: TokenUsage | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed: OpenAIStreamChunk = JSON.parse(data);
              const choice = parsed.choices[0];

              if (choice.delta.content) {
                fullText += choice.delta.content;
                onChunk(choice.delta.content);
              }

              if (choice.delta.tool_calls) {
                for (const tc of choice.delta.tool_calls) {
                  const existing = toolCalls.find(t => t.id === tc.id);
                  if (existing) {
                    existing.arguments = { ...existing.arguments, ...JSON.parse(tc.function.arguments) };
                  } else {
                    toolCalls.push({
                      id: tc.id,
                      name: tc.function.name,
                      arguments: JSON.parse(tc.function.arguments),
                    });
                  }
                }
              }

              if (choice.finish_reason && parsed.usage) {
                usage = {
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                  totalTokens: parsed.usage.total_tokens,
                };
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      return {
        text: fullText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        usage,
        model: modelConfig.model || this.defaultModel,
        provider: 'openai',
      };
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('OpenAI streaming failed', 'openai', error as Error);
    }
  }

  async getEmbedding(text: string, _modelConfig: AIModelConfig): Promise<number[]> {
    const requestBody: OpenAIEmbeddingRequest = {
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float',
    };

    try {
      const response = await fetch(`${this.baseUrl}${appConfig.api.openai.embeddingsEndpoint}`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `OpenAI embedding error: ${response.status}`,
          'openai',
          new Error(JSON.stringify(error))
        );
      }

      const data: OpenAIEmbeddingResponse = await response.json();
      return data.data[0]?.embedding || new Array(1536).fill(0);
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('OpenAI embedding failed', 'openai', error as Error);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}${appConfig.api.openai.modelsEndpoint}`, {
        headers: this.getHeaders(),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}${appConfig.api.openai.modelsEndpoint}`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) return [];

      const data: OpenAIModelsResponse = await response.json();
      return data.data
        .filter(m => m.id.includes('gpt') || m.id.includes('o1'))
        .map(m => m.id)
        .sort();
    } catch {
      return [];
    }
  }

  private buildRequestBody(messages: ChatMessage[], modelConfig: AIModelConfig, tools?: ToolDefinition[]): Omit<OpenAIChatRequest, 'stream'> {
    return {
      model: modelConfig.model || this.defaultModel,
      messages: toOpenAIMessages(messages),
      temperature: modelConfig.temperature,
      max_tokens: modelConfig.maxTokens,
      top_p: modelConfig.topP,
      presence_penalty: modelConfig.presencePenalty,
      frequency_penalty: modelConfig.frequencyPenalty,
      ...toOpenAITools(tools),
    };
  }
}
