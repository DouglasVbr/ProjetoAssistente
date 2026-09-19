import { describe, it, expect, vi } from 'vitest';
import {
  isEmpty,
  truncate,
  capitalize,
  slugify,
  parseJSON,
  groupBy,
  uniqueBy,
  retry,
  debounce,
  throttle,
  deepClone,
} from '@core/utils';

describe('isEmpty', () => {
  it('treats null/undefined/blank string/empty array/empty object as empty', () => {
    expect(isEmpty(null)).toBe(true);
    expect(isEmpty(undefined)).toBe(true);
    expect(isEmpty('')).toBe(true);
    expect(isEmpty('   ')).toBe(true);
    expect(isEmpty([])).toBe(true);
    expect(isEmpty({})).toBe(true);
  });

  it('treats non-empty values as not empty', () => {
    expect(isEmpty('oi')).toBe(false);
    expect(isEmpty([1])).toBe(false);
    expect(isEmpty({ a: 1 })).toBe(false);
    expect(isEmpty(0)).toBe(false);
  });
});

describe('truncate', () => {
  it('leaves short text untouched', () => {
    expect(truncate('oi', 10)).toBe('oi');
  });

  it('cuts long text and appends ellipsis within maxLength', () => {
    const result = truncate('phennellopy assistente de voz', 10);
    expect(result).toHaveLength(10);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('capitalize', () => {
  it('uppercases the first letter and lowercases the rest', () => {
    expect(capitalize('phennellopy')).toBe('Phennellopy');
    expect(capitalize('OLÁ MUNDO')).toBe('Olá mundo');
  });
});

describe('slugify', () => {
  it('strips accents, lowercases and dashes', () => {
    expect(slugify('Memória de Voz!')).toBe('memoria-de-voz');
    expect(slugify('  Café com Açúcar  ')).toBe('cafe-com-acucar');
  });
});

describe('parseJSON', () => {
  it('parses valid JSON', () => {
    expect(parseJSON('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('falls back on invalid JSON instead of throwing', () => {
    expect(parseJSON('not json', { fallback: true })).toEqual({ fallback: true });
  });
});

describe('groupBy', () => {
  it('groups items by a key', () => {
    const items = [
      { type: 'voz', id: 1 },
      { type: 'texto', id: 2 },
      { type: 'voz', id: 3 },
    ];
    expect(groupBy(items, 'type')).toEqual({
      voz: [{ type: 'voz', id: 1 }, { type: 'voz', id: 3 }],
      texto: [{ type: 'texto', id: 2 }],
    });
  });
});

describe('uniqueBy', () => {
  it('keeps only the first occurrence per key', () => {
    const items = [{ id: 'a', v: 1 }, { id: 'a', v: 2 }, { id: 'b', v: 3 }];
    expect(uniqueBy(items, 'id')).toEqual([{ id: 'a', v: 1 }, { id: 'b', v: 3 }]);
  });
});

describe('deepClone', () => {
  it('clones nested objects/arrays/dates without sharing references', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const original = { a: 1, nested: { list: [1, 2, 3] as number[], detail: { c: date } } };
    const clone = deepClone(original);

    expect(clone).toEqual(original);
    expect(clone).not.toBe(original);
    expect(clone.nested).not.toBe(original.nested);
    expect(clone.nested.list).not.toBe(original.nested.list);
    expect(clone.nested.detail.c).not.toBe(date);
    expect(clone.nested.detail.c.getTime()).toBe(date.getTime());
  });
});

describe('retry', () => {
  it('returns the result on the first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await retry(fn, { attempts: 3, baseDelay: 1, maxDelay: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and eventually succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('falhou 1'))
      .mockRejectedValueOnce(new Error('falhou 2'))
      .mockResolvedValue('ok');

    const result = await retry(fn, { attempts: 3, baseDelay: 1, maxDelay: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws the last error once attempts are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('sempre falha'));
    await expect(retry(fn, { attempts: 2, baseDelay: 1, maxDelay: 1 })).rejects.toThrow('sempre falha');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('debounce', () => {
  it('only calls the function once after the wait period, with the last args', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('a');
    debounced('b');
    debounced('c');

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');

    vi.useRealTimers();
  });
});

describe('throttle', () => {
  it('calls immediately then ignores calls within the limit window', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('first');
    throttled('ignored');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('first');

    vi.advanceTimersByTime(100);
    throttled('after-window');
    expect(fn).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});
