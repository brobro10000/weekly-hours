export type Holiday = { date: string; name: string; observed: boolean };

function civilDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, month, day);
  return date;
}

export function dateKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new Error('Enter a valid date.');
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error('Use a date in YYYY-MM-DD format.');
  const [year, month, day] = key.split('-').map(Number);
  const date = civilDate(year, month - 1, day);
  if (year < 1 || dateKey(date) !== key) throw new Error('Enter a valid calendar date.');
  return date;
}

export function addDays(date: Date, count: number): Date {
  const result = civilDate(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + count);
  return result;
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -((date.getDay() + 6) % 7));
}

export function weekDays(date: Date): Date[] {
  const monday = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number): Date {
  const first = civilDate(year, month, 1);
  return civilDate(year, month, 1 + ((weekday - first.getDay() + 7) % 7) + (occurrence - 1) * 7);
}

function lastMonday(year: number, month: number): Date {
  const last = civilDate(year, month + 1, 0);
  return addDays(last, -((last.getDay() + 6) % 7));
}

function actualHolidays(year: number): { date: Date; name: string }[] {
  const holidays = [
    { date: civilDate(year, 0, 1), name: 'New Year’s Day' },
    { date: nthWeekday(year, 0, 1, 3), name: 'Martin Luther King Jr. Day' },
    { date: nthWeekday(year, 1, 1, 3), name: 'Washington’s Birthday' },
    { date: lastMonday(year, 4), name: 'Memorial Day' },
    { date: civilDate(year, 6, 4), name: 'Independence Day' },
    { date: nthWeekday(year, 8, 1, 1), name: 'Labor Day' },
    { date: nthWeekday(year, 9, 1, 2), name: 'Columbus Day' },
    { date: civilDate(year, 10, 11), name: 'Veterans Day' },
    { date: nthWeekday(year, 10, 4, 4), name: 'Thanksgiving Day' },
    { date: civilDate(year, 11, 25), name: 'Christmas Day' },
  ];
  if (year >= 2021) holidays.push({ date: civilDate(year, 5, 19), name: 'Juneteenth' });
  return holidays;
}

const holidayCache = new Map<number, Holiday[]>();

/** Recurring nationwide holidays, using OPM's standard Monday–Friday observance rules. */
export function holidaysForYear(year: number): Holiday[] {
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new Error('Enter a valid year.');
  let cached = holidayCache.get(year);
  if (!cached) {
    const holidays: Holiday[] = [];
    // Adjacent years include New Year's Day observed on December 31 of the preceding year.
    for (const holidayYear of [year - 1, year, year + 1]) {
      for (const holiday of actualHolidays(holidayYear)) {
        if (holiday.date.getFullYear() === year) {
          holidays.push({ date: dateKey(holiday.date), name: holiday.name, observed: false });
        }
        const weekday = holiday.date.getDay();
        if (weekday === 0 || weekday === 6) {
          const observedDate = addDays(holiday.date, weekday === 6 ? -1 : 1);
          if (observedDate.getFullYear() === year) {
            holidays.push({ date: dateKey(observedDate), name: holiday.name, observed: true });
          }
        }
      }
    }
    cached = holidays.sort((left, right) => left.date.localeCompare(right.date));
    holidayCache.set(year, cached);
  }
  return cached.map((holiday) => ({ ...holiday }));
}

export function holidaysOn(date: Date): Holiday[] {
  const key = dateKey(date);
  return holidaysForYear(date.getFullYear()).filter((holiday) => holiday.date === key);
}

export function expectedMinutes(date: Date): number {
  if (date.getDay() === 0 || date.getDay() === 6 || holidaysOn(date).length > 0) return 0;
  return 8 * 60;
}

export function parseHours(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed)) {
    throw new Error('Enter decimal hours, such as 6.5 for 6 hours 30 minutes.');
  }
  const hours = Number(trimmed);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
    throw new Error('Enter between 0 and 24 hours for this day.');
  }
  return Math.round(hours * 60);
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(Math.abs(minutes));
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  const duration = hours === 0 && remainder > 0
    ? `${remainder}m`
    : `${hours}h${remainder > 0 ? ` ${remainder}m` : ''}`;
  return minutes < 0 && rounded > 0 ? `−${duration}` : duration;
}

export function formatDelta(minutes: number): string {
  if (Math.round(Math.abs(minutes)) === 0) return 'On target';
  return `${minutes > 0 ? '+' : '−'}${formatMinutes(Math.abs(minutes))}`;
}

export function summarizeWeek(start: Date, entries: Record<string, number>): {
  total: number;
  expected: number;
  delta: number;
  holidayDays: number;
} {
  let total = 0;
  let expected = 0;
  let holidayDays = 0;
  for (const date of weekDays(start)) {
    total += entries[dateKey(date)] ?? 0;
    expected += expectedMinutes(date);
    if (date.getDay() !== 0 && date.getDay() !== 6 && holidaysOn(date).length > 0) holidayDays += 1;
  }
  return { total, expected, delta: total - expected, holidayDays };
}
