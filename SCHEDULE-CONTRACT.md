# Timeline interface — revision 2

Shared types live in `src/lib/schedule-types.ts`. Root owns these types and all integration.

## Behavior

- Expand one day at a time. The per-date **Event timeline** switch chooses between a decimal hours entry and the
  00:00–24:00 timeline. The optional v2 `timelineEnabled` map stores explicit boolean settings by civil date.
  A date with no saved preference shows its timeline when it has a scheduled occurrence.
- Counted is green and reduces the weekly target. Related is orange and Away is red; neither reduces the target.
- Times use integer minutes, with `0 <= start < end <= 1440`. Overnight events are split into two day entries.
- Events have optional short titles. Store a useful category label if a title is omitted.
- Recurrence uses selected weekdays (`0` Sunday through `6` Saturday), every 1–12 weeks, and an optional inclusive
  end date. The anchor is the Monday of the start-date week. Occurrences never precede the start date.
- No automatic holiday exclusion: holidays reduce the target, but the user may schedule work on them.
- No overlapping time blocks, including recurring events. Touching endpoints are valid.
- Allow editing/deleting either one occurrence or the whole series. Occurrence edits exclude the original date and
  create a one-off replacement with a deterministic id. Whole-series edits change the repeating rule throughout its
  date range, including earlier dates, while preserving detached overrides. Whole-series deletion removes direct
  detached one-off overrides too. Overrides converted into independent recurring series remain independent.
- Keep prior daily totals as `legacy` counted minutes without inventing clock times. Show and allow editing this
  total in either view. Simple entry also writes to `legacy`. Untimed minutes plus all scheduled category minutes
  must fit in 1440 minutes per day. Visibility has no effect on totals, overlap checks, or recurrence.
- Calendar, target adjustments, browser-local storage, mobile layout, and reduced-motion support remain.

## Domain functions (`src/lib/schedule.ts`)

- `occursOn(event: TimeEvent, key: string): boolean`
- `eventsForDate(events: TimeEvent[], key: string): TimeEvent[]` (sorted start time, then end, then id)
- `dayTotals(schedule: Schedule, key: string): DayTotals` (includes legacy in counted only)
- `formatClock(minutes: number): string` (24-hour HH:mm, includes 24:00)
- `parseClock(value: string): number | null` (strict HH:mm, 24:00 accepted)
- `validateEvent(event: TimeEvent): string | null` (actionable validation error)
- `findConflict(candidate: TimeEvent, events: TimeEvent[]): { date: string; title: string } | null`
  (ignore same id; exact recurring intersections with finite date exceptions; avoid arbitrary short lookahead)
- `validateSchedule(schedule: Schedule): string | null` (shape, events, collisions, and legacy capacity)
- `upsertEvent(schedule: Schedule, event: TimeEvent, occurrenceDate?: string, scope?: EditScope): Schedule`
  (throw actionable Error if invalid; existing recurring occurrence edits retain other dates)
- `removeEvent(schedule: Schedule, id: string, occurrenceDate: string, scope: EditScope): Schedule`

## UI component (`src/components/DayTimeline.tsx`)

Default export with props:

```ts
type DayTimelineProps = {
  date: string;
  events: TimeEvent[];
  untimedMinutes: number | undefined;
  onSave: (event: TimeEvent, occurrenceDate?: string, scope?: EditScope) => string | null;
  onDelete: (id: string, date: string, scope: EditScope) => string | null;
};
```

The `events` prop contains this date's occurrences. Root callbacks transact against the full schedule and return
validation errors to show beside the form. Components import frozen helpers from `src/lib/schedule.ts`.
The panel owns event form state and focus handling, uses native labeled inputs and Radix buttons, and imports its own
`DayTimeline.css`. Start/end inputs use 24-hour text fields (`HH:mm`) to support `24:00`. Provide a helpful time format
example. Add category controls, repeat weekday toggles, weekly interval, optional ending date, and occurrence/series scope.

## Ownership and verification

- Domain agent: `src/lib/schedule.ts`, `src/lib/schedule.test.ts` only.
- Timeline UI agent: `src/components/DayTimeline.tsx`, `src/components/DayTimeline.css` only.
- Root: shared types, App integration, storage/migration, browser checks, documentation, build and publication.
- Root runs all npm commands. Domain agent adds meaningful tests; UI agent reports accessibility/focus assumptions.
