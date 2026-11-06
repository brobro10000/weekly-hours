import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSchedule, saveSchedule, SCHEDULE_STORAGE_KEY } from './schedule-storage';
import type { Schedule, TimeEvent } from './schedule-types';
import { STORAGE_KEY } from './storage';

const recurring: TimeEvent = {
  id: 'weekly-focus',
  title: 'Focus time',
  category: 'counted',
  date: '2026-11-02',
  start: 540,
  end: 600,
  recurrence: { weekdays: [1, 3], intervalWeeks: 2, until: '2027-02-01' },
  excludedDates: ['2026-11-04'],
};

function stubStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
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

describe('loading and migrating schedules', () => {
  it('starts with an empty writable schedule without writing either storage key', () => {
    const { storage } = stubStorage();
    expect(loadSchedule()).toEqual({
      schedule: { version: 2, events: [], legacy: {} }, error: null, writable: true,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('migrates earlier minute totals in memory, preserving zero without inventing event times', () => {
    const legacy = { '2026-11-02': 390, '2026-11-03': 0 };
    const raw = JSON.stringify(legacy);
    const { storage, values } = stubStorage({ [STORAGE_KEY]: raw });
    expect(loadSchedule()).toEqual({
      schedule: { version: 2, events: [], legacy }, error: null, writable: true,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(values.has(SCHEDULE_STORAGE_KEY)).toBe(false);
  });

  it('loads valid recurring rules and uses the v2 legacy totals instead of stale v1 entries', () => {
    const schedule: Schedule = { version: 2, events: [recurring], legacy: { '2026-11-02': 390 } };
    const { storage } = stubStorage({
      [STORAGE_KEY]: '{"2026-11-02":480}',
      [SCHEDULE_STORAGE_KEY]: JSON.stringify(schedule),
    });
    expect(loadSchedule()).toEqual({ schedule, error: null, writable: true });
    expect(storage.getItem).not.toHaveBeenCalledWith(STORAGE_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('rejects corrupt or invalid v2 payloads intact without falling back to earlier data', () => {
    for (const raw of ['', '{', 'null', '[]', 'true', '{"version":1,"events":[],"legacy":{}}',
      '{"version":2,"events":[],"legacy":{"2026-02-29":60}}']) {
      const { storage, values } = stubStorage({
        [SCHEDULE_STORAGE_KEY]: raw,
        [STORAGE_KEY]: '{"2026-11-02":390}',
      });
      expect(loadSchedule()).toMatchObject({
        schedule: { version: 2, events: [], legacy: {} }, writable: false, error: expect.any(String),
      });
      expect(values.get(SCHEDULE_STORAGE_KEY)).toBe(raw);
      expect(storage.getItem).not.toHaveBeenCalledWith(STORAGE_KEY);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it('rejects overlapping persisted events without rewriting the schedule', () => {
    const schedule: Schedule = {
      version: 2,
      events: [recurring, { ...recurring, id: 'conflicting', category: 'away', start: 570, end: 630 }],
      legacy: {},
    };
    const raw = JSON.stringify(schedule);
    const { storage, values } = stubStorage({ [SCHEDULE_STORAGE_KEY]: raw });
    expect(loadSchedule()).toMatchObject({ writable: false, error: expect.any(String) });
    expect(values.get(SCHEDULE_STORAGE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('preserves corrupt earlier data and disables saving when migration cannot read it', () => {
    const raw = '{"2026-11-02":"invalid"}';
    const { storage, values } = stubStorage({ [STORAGE_KEY]: raw });
    expect(loadSchedule()).toMatchObject({ writable: false, error: expect.any(String) });
    expect(values.get(STORAGE_KEY)).toBe(raw);
    expect(values.has(SCHEDULE_STORAGE_KEY)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('handles denied storage reads without throwing into the page', () => {
    const { storage } = stubStorage();
    storage.getItem.mockImplementation(() => { throw new DOMException('Blocked', 'SecurityError'); });
    expect(loadSchedule()).toMatchObject({ writable: false, error: expect.stringContaining('could not be read') });
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('saving schedules', () => {
  it('persists v2 changes and leaves the earlier storage key untouched', () => {
    const raw = '{"2026-11-02":390,"2026-11-03":0}';
    const { values } = stubStorage({ [STORAGE_KEY]: raw });
    const schedule = loadSchedule().schedule;
    schedule.events.push(recurring);
    expect(saveSchedule(schedule)).toBeNull();
    expect(loadSchedule().schedule).toEqual(schedule);
    expect(values.get(STORAGE_KEY)).toBe(raw);
  });

  it('refuses invalid schedules before writing any new data', () => {
    const existing: Schedule = { version: 2, events: [], legacy: {} };
    const raw = JSON.stringify(existing);
    const { storage, values } = stubStorage({ [SCHEDULE_STORAGE_KEY]: raw });
    const invalid: Schedule = { version: 2, events: [{ ...recurring, end: 500 }], legacy: {} };
    expect(saveSchedule(invalid)).toContain('could not be saved');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.get(SCHEDULE_STORAGE_KEY)).toBe(raw);
  });

  it('reports quota and permission failures without altering the existing payload', () => {
    for (const name of ['QuotaExceededError', 'SecurityError']) {
      const raw = '{"version":2,"events":[],"legacy":{}}';
      const { storage, values } = stubStorage({ [SCHEDULE_STORAGE_KEY]: raw });
      storage.setItem.mockImplementation(() => { throw new DOMException('Unavailable', name); });
      expect(saveSchedule({ version: 2, events: [recurring], legacy: {} }))
        .toContain('allow site storage');
      expect(values.get(SCHEDULE_STORAGE_KEY)).toBe(raw);
    }
  });
});
