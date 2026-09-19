import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Memory, ToolCall } from '@domain/entities';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

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

const indexedDBMock = {
  create: vi.fn(),
  findAll: vi.fn(),
};

vi.mock('../../data/storage/indexeddb', () => ({ indexedDBService: indexedDBMock }));
vi.mock('../../data/storage/sqlite', () => ({ sqliteService: { create: vi.fn(), findAll: vi.fn() } }));

describe('assistant tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes the expected tool names to providers', async () => {
    const { assistantTools } = await import('./index');
    expect(assistantTools.map(t => t.name)).toEqual([
      'save_memory',
      'search_memories',
      'update_setting',
      'get_current_datetime',
    ]);
  });

  it('save_memory creates a memory and adds it to the store', async () => {
    const created = makeMemory({ questionText: 'qual a senha do wifi', answerText: '12345678' });
    indexedDBMock.create.mockResolvedValueOnce(created);

    const { executeTool } = await import('./index');
    const { useAppStore } = await import('../stores/app');

    const call: ToolCall = {
      id: 'call-1',
      name: 'save_memory',
      arguments: { question: 'qual a senha do wifi', answer: '12345678' },
    };

    const result = await executeTool(call);

    expect(indexedDBMock.create).toHaveBeenCalledWith({
      questionText: 'qual a senha do wifi',
      questionVoice: 'qual a senha do wifi',
      answerText: '12345678',
      answerVoice: '12345678',
    });
    expect(result).toContain('qual a senha do wifi');
    expect(useAppStore.getState().memories.some(m => m.id === created.id)).toBe(true);
  });

  it('save_memory reports an error instead of throwing when arguments are missing', async () => {
    const { executeTool } = await import('./index');

    const result = await executeTool({ id: 'call-1', name: 'save_memory', arguments: { question: 'oi' } });

    expect(result).toMatch(/Erro/);
    expect(indexedDBMock.create).not.toHaveBeenCalled();
  });

  it('search_memories filters by a case-insensitive substring match', async () => {
    indexedDBMock.findAll.mockResolvedValueOnce([
      makeMemory({ id: '1', questionText: 'Qual a senha do WiFi', answerText: '12345678' }),
      makeMemory({ id: '2', questionText: 'que dia é hoje', answerText: 'não sei' }),
    ]);

    const { executeTool } = await import('./index');
    const result = await executeTool({ id: 'call-1', name: 'search_memories', arguments: { query: 'wifi' } });

    expect(result).toContain('Qual a senha do WiFi');
    expect(result).not.toContain('que dia é hoje');
  });

  it('search_memories reports when nothing matches', async () => {
    indexedDBMock.findAll.mockResolvedValueOnce([]);

    const { executeTool } = await import('./index');
    const result = await executeTool({ id: 'call-1', name: 'search_memories', arguments: { query: 'nada' } });

    expect(result).toMatch(/Nenhuma memória/);
  });

  it('update_setting changes an allowed setting', async () => {
    const { executeTool } = await import('./index');
    const { useAppStore } = await import('../stores/app');

    const result = await executeTool({ id: 'call-1', name: 'update_setting', arguments: { key: 'theme', value: 'light' } });

    expect(result).toContain('light');
    expect(useAppStore.getState().settings.theme).toBe('light');
  });

  it('update_setting refuses a setting outside the allowlist', async () => {
    const { executeTool } = await import('./index');

    const result = await executeTool({ id: 'call-1', name: 'update_setting', arguments: { key: 'syncEnabled', value: 'false' } });

    expect(result).toMatch(/não é permitida/);
  });

  it('get_current_datetime returns a non-empty string without touching storage', async () => {
    const { executeTool } = await import('./index');

    const result = await executeTool({ id: 'call-1', name: 'get_current_datetime', arguments: {} });

    expect(result.length).toBeGreaterThan(0);
    expect(indexedDBMock.findAll).not.toHaveBeenCalled();
  });

  it('reports an error for an unknown tool name instead of throwing', async () => {
    const { executeTool } = await import('./index');

    const result = await executeTool({ id: 'call-1', name: 'delete_everything', arguments: {} });

    expect(result).toMatch(/desconhecida/);
  });
});
