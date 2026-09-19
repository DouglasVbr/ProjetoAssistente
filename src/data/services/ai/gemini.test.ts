import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiService } from '@data/services/ai/gemini';
import type { AIModelConfig, ChatMessage, ToolDefinition } from '@domain/entities';

const baseConfig: AIModelConfig = {
  provider: 'gemini',
  model: 'gemini-2.0-flash',
  temperature: 0.7,
  maxTokens: 1024,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

const sampleTools: ToolDefinition[] = [
  {
    name: 'get_current_datetime',
    description: 'Retorna a data e hora atuais.',
    parameters: { type: 'object', properties: {} },
  },
];

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

  it('sends tools as functionDeclarations when provided', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ candidates: [{ content: { role: 'model', parts: [{ text: 'ok' }] } }] })
    );

    const service = new GeminiService('fake-key');
    await service.chat([{ id: '1', role: 'user', content: 'que horas são?', timestamp: new Date() }], baseConfig, sampleTools);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.tools).toEqual([
      { functionDeclarations: [{ name: 'get_current_datetime', description: 'Retorna a data e hora atuais.', parameters: { type: 'object', properties: {} } }] },
    ]);
  });

  it('parses a functionCall part in the response into AIResponse.toolCalls', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ functionCall: { name: 'get_current_datetime', args: {} } }],
            },
          },
        ],
      })
    );

    const service = new GeminiService('fake-key');
    const response = await service.chat(
      [{ id: '1', role: 'user', content: 'que horas são?', timestamp: new Date() }],
      baseConfig,
      sampleTools
    );

    expect(response.text).toBe('');
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls?.[0]).toMatchObject({ name: 'get_current_datetime', arguments: {} });
  });

  it('maps an assistant tool-call message and a tool-result message into model/function turns', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ candidates: [{ content: { role: 'model', parts: [{ text: 'São 10h.' }] } }] }));

    const service = new GeminiService('fake-key');
    const messages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'que horas são?', timestamp: new Date() },
      {
        id: '2',
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: [{ id: 'call-1', name: 'get_current_datetime', arguments: {} }],
      },
      {
        id: '3',
        role: 'tool',
        content: '10:00',
        timestamp: new Date(),
        toolCallId: 'call-1',
        toolName: 'get_current_datetime',
      },
    ];

    await service.chat(messages, baseConfig, sampleTools);

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'que horas são?' }] },
      { role: 'model', parts: [{ functionCall: { name: 'get_current_datetime', args: {} } }] },
      { role: 'function', parts: [{ functionResponse: { name: 'get_current_datetime', response: { content: '10:00' } } }] },
    ]);
  });
});
