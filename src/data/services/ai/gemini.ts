/**
 * AI Service - Google Gemini Implementation
 */

import type { IAIService, AIModelConfig, ChatMessage, AIResponse, TokenUsage, ToolDefinition } from '@domain/repositories';
import { AIServiceError } from '@core/errors';
import { env } from '@core/config';

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role: 'user' | 'model' | 'function';
  parts: GeminiPart[];
}

interface GeminiGenerationConfig {
  temperature: number;
  topP: number;
  maxOutputTokens: number;
}

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: object;
}

interface GeminiGenerateRequest {
  contents: GeminiContent[];
  systemInstruction?: { parts: GeminiPart[] };
  generationConfig: GeminiGenerationConfig;
  tools?: Array<{ functionDeclarations: GeminiFunctionDeclaration[] }>;
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
 * "user"/"model"/"function" ride in `contents`, and a system prompt goes in
 * the separate `systemInstruction` field. This also carries tool calls
 * (assistant → `functionCall` parts on a "model" turn) and tool results
 * (our 'tool' role → a `functionResponse` part on a "function" turn) into
 * Gemini's shape.
 */
function toGeminiRequest(
  messages: ChatMessage[]
): Pick<GeminiGenerateRequest, 'contents' | 'systemInstruction'> {
  const systemParts: GeminiPart[] = [];
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push({ text: m.content });
      continue;
    }
    if (m.role === 'tool') {
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name: m.toolName || 'unknown', response: { content: m.content } } }],
      });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      contents.push({
        role: 'model',
        parts: m.toolCalls.map(tc => ({ functionCall: { name: tc.name, args: tc.arguments } })),
      });
      continue;
    }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
  }

  return {
    contents,
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
  };
}

function toGeminiTools(tools?: ToolDefinition[]): Pick<GeminiGenerateRequest, 'tools'> {
  if (!tools || tools.length === 0) return {};
  return {
    tools: [
      {
        functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters })),
      },
    ],
  };
}

/** Extracts plain text and any function calls out of a candidate's parts. */
function readParts(parts: GeminiPart[] | undefined): { text: string; toolCalls: AIResponse['toolCalls'] } {
  const text = parts?.map(p => p.text || '').join('') || '';
  const calls = (parts || [])
    .filter((p): p is GeminiPart & { functionCall: NonNullable<GeminiPart['functionCall']> } => !!p.functionCall)
    .map((p, i) => ({ id: `${p.functionCall.name}-${Date.now()}-${i}`, name: p.functionCall.name, arguments: p.functionCall.args }));
  return { text, toolCalls: calls.length > 0 ? calls : undefined };
}

export class GeminiService implements IAIService {
  private apiKey: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  private defaultModel = 'gemini-2.0-flash';
  private defaultEmbeddingModel = 'text-embedding-004';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.VITE_GEMINI_API_KEY;
  }

  async chat(messages: ChatMessage[], modelConfig: AIModelConfig, tools?: ToolDefinition[]): Promise<AIResponse> {
    const model = modelConfig.model || this.defaultModel;
    const { contents, systemInstruction } = toGeminiRequest(messages);

    const requestBody: GeminiGenerateRequest = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: modelConfig.temperature,
        topP: modelConfig.topP,
        maxOutputTokens: modelConfig.maxTokens,
      },
      ...toGeminiTools(tools),
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
      const { text, toolCalls } = readParts(data.candidates?.[0]?.content?.parts);

      return {
        text,
        toolCalls,
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
    onChunk: (chunk: string) => void,
    tools?: ToolDefinition[]
  ): Promise<AIResponse> {
    const model = modelConfig.model || this.defaultModel;
    const { contents, systemInstruction } = toGeminiRequest(messages);

    const requestBody: GeminiGenerateRequest = {
      contents,
      systemInstruction,
      generationConfig: {
        temperature: modelConfig.temperature,
        topP: modelConfig.topP,
        maxOutputTokens: modelConfig.maxTokens,
      },
      ...toGeminiTools(tools),
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
      const toolCalls: NonNullable<AIResponse['toolCalls']> = [];

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
            const { text: chunkText, toolCalls: chunkCalls } = readParts(parsed.candidates?.[0]?.content?.parts);
            if (chunkText) {
              fullText += chunkText;
              onChunk(chunkText);
            }
            if (chunkCalls) toolCalls.push(...chunkCalls);
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

      return { text: fullText, toolCalls: toolCalls.length > 0 ? toolCalls : undefined, usage, model, provider: 'gemini' };
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
