import type { Schedule, TimeEvent } from './schedule-types';

export type SchedulePatch = {
  events: Record<string, TimeEvent | null>;
  legacy: Record<string, number | null>;
};

export const emptyPatch = (): SchedulePatch => ({ events: {}, legacy: {} });
export const hasPendingChanges = (patch: SchedulePatch) =>
  Object.keys(patch.events).length > 0 || Object.keys(patch.legacy).length > 0;

/** Merge pending edits before validation so a user can correct a cross-tab conflict. */
export function applyPatch(schedule: Schedule, patch: SchedulePatch): Schedule {
  const events = new Map(schedule.events.map(event => [event.id, event]));
  for (const [id, event] of Object.entries(patch.events)) {
    if (event === null) events.delete(id);
    else events.set(id, event);
  }
  const legacy = { ...schedule.legacy };
  for (const [key, minutes] of Object.entries(patch.legacy)) {
    if (minutes === null) delete legacy[key];
    else legacy[key] = minutes;
  }
  return { version: 2, events: [...events.values()], legacy };
}

export function recordChanges(pending: SchedulePatch, before: Schedule, after: Schedule): SchedulePatch {
  const events = { ...pending.events };
  const legacy = { ...pending.legacy };
  const previous = new Map(before.events.map(event => [event.id, event]));
  const next = new Map(after.events.map(event => [event.id, event]));
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    if (JSON.stringify(previous.get(id)) !== JSON.stringify(next.get(id))) events[id] = next.get(id) ?? null;
  }
  for (const key of new Set([...Object.keys(before.legacy), ...Object.keys(after.legacy)])) {
    if (before.legacy[key] !== after.legacy[key]) legacy[key] = after.legacy[key] ?? null;
  }
  return { events, legacy };
}
