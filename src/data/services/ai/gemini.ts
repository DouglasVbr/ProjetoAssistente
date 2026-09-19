/**
 * AI Service - Google Gemini Implementation
 */

import type { IAIService, AIModelConfig, ChatMessage, AIResponse, TokenUsage } from '@domain/repositories';
import { AIServiceError } from '@core/errors';
import { env } from '@core/config';

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiGenerationConfig {
  temperature: number;
  topP: number;
  maxOutputTokens: number;
}

interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig: GeminiGenerationConfig;
}

interface GeminiCandidate {
  content: { role: string; parts: GeminiPart[] };
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
}

interface GeminiGenerateResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  modelVersion?: string;
}

interface GeminiEmbedResponse {
  embedding: { values: number[] };
}

interface GeminiModelsResponse {
  models: Array<{ name: string; supportedGenerationMethods?: string[] }>;
}

/**
 * Gemini has no "assistant"/"system" roles like OpenAI-style APIs: only
 * "user" and "model" ride in `contents`, and a system prompt goes in the
 * separate `systemInstruction` field. This splits a ChatMessage[] into both.
 */
function toGeminiRequest(
  messages: ChatMessage[],
  modelConfig: AIModelConfig
): Pick<GeminiGenerateRequest, 'contents' | 'systemInstruction'> {
  const systemParts: GeminiPart[] = [];
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push({ text: m.content });
      continue;
    }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
  }

  return {
    contents,
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
  };
}

export class GeminiService implements IAIService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private defaultModel = 'gemini-2.0-flash';
  private defaultEmbeddingModel = 'text-embedding-004';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.VITE_GEMINI_API_KEY;
  }

  async chat(messages: ChatMessage[], modelConfig: AIModelConfig): Promise<AIResponse> {
    const model = modelConfig.model || this.defaultModel;
    const { contents, systemInstruction } = toGeminiRequest(messages, modelConfig);

    const requestBody: GeminiGenerateRequest = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: modelConfig.temperature,
        topP: modelConfig.topP,
        maxOutputTokens: modelConfig.maxTokens,
      },
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `Gemini API error: ${response.status}`,
          'gemini',
          new Error(JSON.stringify(error))
        );
      }

      const data: GeminiGenerateResponse = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';

      return {
        text,
        usage: data.usageMetadata
          ? {
              promptTokens: data.usageMetadata.promptTokenCount,
              completionTokens: data.usageMetadata.candidatesTokenCount,
              totalTokens: data.usageMetadata.totalTokenCount,
            }
          : undefined,
        model,
        provider: 'gemini',
      };
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('Gemini request failed', 'gemini', error as Error);
    }
  }

  async streamChat(
    messages: ChatMessage[],
    modelConfig: AIModelConfig,
    onChunk: (chunk: string) => void
  ): Promise<AIResponse> {
    const model = modelConfig.model || this.defaultModel;
    const { contents, systemInstruction } = toGeminiRequest(messages, modelConfig);

    const requestBody: GeminiGenerateRequest = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: modelConfig.temperature,
        topP: modelConfig.topP,
        maxOutputTokens: modelConfig.maxTokens,
      },
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/models/${model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `Gemini streaming error: ${response.status}`,
          'gemini',
          new Error(JSON.stringify(error))
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullText = '';
      let usage: TokenUsage | undefined;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed: GeminiGenerateResponse = JSON.parse(data);
            const chunkText = parsed.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
            if (chunkText) {
              fullText += chunkText;
              onChunk(chunkText);
            }
            if (parsed.usageMetadata) {
              usage = {
                promptTokens: parsed.usageMetadata.promptTokenCount,
                completionTokens: parsed.usageMetadata.candidatesTokenCount,
                totalTokens: parsed.usageMetadata.totalTokenCount,
              };
            }
          } catch {
            // Ignore parse errors for incomplete SSE chunks
          }
        }
      }

      return { text: fullText, usage, model, provider: 'gemini' };
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('Gemini streaming failed', 'gemini', error as Error);
    }
  }

  async getEmbedding(text: string, _modelConfig: AIModelConfig): Promise<number[]> {
    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.defaultEmbeddingModel}:embedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { parts: [{ text }] } }),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new AIServiceError(
          `Gemini embedding error: ${response.status}`,
          'gemini',
          new Error(JSON.stringify(error))
        );
      }

      const data: GeminiEmbedResponse = await response.json();
      return data.embedding?.values || new Array(768).fill(0);
    } catch (error) {
      if (error instanceof AIServiceError) throw error;
      throw new AIServiceError('Gemini embedding failed', 'gemini', error as Error);
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models?key=${this.apiKey}`);
      if (!response.ok) return [];

      const data: GeminiModelsResponse = await response.json();
      return data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .sort();
    } catch {
      return [];
    }
  }
}
