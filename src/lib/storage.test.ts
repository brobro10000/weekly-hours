import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEntries, saveEntries, STORAGE_KEY } from './storage';

function stubStorage(raw: string | null = null) {
  const values = new Map<string, string>();
  if (raw !== null) values.set(STORAGE_KEY, raw);
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
  vi.stubGlobal('localStorage', storage);
  return { values, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loading saved hours', () => {
  it('starts empty and writable when no saved data exists', () => {
    const { storage } = stubStorage();
    expect(loadEntries()).toEqual({ entries: {}, error: null, writable: true });
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('loads integer minutes including explicit zero and the full-day limit', () => {
    const entries = { '2026-11-02': 390, '2026-11-03': 0, '2026-11-04': 1440 };
    stubStorage(JSON.stringify(entries));
    expect(loadEntries()).toEqual({ entries, error: null, writable: true });
    expect(Object.hasOwn(loadEntries().entries, '2026-11-03')).toBe(true);
  });

  it('rejects invalid JSON and retains the original payload without writing', () => {
    const raw = '{"2026-11-02":390';
    const { storage, values } = stubStorage(raw);
    expect(loadEntries()).toMatchObject({ entries: {}, writable: false, error: expect.any(String) });
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('rejects invalid containers rather than accepting them as saved entries', () => {
    for (const raw of ['null', '[]', '[390]', '42', '"hours"', 'true']) {
      const { storage, values } = stubStorage(raw);
      expect(loadEntries()).toMatchObject({ entries: {}, writable: false, error: expect.any(String) });
      expect(values.get(STORAGE_KEY)).toBe(raw);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it('rejects malformed dates, nonexistent dates, and invalid minute amounts', () => {
    for (const invalid of [
      { '2026-2-01': 480 }, { '2026-02-29': 480 }, { '2026-04-31': 480 }, { '0000-01-01': 480 },
      { '2026-11-02': -1 }, { '2026-11-02': 1441 }, { '2026-11-02': 390.5 },
      { '2026-11-02': '390' }, { '2026-11-02': null }, { '2026-11-02': {} },
    ]) {
      const raw = JSON.stringify(invalid);
      const { storage, values } = stubStorage(raw);
      expect(loadEntries()).toMatchObject({ entries: {}, writable: false, error: expect.any(String) });
      expect(values.get(STORAGE_KEY)).toBe(raw);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it('preserves a mixed valid/invalid payload intact instead of partially loading and rewriting it', () => {
    const raw = JSON.stringify({ '2026-11-02': 390, '2026-11-03': 'broken' });
    const { storage, values } = stubStorage(raw);
    expect(loadEntries()).toMatchObject({ entries: {}, writable: false, error: expect.any(String) });
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('returns an actionable error when reading browser storage is blocked', () => {
    const { storage } = stubStorage();
    storage.getItem.mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    const result = loadEntries();
    expect(result.entries).toEqual({});
    expect(result.writable).toBe(false);
    expect(result.error).toContain('could not be read');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('saving hours', () => {
  it('round-trips minute values, preserves zero, and persists removal of an entry', () => {
    const { values } = stubStorage();
    expect(saveEntries({ '2026-11-02': 0, '2026-11-03': 510 })).toBeNull();
    expect(values.get(STORAGE_KEY)).toBe('{"2026-11-02":0,"2026-11-03":510}');
    expect(loadEntries().entries).toEqual({ '2026-11-02': 0, '2026-11-03': 510 });
    expect(saveEntries({ '2026-11-03': 510 })).toBeNull();
    expect(loadEntries().entries).toEqual({ '2026-11-03': 510 });
  });

  it('reports quota failures while leaving previously persisted hours untouched', () => {
    const raw = '{"2026-11-02":390}';
    const { storage, values } = stubStorage(raw);
    storage.setItem.mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    expect(saveEntries({ '2026-11-02': 510 })).toContain('could not save');
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(loadEntries().entries).toEqual({ '2026-11-02': 390 });
  });

  it('reports denied writes without throwing into the hours input handler', () => {
    const { storage } = stubStorage();
    storage.setItem.mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(saveEntries({ '2026-11-02': 480 })).toContain('allow site storage');
  });
});
