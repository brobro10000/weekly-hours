import type { Schedule, TimeEvent } from './schedule-types';

export type SchedulePatch = {
  events: Record<string, TimeEvent | null>;
  legacy: Record<string, number | null>;
  timelineEnabled: Record<string, boolean | null>;
};

export const emptyPatch = (): SchedulePatch => ({ events: {}, legacy: {}, timelineEnabled: {} });
export const hasPendingChanges = (patch: SchedulePatch) =>
  Object.values(patch).some(changes => Object.keys(changes).length > 0);

function applyDailyChanges<T>(saved: Record<string, T>, changes: Record<string, T | null>): Record<string, T> {
  const merged = { ...saved };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

function recordDailyChanges<T>(pending: Record<string, T | null>, before: Record<string, T>, after: Record<string, T>) {
  const changes = { ...pending };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) changes[key] = after[key] ?? null;
  }
  return changes;
}

/** Merge pending edits before validation so a user can correct a cross-tab conflict. */
export function applyPatch(schedule: Schedule, patch: SchedulePatch): Schedule {
  const events = new Map(schedule.events.map(event => [event.id, event]));
  for (const [id, event] of Object.entries(patch.events)) {
    if (event === null) events.delete(id);
    else events.set(id, event);
  }
  const merged: Schedule = {
    version: 2, events: [...events.values()], legacy: applyDailyChanges(schedule.legacy, patch.legacy),
  };
  const preferences = applyDailyChanges(schedule.timelineEnabled ?? {}, patch.timelineEnabled);
  if (Object.keys(preferences).length) merged.timelineEnabled = preferences;
  return merged;
}

export function recordChanges(pending: SchedulePatch, before: Schedule, after: Schedule): SchedulePatch {
  const events = { ...pending.events };
  const previous = new Map(before.events.map(event => [event.id, event]));
  const next = new Map(after.events.map(event => [event.id, event]));
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    if (JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id))) events[id] = next.get(id) ?? null;
  }
  return {
    events,
    legacy: recordDailyChanges(pending.legacy, before.legacy, after.legacy),
    timelineEnabled: recordDailyChanges(pending.timelineEnabled, before.timelineEnabled ?? {}, after.timelineEnabled ?? {}),
  };
}
