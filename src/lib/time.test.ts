import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateKey,
  expectedMinutes,
  formatDelta,
  formatMinutes,
  holidaysForYear,
  holidaysOn,
  parseDateKey,
  parseHours,
  startOfWeek,
  summarizeWeek,
  weekDays,
} from './time';

const date = parseDateKey;

describe('civil dates', () => {
  it('round-trips local dates without shifting the date in any time zone', () => {
    const parsed = date('2026-11-05');
    expect([parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), parsed.getHours()])
      .toEqual([2026, 10, 5, 12]);
    expect(dateKey(parsed)).toBe('2026-11-05');
  });

  it('rejects malformed and nonexistent dates while preserving leap days', () => {
    for (const key of ['2026-2-01', '2026-02-29', '2026-13-01', '2026-04-31', '0000-01-01', 'hello']) {
      expect(() => date(key)).toThrow();
    }
    expect(dateKey(date('2024-02-29'))).toBe('2024-02-29');
  });

  it('starts Sunday in the preceding Monday week and crosses year boundaries', () => {
    expect(dateKey(startOfWeek(date('2027-01-03')))).toBe('2026-12-28');
    expect(weekDays(date('2027-01-03')).map(dateKey)).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
  });

  it('keeps civil days at noon across spring and fall daylight-saving transitions', () => {
    for (const [key, expected] of [['2026-03-08', '2026-03-09'], ['2026-11-01', '2026-11-02']]) {
      const next = addDays(date(key), 1);
      expect(dateKey(next)).toBe(expected);
      expect(next.getHours()).toBe(12);
      expect(weekDays(date(key)).map((day) => day.getDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
    }
  });
});

describe('hours and differences', () => {
  it('calculates the requested decimal-hour examples exactly', () => {
    expect(parseHours('6.5')).toBe(390);
    expect(formatDelta(parseHours('6.5')! - 480)).toBe('−1h 30m');
    expect(parseHours('8.5')).toBe(510);
    expect(formatDelta(parseHours('8.5')! - 480)).toBe('+30m');
  });

  it('distinguishes a blank entry from explicitly entering zero', () => {
    expect(parseHours('')).toBeNull();
    expect(parseHours('  ')).toBeNull();
    expect(parseHours('0')).toBe(0);
    expect(formatDelta(parseHours('0')! - 480)).toBe('−8h');
  });

  it('accepts fractions and rounds to a whole minute without an eight-hour limit', () => {
    expect(parseHours('.5')).toBe(30);
    expect(parseHours(' 8. ')).toBe(480);
    expect(parseHours('8.333333')).toBe(500);
    expect(parseHours('24')).toBe(1440);
  });

  it('rejects malformed, negative, nonfinite, and impossible daily hours', () => {
    for (const input of ['-1', '24.01', 'NaN', 'Infinity', '6:30', 'eight', '1e2', '0x10', '.', '8 5']) {
      expect(() => parseHours(input)).toThrow();
    }
  });

  it('formats exact hours, minutes, and neutral balances', () => {
    expect(formatMinutes(0)).toBe('0h');
    expect(formatMinutes(30)).toBe('30m');
    expect(formatMinutes(2400)).toBe('40h');
    expect(formatMinutes(2430)).toBe('40h 30m');
    expect(formatDelta(0)).toBe('On target');
    expect(formatDelta(120)).toBe('+2h');
  });
});

describe('recurring US federal holidays', () => {
  it('matches all eleven observed weekday dates in the OPM 2026 schedule', () => {
    const weekdays = holidaysForYear(2026).filter((holiday) => {
      const weekday = date(holiday.date).getDay();
      return weekday !== 0 && weekday !== 6;
    });
    expect(weekdays.map((holiday) => holiday.date)).toEqual([
      '2026-01-01', '2026-01-19', '2026-02-16', '2026-05-25', '2026-06-19', '2026-07-03',
      '2026-09-07', '2026-10-12', '2026-11-11', '2026-11-26', '2026-12-25',
    ]);
  });

  it('labels both a Saturday holiday and its preceding Friday observance', () => {
    expect(holidaysOn(date('2026-07-03'))).toEqual([
      { date: '2026-07-03', name: 'Independence Day', observed: true },
    ]);
    expect(holidaysOn(date('2026-07-04'))).toEqual([
      { date: '2026-07-04', name: 'Independence Day', observed: false },
    ]);
    expect(expectedMinutes(date('2026-07-03'))).toBe(0);
  });

  it('observes a Sunday holiday on the following Monday', () => {
    expect(holidaysOn(date('2027-07-05'))).toEqual([
      { date: '2027-07-05', name: 'Independence Day', observed: true },
    ]);
    expect(expectedMinutes(date('2027-07-05'))).toBe(0);
  });

  it('includes next year’s New Year observance in the preceding December', () => {
    expect(holidaysOn(date('2027-12-31'))).toEqual([
      { date: '2027-12-31', name: 'New Year’s Day', observed: true },
    ]);
    expect(summarizeWeek(date('2027-12-27'), {})).toEqual({
      total: 0, expected: 1920, delta: -1920, holidayDays: 1,
    });
  });

  it('includes Juneteenth from 2021 onward', () => {
    expect(holidaysOn(date('2020-06-19'))).toEqual([]);
    expect(holidaysOn(date('2021-06-18'))[0]).toEqual({
      date: '2021-06-18', name: 'Juneteenth', observed: true,
    });
  });

  it('uses zero expectations on weekends and eight hours on ordinary weekdays', () => {
    expect(expectedMinutes(date('2026-11-02'))).toBe(480);
    expect(expectedMinutes(date('2026-11-07'))).toBe(0);
    expect(expectedMinutes(date('2026-11-08'))).toBe(0);
    expect(holidaysOn(date('2026-11-02'))).toEqual([]);
  });
});

describe('weekly totals', () => {
  it('totals all seven days against a forty-hour ordinary week', () => {
    const summary = summarizeWeek(date('2026-11-04'), {
      '2026-11-02': 390, '2026-11-03': 510, '2026-11-04': 480, '2026-11-07': 120,
      '2026-11-09': 1440,
    });
    expect(summary).toEqual({ total: 1500, expected: 2400, delta: -900, holidayDays: 0 });
  });

  it('reduces Thanksgiving week to thirty-two hours and counts holiday work as extra', () => {
    const summary = summarizeWeek(date('2026-11-23'), {
      '2026-11-23': 480, '2026-11-24': 480, '2026-11-25': 480, '2026-11-26': 120,
      '2026-11-27': 480,
    });
    expect(summary).toEqual({ total: 2040, expected: 1920, delta: 120, holidayDays: 1 });
    expect(formatDelta(120 - expectedMinutes(date('2026-11-26')))).toBe('+2h');
  });

  it('counts a Saturday holiday and Friday observance as one reduced workday', () => {
    expect(summarizeWeek(date('2026-07-04'), {})).toEqual({
      total: 0, expected: 1920, delta: -1920, holidayDays: 1,
    });
  });
});
