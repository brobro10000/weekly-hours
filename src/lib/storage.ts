import { dateKey, parseDateKey } from './time';

export const STORAGE_KEY = 'weekly-hours.entries.v1';
export type Entries = Record<string, number>;
export type StoredEntries = { entries: Entries; error: string | null; writable: boolean };

export function loadEntries(): StoredEntries {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: {}, error: null, writable: true };
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid saved data');
    for (const [key, value] of Object.entries(data)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || dateKey(parseDateKey(key)) !== key
        || typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 1440) {
        throw new Error('Invalid saved entry');
      }
    }
    return { entries: data as Entries, error: null, writable: true };
  } catch {
    return {
      entries: {}, writable: false,
      error: 'Saved hours could not be read. Your existing data has been kept. Changes in this tab will not be saved.',
    };
  }
}

export function saveEntries(entries: Entries): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return null;
  } catch {
    return 'Your browser could not save these hours. Keep this tab open and allow site storage before trying again.';
  }
}
