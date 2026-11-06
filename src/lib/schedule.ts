import type { DayTotals, EditScope, Schedule, TimeCategory, TimeEvent } from './schedule-types';
import { dateKey, parseDateKey } from './time';

const MINUTES_PER_DAY = 1440;
const DAY_MS = 86_400_000;
const categoryTitles: Record<TimeCategory, string> = {
  counted: 'Counted time', related: 'Related time', away: 'Away from desk',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return dateKey(parseDateKey(value)) === value;
  } catch {
    return false;
  }
}

/** UTC is used only to number civil dates, never to interpret an entered local clock time. */
function dayNumber(key: string): number {
  const date = parseDateKey(key);
  const utc = new Date(0);
  utc.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
  utc.setUTCHours(0, 0, 0, 0);
  return utc.getTime() / DAY_MS;
}

function numberKey(day: number): string {
  const utc = new Date(day * DAY_MS);
  return `${String(utc.getUTCFullYear()).padStart(4, '0')}-${String(utc.getUTCMonth() + 1).padStart(2, '0')}`
    + `-${String(utc.getUTCDate()).padStart(2, '0')}`;
}

const lastSupportedDay = dayNumber('9999-12-31');
const modulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
const weekday = (day: number) => modulo(day + 4, 7);
const monday = (day: number) => day - modulo(weekday(day) + 6, 7);

function gcd(left: number, right: number): number {
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

export function occursOn(event: TimeEvent, key: string): boolean {
  if (!validDate(key) || key < event.date || event.excludedDates.includes(key)) return false;
  if (!event.recurrence) return key === event.date;
  const rule = event.recurrence;
  if (rule.until !== null && key > rule.until) return false;
  const day = dayNumber(key);
  if (!rule.weekdays.includes(weekday(day))) return false;
  const weeks = (monday(day) - monday(dayNumber(event.date))) / 7;
  return weeks >= 0 && weeks % rule.intervalWeeks === 0;
}

export function eventsForDate(events: TimeEvent[], key: string): TimeEvent[] {
  return events.filter(event => occursOn(event, key))
    .sort((left, right) => left.start - right.start || left.end - right.end || left.id.localeCompare(right.id));
}

export function dayTotals(schedule: Schedule, key: string): DayTotals {
  const events = eventsForDate(schedule.events, key);
  const totals: DayTotals = {
    counted: schedule.legacy[key] ?? 0, related: 0, away: 0,
    hasEntries: Object.hasOwn(schedule.legacy, key) || events.length > 0,
  };
  for (const event of events) totals[event.category] += event.end - event.start;
  return totals;
}

export function formatClock(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) {
    throw new Error('Choose a time between 00:00 and 24:00.');
  }
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function parseClock(value: string): number | null {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return value === '24:00' ? MINUTES_PER_DAY : null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function validateEvent(event: TimeEvent): string | null {
  if (!isRecord(event)) return 'This time block could not be read. Create it again.';
  if (typeof event.id !== 'string' || !event.id.trim() || event.id.length > 160) {
    return 'This time block needs a valid identifier. Create it again.';
  }
  if (typeof event.title !== 'string' || event.title.length > 120) return 'Keep the event name to 120 characters or fewer.';
  if (!['counted', 'related', 'away'].includes(event.category)) return 'Choose Counted, Related, or Away for this time.';
  if (!validDate(event.date)) return 'Choose a valid start date.';
  if (!Number.isInteger(event.start) || !Number.isInteger(event.end)
    || event.start < 0 || event.end > MINUTES_PER_DAY || event.start >= event.end) {
    return 'End time must be after start time, between 00:00 and 24:00. Split overnight work into two days.';
  }
  if (!Array.isArray(event.excludedDates) || event.excludedDates.some(key => !validDate(key))
    || new Set(event.excludedDates).size !== event.excludedDates.length) {
    return 'The skipped dates for this recurring event could not be read.';
  }
  if (event.recurrence !== null) {
    const rule = event.recurrence;
    if (!isRecord(rule)) return 'Choose a valid repeat schedule.';
    if (!Array.isArray(rule.weekdays) || rule.weekdays.length === 0 || rule.weekdays.length > 7
      || rule.weekdays.some(day => !Number.isInteger(day) || day < 0 || day > 6)
      || new Set(rule.weekdays).size !== rule.weekdays.length) {
      return 'Choose at least one weekday for the recurring event.';
    }
    if (!Number.isInteger(rule.intervalWeeks) || rule.intervalWeeks < 1 || rule.intervalWeeks > 12) {
      return 'Repeat every 1 to 12 weeks.';
    }
    if (rule.until !== null && (!validDate(rule.until) || rule.until < event.date)) {
      return 'The end date must be on or after the start date.';
    }
    if (rule.until !== null) {
      const firstDay = dayNumber(event.date);
      const lastDay = Math.min(dayNumber(rule.until), firstDay + rule.intervalWeeks * 7);
      let scheduled = false;
      for (let day = firstDay; day <= lastDay; day += 1) {
        // Excluding every occurrence is valid; the underlying date range still needs to contain a repeat day.
        if (occursOn({ ...event, excludedDates: [] }, numberKey(day))) { scheduled = true; break; }
      }
      if (!scheduled) return 'Choose an end date that includes at least one selected weekday.';
    }
  }
  return null;
}

function firstSharedDate(left: TimeEvent, right: TimeEvent): string | null {
  if (!left.recurrence) return occursOn(left, left.date) && occursOn(right, left.date) ? left.date : null;
  if (!right.recurrence) return occursOn(right, right.date) && occursOn(left, right.date) ? right.date : null;

  const start = Math.max(dayNumber(left.date), dayNumber(right.date));
  const end = Math.min(
    left.recurrence.until === null ? lastSupportedDay : dayNumber(left.recurrence.until),
    right.recurrence.until === null ? lastSupportedDay : dayNumber(right.recurrence.until),
  );
  if (end < start) return null;
  const commonDays = left.recurrence.weekdays.filter(day => right.recurrence!.weekdays.includes(day));
  if (!commonDays.length) return null;
  const leftAnchor = monday(dayNumber(left.date));
  const rightAnchor = monday(dayNumber(right.date));
  const leftInterval = left.recurrence.intervalWeeks;
  const rightInterval = right.recurrence.intervalWeeks;
  const cycleWeeks = leftInterval * rightInterval / gcd(leftInterval, rightInterval);
  const cycleDays = cycleWeeks * 7;
  const excluded = new Set([...left.excludedDates, ...right.excludedDates].map(dayNumber));
  let earliest = Infinity;

  // One complete least-common-multiple cycle identifies every shared weekday residue exactly.
  for (let offset = 0; offset < cycleWeeks; offset += 1) {
    const week = monday(start) + offset * 7;
    if (((week - leftAnchor) / 7) % leftInterval !== 0
      || ((week - rightAnchor) / 7) % rightInterval !== 0) continue;
    for (const day of commonDays) {
      let candidate = week + modulo(day + 6, 7);
      if (candidate < start) candidate += cycleDays;
      // A finite exclusion list can only skip finitely many matches; no lookahead cutoff is needed.
      while (candidate <= end && excluded.has(candidate)) candidate += cycleDays;
      if (candidate <= end && candidate < earliest) earliest = candidate;
    }
  }
  return Number.isFinite(earliest) ? numberKey(earliest) : null;
}

export function findConflict(candidate: TimeEvent, events: TimeEvent[]): { date: string; title: string } | null {
  let conflict: { date: string; title: string } | null = null;
  for (const event of events) {
    if (candidate.id === event.id || candidate.start >= event.end || candidate.end <= event.start) continue;
    const date = firstSharedDate(candidate, event);
    if (date !== null && (!conflict || date < conflict.date)) {
      conflict = { date, title: event.title.trim() || categoryTitles[event.category] };
    }
  }
  return conflict;
}

export function validateSchedule(schedule: Schedule): string | null {
  if (!isRecord(schedule) || schedule.version !== 2 || !Array.isArray(schedule.events) || !isRecord(schedule.legacy)) {
    return 'The saved schedule could not be read. Your existing data has been kept.';
  }
  const ids = new Set<string>();
  for (const event of schedule.events) {
    const error = validateEvent(event);
    if (error) return error;
    if (ids.has(event.id)) return 'Two saved time blocks have the same identifier. Your existing data has been kept.';
    ids.add(event.id);
  }
  for (const [key, minutes] of Object.entries(schedule.legacy)) {
    if (!validDate(key) || !Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) {
      return 'An earlier logged total could not be read. Keep hours between 0 and 24 per day.';
    }
  }
  for (let index = 0; index < schedule.events.length; index += 1) {
    const conflict = findConflict(schedule.events[index], schedule.events.slice(index + 1));
    if (conflict) {
      const event = schedule.events[index];
      const title = event.title.trim() || categoryTitles[event.category];
      return `“${title}” overlaps “${conflict.title}” on ${conflict.date}. Choose a different time.`;
    }
  }
  for (const key of Object.keys(schedule.legacy)) {
    const totals = dayTotals(schedule, key);
    if (totals.counted + totals.related + totals.away > MINUTES_PER_DAY) {
      return `Earlier hours plus time blocks exceed 24 hours on ${key}. Adjust the earlier total first.`;
    }
  }
  return null;
}

function checked(schedule: Schedule): Schedule {
  const error = validateSchedule(schedule);
  if (error) throw new Error(error);
  return schedule;
}

export function upsertEvent(
  schedule: Schedule, event: TimeEvent, occurrenceDate?: string, scope: EditScope = 'series',
): Schedule {
  const eventError = validateEvent(event);
  if (eventError) throw new Error(eventError);
  const old = schedule.events.find(existing => existing.id === event.id);
  const normalized = { ...event, title: event.title.trim() || categoryTitles[event.category] };
  if (old?.recurrence && scope === 'occurrence') {
    if (!occurrenceDate || !occursOn(old, occurrenceDate)) throw new Error('This occurrence no longer exists. Reopen the day.');
    const replacement: TimeEvent = {
      ...normalized, id: `${old.id}@${occurrenceDate}`, date: occurrenceDate, recurrence: null, excludedDates: [],
    };
    return checked({
      ...schedule,
      events: [...schedule.events.map(existing => existing.id === old.id
        ? { ...existing, excludedDates: [...existing.excludedDates, occurrenceDate].sort() } : existing), replacement],
    });
  }
  const events = old ? schedule.events.map(existing => existing.id === event.id ? normalized : existing)
    : [...schedule.events, normalized];
  return checked({ ...schedule, events });
}

export function removeEvent(schedule: Schedule, id: string, occurrenceDate: string, scope: EditScope): Schedule {
  const old = schedule.events.find(event => event.id === id);
  if (!old) throw new Error('This time block was already removed. Reopen the day.');
  if (old.recurrence && scope === 'occurrence') {
    if (!occursOn(old, occurrenceDate)) throw new Error('This occurrence no longer exists. Reopen the day.');
    return checked({
      ...schedule,
      events: schedule.events.map(event => event.id === id
        ? { ...event, excludedDates: [...event.excludedDates, occurrenceDate].sort() } : event),
    });
  }
  return checked({
    ...schedule,
    events: schedule.events.filter(event => {
      if (event.id === id) return false;
      // A one-off replacement still belongs to the series; a replacement made recurring is its own series.
      const detachedDate = event.id.startsWith(`${id}@`) ? event.id.slice(id.length + 1) : '';
      return !old.recurrence || event.recurrence !== null || !validDate(detachedDate);
    }),
  });
}
