import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiService } from '@data/services/ai/gemini';
import type { AIModelConfig, ChatMessage } from '@domain/entities';

const baseConfig: AIModelConfig = {
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  temperature: 0.7,
  maxTokens: 1024,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('GeminiService', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isAvailable is false with no API key, without calling fetch', async () => {
    const service = new GeminiService('');
    await expect(service.isAvailable()).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends system messages via systemInstruction and maps assistant -> model role', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [{ content: { role: 'model', parts: [{ text: 'Oi! Como posso ajudar?' }] } }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
      })
    );

    const service = new GeminiService('fake-key');
    const messages: ChatMessage[] = [
      { id: '1', role: 'system', content: 'Você é a Phennellopy.', timestamp: new Date() },
      { id: '2', role: 'user', content: 'Oi', timestamp: new Date() },
      { id: '3', role: 'assistant', content: 'Olá!', timestamp: new Date() },
    ];

    const response = await service.chat(messages, baseConfig);

    expect(response.text).toBe('Oi! Como posso ajudar?');
    expect(response.provider).toBe('gemini');
    expect(response.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('gemini-2.0-flash:generateContent');
    expect(String(url)).toContain('key=fake-key');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Você é a Phennellopy.' }] });
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Oi' }] },
      { role: 'model', parts: [{ text: 'Olá!' }] },
    ]);
  });

  it('throws an AIServiceError when the API responds with an error status', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'quota exceeded' }, false, 429));

    const service = new GeminiService('fake-key');
    await expect(
      service.chat([{ id: '1', role: 'user', content: 'oi', timestamp: new Date() }], baseConfig)
    ).rejects.toThrow(/Gemini API error: 429/);
  });

  it('getEmbedding returns the values array from embedContent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ embedding: { values: [0.1, 0.2, 0.3] } }));

    const service = new GeminiService('fake-key');
    const embedding = await service.getEmbedding('lembrar disso', baseConfig);

    expect(embedding).toEqual([0.1, 0.2, 0.3]);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('text-embedding-004:embedContent');
  });
});
