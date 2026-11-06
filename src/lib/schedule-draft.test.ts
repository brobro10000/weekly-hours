import { describe, expect, it } from 'vitest';
import { applyPatch, emptyPatch, hasPendingChanges, recordChanges } from './schedule-draft';
import { upsertEvent, validateSchedule } from './schedule';
import type { Schedule, TimeEvent } from './schedule-types';

const event = (id: string, start = 540, end = 600): TimeEvent => ({
  id, title: id, category: 'counted', date: '2026-11-02', start, end, recurrence: null, excludedDates: [],
});
const empty: Schedule = { version: 2, events: [], legacy: {} };

describe('unsaved schedule changes', () => {
  it('merges local edits with unrelated saved events and preserves zero', () => {
    const local = { ...empty, events: [event('local')], legacy: { '2026-11-03': 0 } };
    const pending = recordChanges(emptyPatch(), empty, local);
    const merged = applyPatch({ ...empty, events: [event('remote', 600, 660)] }, pending);
    expect(merged.events.map(item => item.id)).toEqual(['remote', 'local']);
    expect(merged.legacy).toEqual({ '2026-11-03': 0 });
    expect(hasPendingChanges(pending)).toBe(true);
  });

  it('allows a corrective edit after an unsaved event conflicts with another tab', () => {
    const local = { ...empty, events: [event('local')] };
    const pending = recordChanges(emptyPatch(), empty, local);
    const remote = { ...empty, events: [event('remote', 570, 630)] };
    const merged = applyPatch(remote, pending);
    expect(validateSchedule(merged)).toContain('overlaps');
    const corrected = upsertEvent(merged, event('local', 630, 690));
    expect(validateSchedule(corrected)).toBeNull();
    const correctedPatch = recordChanges(pending, merged, corrected);
    expect(applyPatch(remote, correctedPatch)).toEqual(corrected);
  });

  it('retains removals across failed writes without removing unrelated data', () => {
    const base = { ...empty, events: [event('removed')], legacy: { '2026-11-03': 120 } };
    const pending = recordChanges(emptyPatch(), base, empty);
    const remote = { ...base, events: [...base.events, event('remote', 600, 660)] };
    expect(applyPatch(remote, pending)).toEqual({ ...empty, events: [event('remote', 600, 660)] });
    expect(base.events).toHaveLength(1);
  });

  it('retries per-date switches alongside events and preferences saved in another tab', () => {
    const monday = '2026-11-02';
    const tuesday = '2026-11-03';
    const firstEdit = { ...empty, timelineEnabled: { [monday]: true } };
    const firstPending = recordChanges(emptyPatch(), empty, firstEdit);
    expect(hasPendingChanges(firstPending)).toBe(true);

    const remote = { ...empty, events: [event('remote')], timelineEnabled: { [tuesday]: true } };
    const merged = applyPatch(remote, firstPending);
    expect(merged.timelineEnabled).toEqual({ [monday]: true, [tuesday]: true });
    const secondEdit = { ...merged, timelineEnabled: { ...merged.timelineEnabled, [monday]: false } };
    const nextPending = recordChanges(firstPending, merged, secondEdit);
    expect(applyPatch(remote, nextPending)).toEqual({
      ...remote, timelineEnabled: { [monday]: false, [tuesday]: true },
    });
  });

  it('clears a date preference independently of other dates and omits the last preference when cleared', () => {
    const monday = '2026-11-02';
    const tuesday = '2026-11-03';
    const base = { ...empty, timelineEnabled: { [monday]: false } };
    const pending = recordChanges(emptyPatch(), base, empty);
    expect(hasPendingChanges(pending)).toBe(true);
    expect(applyPatch(base, pending)).toEqual(empty);
    const remote = { ...base, timelineEnabled: { [monday]: false, [tuesday]: false } };
    expect(applyPatch(remote, pending)).toEqual({ ...empty, timelineEnabled: { [tuesday]: false } });
  });
});
