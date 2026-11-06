import { validateSchedule } from './schedule';
import type { Schedule } from './schedule-types';
import { loadEntries } from './storage';

export const SCHEDULE_STORAGE_KEY = 'weekly-hours.schedule.v2';
export type StoredSchedule = { schedule: Schedule; error: string | null; writable: boolean };

const emptySchedule = (): Schedule => ({ version: 2, events: [], legacy: {} });

export function loadSchedule(): StoredSchedule {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY);
    if (raw === null) {
      const earlier = loadEntries();
      return {
        schedule: { version: 2, events: [], legacy: earlier.entries },
        error: earlier.error,
        writable: earlier.writable,
      };
    }

    const schedule: Schedule = JSON.parse(raw);
    const validationError = validateSchedule(schedule);
    if (validationError) throw new Error(validationError);
    return { schedule, error: null, writable: true };
  } catch {
    return {
      schedule: emptySchedule(),
      writable: false,
      error: 'Saved events could not be read. Your existing data has been kept. Changes in this tab will not be saved.',
    };
  }
}

export function saveSchedule(schedule: Schedule): string | null {
  try {
    const validationError = validateSchedule(schedule);
    if (validationError) return `These events could not be saved: ${validationError}`;
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
    return null;
  } catch {
    return 'Your browser could not save these events. Keep this tab open and allow site storage before trying again.';
  }
}
