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
});
