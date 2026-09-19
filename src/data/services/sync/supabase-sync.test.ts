import { describe, it, expect, vi, afterEach } from 'vitest';
import { SupabaseSyncService } from '@data/services/sync/supabase-sync';
import type { Memory } from '@domain/entities';

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    questionText: 'qual meu nome mesmo?',
    questionVoice: 'qual meu nome mesmo',
    answerText: 'Seu nome é Douglas.',
    answerVoice: 'Seu nome é Douglas.',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    synced: false,
    ...overrides,
  };
}

describe('SupabaseSyncService', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isConfigured is false and pushMemories throws when there is no url/key', async () => {
    const service = new SupabaseSyncService('', '');
    expect(service.isConfigured()).toBe(false);
    await expect(service.pushMemory(makeMemory())).rejects.toThrow(/não configurado/);
  });

  it('resolves without calling fetch for an empty batch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const service = new SupabaseSyncService('https://example.supabase.co', 'anon-key');
    await service.pushMemories([]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('upserts memories via PostgREST with the right headers and snake_case body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);

    const service = new SupabaseSyncService('https://example.supabase.co', 'anon-key');
    await service.pushMemory(makeMemory());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];

    expect(String(url)).toBe('https://example.supabase.co/rest/v1/memories?on_conflict=id');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-key');
    expect(headers.Authorization).toBe('Bearer anon-key');
    expect(headers.Prefer).toContain('resolution=merge-duplicates');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual([
      {
        id: 'mem-1',
        question_text: 'qual meu nome mesmo?',
        question_voice: 'qual meu nome mesmo',
        answer_text: 'Seu nome é Douglas.',
        answer_voice: 'Seu nome é Douglas.',
        embeddings: null,
        metadata: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
    ]);
  });

  it('throws with the response status and body when the request fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid api key' });
    vi.stubGlobal('fetch', fetchMock);

    const service = new SupabaseSyncService('https://example.supabase.co', 'anon-key');
    await expect(service.pushMemory(makeMemory())).rejects.toThrow(/Supabase sync falhou \(401\)/);
  });
});
