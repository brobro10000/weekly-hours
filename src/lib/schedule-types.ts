/** Civil times are minute offsets from midnight, independent of DST clock shifts. */
export type TimeCategory = 'counted' | 'related' | 'away';

export type Recurrence = {
  weekdays: number[];
  intervalWeeks: number;
  until: string | null;
};

export type TimeEvent = {
  id: string;
  title: string;
  category: TimeCategory;
  date: string;
  start: number;
  end: number;
  recurrence: Recurrence | null;
  excludedDates: string[];
};

export type Schedule = {
  version: 2;
  events: TimeEvent[];
  legacy: Record<string, number>;
};

export type DayTotals = { counted: number; related: number; away: number; hasEntries: boolean };
export type EditScope = 'occurrence' | 'series';
