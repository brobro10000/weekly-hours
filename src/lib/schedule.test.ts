import { describe, expect, it } from 'vitest';
import type { Schedule, TimeEvent } from './schedule-types';
import {
  dayTotals, eventsForDate, findConflict, formatClock, occursOn, parseClock, removeEvent,
  upsertEvent, validateEvent, validateSchedule,
} from './schedule';

const block = (overrides: Partial<TimeEvent> = {}): TimeEvent => ({
  id: 'work', title: 'Project work', category: 'counted', date: '2026-11-02', start: 540, end: 600,
  recurrence: null, excludedDates: [], ...overrides,
});
const recurring = (overrides: Partial<TimeEvent> = {}): TimeEvent => block({
  recurrence: { weekdays: [1, 3], intervalWeeks: 1, until: null }, ...overrides,
});
const schedule = (events: TimeEvent[] = [], legacy: Record<string, number> = {}): Schedule => ({
  version: 2, events, legacy,
});

describe('clock input', () => {
  it('round-trips minute boundaries including midnight at the end of a day', () => {
    for (const minutes of [0, 1, 59, 60, 540, 1439, 1440]) expect(parseClock(formatClock(minutes))).toBe(minutes);
    expect(formatClock(1440)).toBe('24:00');
  });

  it('rejects ambiguous and impossible clock strings', () => {
    for (const value of ['', '9:00', '09:0', '24:01', '25:00', '12:60', '-1:00', '09:00 AM', ' 09:00']) {
      expect(parseClock(value)).toBeNull();
    }
    for (const value of [-1, 1441, 1.5, NaN]) expect(() => formatClock(value)).toThrow();
  });
});

describe('occurrences and category totals', () => {
  it('shows a one-off only on its saved date', () => {
    expect(occursOn(block(), '2026-11-02')).toBe(true);
    expect(occursOn(block(), '2026-11-03')).toBe(false);
    expect(occursOn(block(), '2026-02-30')).toBe(false);
  });

  it('repeats selected days without scheduling earlier dates in the start week', () => {
    const event = recurring({ date: '2026-11-04' });
    expect(occursOn(event, '2026-11-02')).toBe(false);
    expect(occursOn(event, '2026-11-04')).toBe(true);
    expect(occursOn(event, '2026-11-09')).toBe(true);
    expect(occursOn(event, '2026-11-10')).toBe(false);
  });

  it('anchors multiweek recurrence to Monday and includes its end date', () => {
    const event = recurring({ recurrence: { weekdays: [1, 3], intervalWeeks: 2, until: '2026-11-18' } });
    expect(occursOn(event, '2026-11-09')).toBe(false);
    expect(occursOn(event, '2026-11-16')).toBe(true);
    expect(occursOn(event, '2026-11-18')).toBe(true);
    expect(occursOn(event, '2026-11-30')).toBe(false);
  });

  it('supports Sundays, cross-year recurrence, and DST without shifting civil time', () => {
    const event = recurring({ date: '2026-12-27', recurrence: { weekdays: [0], intervalWeeks: 2, until: null } });
    expect(occursOn(event, '2027-01-03')).toBe(false);
    expect(occursOn(event, '2027-01-10')).toBe(true);
    const spring = recurring({ date: '2026-03-02', recurrence: { weekdays: [1], intervalWeeks: 1, until: null } });
    expect(occursOn(spring, '2026-03-09')).toBe(true);
  });

  it('keeps holiday occurrences editable and honors explicit skipped dates', () => {
    const event = recurring({ date: '2026-11-05', recurrence: { weekdays: [4], intervalWeeks: 1, until: null },
      excludedDates: ['2026-11-19'] });
    expect(occursOn(event, '2026-11-19')).toBe(false);
    expect(occursOn(event, '2026-11-26')).toBe(true);
  });

  it('sorts visible events without changing the original array', () => {
    const events = [block({ id: 'late', start: 900, end: 960 }), block({ id: 'early' })];
    expect(eventsForDate(events, '2026-11-02').map(event => event.id)).toEqual(['early', 'late']);
    expect(events[0].id).toBe('late');
  });

  it('counts green time and earlier totals while keeping orange and red separate', () => {
    const state = schedule([
      block({ start: 540, end: 930 }),
      block({ id: 'related', category: 'related', start: 930, end: 990 }),
      block({ id: 'away', category: 'away', start: 990, end: 1020 }),
    ], { '2026-11-02': 120 });
    expect(dayTotals(state, '2026-11-02')).toEqual({ counted: 510, related: 60, away: 30, hasEntries: true });
    expect(dayTotals(state, '2026-11-03')).toEqual({ counted: 0, related: 0, away: 0, hasEntries: false });
    expect(dayTotals(schedule([], { '2026-11-03': 0 }), '2026-11-03').hasEntries).toBe(true);
  });
});

describe('event validation', () => {
  it('accepts a full-day block but rejects reversed, zero-length, and overnight ranges', () => {
    expect(validateEvent(block({ start: 0, end: 1440 }))).toBeNull();
    for (const [start, end] of [[600, 600], [1200, 60], [-1, 600], [0, 1441], [0.5, 60]]) {
      expect(validateEvent(block({ start, end }))).toContain('End time');
    }
  });

  it('rejects malformed stored events instead of throwing', () => {
    for (const event of [null, [], {}, { ...block(), category: 'other' }, { ...block(), date: '2026-02-30' },
      { ...block(), excludedDates: ['bad'] }, { ...block(), title: 'a'.repeat(121) }]) {
      expect(validateEvent(event as TimeEvent)).toEqual(expect.any(String));
    }
  });

  it('requires valid unique recurrence days and a bounded whole-week interval', () => {
    for (const weekdays of [[], [7], [1, 1], [1.5]]) {
      expect(validateEvent(recurring({ recurrence: { weekdays, intervalWeeks: 1, until: null } }))).not.toBeNull();
    }
    for (const intervalWeeks of [0, 13, 1.5]) {
      expect(validateEvent(recurring({ recurrence: { weekdays: [1], intervalWeeks, until: null } }))).not.toBeNull();
    }
  });

  it('requires a valid inclusive end date that reaches a selected weekday', () => {
    expect(validateEvent(recurring({ recurrence: { weekdays: [1], intervalWeeks: 1, until: '2026-11-01' } })))
      .toContain('end date');
    expect(validateEvent(recurring({ date: '2026-11-03',
      recurrence: { weekdays: [1], intervalWeeks: 1, until: '2026-11-05' } }))).toContain('selected weekday');
    expect(validateEvent(recurring({ recurrence: { weekdays: [1], intervalWeeks: 1, until: '2026-11-02' } })))
      .toBeNull();
  });
});

describe('exact overlap detection', () => {
  it('rejects true intersections but allows touching endpoints and other dates', () => {
    expect(findConflict(block({ id: 'new', start: 599, end: 660 }), [block()])).toEqual({
      date: '2026-11-02', title: 'Project work',
    });
    expect(findConflict(block({ id: 'new', start: 600, end: 660 }), [block()])).toBeNull();
    expect(findConflict(block({ id: 'new', date: '2026-11-03' }), [block()])).toBeNull();
    expect(findConflict(block(), [block()])).toBeNull();
  });

  it('checks recurring blocks against a distant one-off in either direction', () => {
    const distant = block({ id: 'distant', date: '2036-11-03' });
    expect(findConflict(distant, [recurring()])?.date).toBe('2036-11-03');
    expect(findConflict(recurring(), [distant])?.date).toBe('2036-11-03');
  });

  it('finds collisions beyond a year using the full recurrence cycle', () => {
    const left = recurring({ date: '2026-11-02', recurrence: { weekdays: [1], intervalWeeks: 11, until: null } });
    const right = recurring({ id: 'other', date: '2026-11-09',
      recurrence: { weekdays: [1], intervalWeeks: 12, until: null } });
    const conflict = findConflict(left, [right]);
    expect(conflict).not.toBeNull();
    expect(conflict!.date > '2027-11-02').toBe(true);
    expect(occursOn(left, conflict!.date)).toBe(true);
    expect(occursOn(right, conflict!.date)).toBe(true);
  });

  it('finds a later cycle when finite exclusions skip the first collision', () => {
    const left = recurring({ recurrence: { weekdays: [1], intervalWeeks: 12, until: null } });
    const first = findConflict(left, [recurring({ id: 'other', recurrence: left.recurrence })])!;
    const skipped = { ...left, excludedDates: [first.date] };
    const next = findConflict(skipped, [recurring({ id: 'other', recurrence: left.recurrence })])!;
    expect(next.date).toBe('2027-01-25');
  });

  it('recognizes disjoint phases, weekdays, and end dates', () => {
    const left = recurring({ recurrence: { weekdays: [1], intervalWeeks: 2, until: null } });
    expect(findConflict(left, [recurring({ id: 'other', date: '2026-11-09', recurrence: left.recurrence })]))
      .toBeNull();
    expect(findConflict(left, [recurring({ id: 'other',
      recurrence: { weekdays: [2], intervalWeeks: 1, until: null } })])).toBeNull();
    expect(findConflict(left, [recurring({ id: 'other', date: '2026-11-09',
      recurrence: { weekdays: [1], intervalWeeks: 1, until: '2026-11-09' } })])).toBeNull();
  });

  it('returns the earliest conflict regardless of event order', () => {
    const candidate = recurring();
    const result = findConflict(candidate, [block({ id: 'later', date: '2026-11-09', title: 'Later' }),
      block({ id: 'earlier', date: '2026-11-04', title: 'Earlier' })]);
    expect(result).toEqual({ date: '2026-11-04', title: 'Earlier' });
  });

  it('handles skipped initial weekdays before considering the next repeat cycle', () => {
    const left = recurring({ excludedDates: ['2026-11-02'] });
    expect(findConflict(left, [recurring({ id: 'other' })])?.date).toBe('2026-11-04');
  });
});

describe('schedule updates and migration totals', () => {
  it('normalizes an empty title and preserves the input schedule', () => {
    const before = schedule();
    const after = upsertEvent(before, block({ title: '   ' }));
    expect(after.events[0].title).toBe('Counted time');
    expect(before.events).toEqual([]);
  });

  it('edits a one-off in place and validates overlaps atomically', () => {
    const before = schedule([block(), block({ id: 'other', start: 660, end: 720 })]);
    const after = upsertEvent(before, block({ start: 570, end: 630 }));
    expect(after.events).toHaveLength(2);
    expect(after.events[0].start).toBe(570);
    expect(before.events[0].start).toBe(540);
    expect(() => upsertEvent(before, block({ end: 700 }))).toThrow('overlaps');
    expect(before.events[0].end).toBe(600);
  });

  it('edits only one recurring occurrence with a separate replacement', () => {
    const before = schedule([recurring()]);
    const after = upsertEvent(before, recurring({ start: 600, end: 690, category: 'related' }), '2026-11-04', 'occurrence');
    expect(after.events).toHaveLength(2);
    expect(after.events[0].excludedDates).toEqual(['2026-11-04']);
    expect(after.events[1].id).toBe('work@2026-11-04');
    expect(upsertEvent(before, recurring({ start: 600, end: 690, category: 'related' }),
      '2026-11-04', 'occurrence')).toEqual(after);
    expect(eventsForDate(after.events, '2026-11-04')).toMatchObject([
      { start: 600, end: 690, category: 'related', recurrence: null, date: '2026-11-04' },
    ]);
    expect(dayTotals(after, '2026-11-09').counted).toBe(60);
    expect(before.events[0].excludedDates).toEqual([]);
  });

  it('edits the entire series while preserving its id', () => {
    const before = schedule([recurring()]);
    const after = upsertEvent(before, recurring({ start: 600, end: 720 }), '2026-11-04', 'series');
    expect(after.events).toHaveLength(1);
    expect(after.events[0].id).toBe('work');
    expect(dayTotals(after, '2026-11-02').counted).toBe(120);
    expect(dayTotals(after, '2026-11-09').counted).toBe(120);
  });

  it('skips one recurring occurrence or removes a whole series', () => {
    const before = schedule([recurring()]);
    const skipped = removeEvent(before, 'work', '2026-11-04', 'occurrence');
    expect(eventsForDate(skipped.events, '2026-11-04')).toEqual([]);
    expect(eventsForDate(skipped.events, '2026-11-09')).toHaveLength(1);
    expect(removeEvent(before, 'work', '2026-11-04', 'series').events).toEqual([]);
    expect(before.events).toHaveLength(1);
    expect(before.events[0].excludedDates).toEqual([]);
  });

  it('removes detached one-off replacements with a series but preserves independent repeating replacements', () => {
    const initial = upsertEvent(schedule([recurring()]), recurring({ start: 600, end: 690 }),
      '2026-11-04', 'occurrence');
    expect(removeEvent(initial, 'work', '2026-11-09', 'series').events).toEqual([]);
    const independent = upsertEvent(initial, {
      ...initial.events[1], recurrence: { weekdays: [3], intervalWeeks: 1, until: null },
    });
    expect(removeEvent(independent, 'work', '2026-11-09', 'series').events.map(event => event.id))
      .toEqual(['work@2026-11-04']);
  });

  it('removes a one-off and rejects stale recurring edits without mutating data', () => {
    expect(removeEvent(schedule([block()]), 'work', '2026-11-02', 'occurrence').events).toEqual([]);
    const before = schedule([recurring({ excludedDates: ['2026-11-04'] })]);
    expect(() => upsertEvent(before, recurring(), '2026-11-04', 'occurrence')).toThrow('no longer exists');
    expect(() => removeEvent(before, 'work', '2026-11-04', 'occurrence')).toThrow('no longer exists');
    expect(() => removeEvent(before, 'missing', '2026-11-04', 'series')).toThrow('already removed');
  });

  it('rejects corrupt shapes, duplicate ids, and invalid earlier totals', () => {
    for (const state of [null, {}, { ...schedule(), version: 1 }, { ...schedule(), legacy: [] },
      schedule([block(), block()]), schedule([], { '2026-02-30': 480 }), schedule([], { '2026-11-02': -1 }),
      schedule([], { '2026-11-02': 1.5 })]) {
      expect(validateSchedule(state as Schedule)).toEqual(expect.any(String));
    }
  });

  it('checks earlier totals against all categories on specific recurring dates', () => {
    const state = schedule([recurring({ category: 'away', start: 540, end: 660 })], { '2026-11-09': 1380 });
    expect(validateSchedule(state)).toContain('exceed 24 hours on 2026-11-09');
    expect(validateSchedule({ ...state, legacy: { '2026-11-10': 1380 } })).toBeNull();
    expect(validateSchedule({ ...state, legacy: { '2026-11-09': 1320 } })).toBeNull();
  });
});
