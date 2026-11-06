# Weekly Hours

Build a small, public GitHub Pages app for tracking categorized time blocks across a Monday–Sunday week.

- Use React, TypeScript, Vite, and the imported DayPicker calendar component.
- Apply Radix Themes with indigo/slate tokens. Keep graphics compact and respect reduced-motion preferences.
- Keep entries browser-local. Do not add accounts, analytics, or server storage.
- Expand each day into a 24-hour timeline. Green Counted time contributes to the weekly target; orange Related and
  red Away time do not. Keep labeled category totals separate from the signed daily target balance.
- Prevent overlapping blocks, including future recurring collisions. Touching endpoints are allowed.
- Recurrence supports multiple weekdays, every 1–12 weeks, optional end dates, and occurrence/series edits and deletion.
- Preserve earlier v1 totals as counted legacy minutes without inventing timestamps. Never overwrite invalid saved data.
- Calculate in integer minutes. Weekdays expect 480 minutes; weekends and observed US federal holidays expect zero.
- Keep every date editable, including holidays and weekends. Empty entries differ from explicit zero entries.
- Show negative differences in red, positive differences in green, and zero or empty differences neutrally.
- Always include signs or text so color is never the only signal.
- Keep the layout minimal, responsive, and keyboard accessible. Run axe checks for the main page and calendar.
- Wrap prose and comments at roughly 120 characters. Preserve code and generated formats.
- Run `npm test`, `npm run build`, and `npm run test:e2e` before publishing changes.
- Keep deployment at `/weekly-hours/` and publish through the GitHub Pages workflow.

## Domain interface

The categorized schedule and persistence interfaces are described in `SCHEDULE-CONTRACT.md`. Shared types are in
`src/lib/schedule-types.ts`; recurrence, category totals, validation, and immutable edits are in `src/lib/schedule.ts`.
`src/lib/schedule-storage.ts` reads v2 schedules and safely migrates old v1 totals in memory. Old storage is left intact.

`src/lib/time.ts` exports `dateKey`, `parseDateKey`, `addDays`, `startOfWeek`, `weekDays`, `holidaysForYear`,
`holidaysOn`, `expectedMinutes`, `parseHours`, `formatMinutes`, `formatDelta`, and `summarizeWeek`.
Date functions use local civil dates, not UTC date strings. The older Entries record maps ISO dates to integer minutes
and remains supported for migration and the weekly counted-total calculation.

`Holiday` is `{ date: string; name: string; observed: boolean }`; the yearly list includes actual holiday dates and
shifted observed dates, including observed dates belonging to a holiday in an adjacent year.
`summarizeWeek(start, entries)` returns `{ total: number; expected: number; delta: number; holidayDays: number }`.
`parseHours` returns null for blank, integer minutes for a valid nonnegative decimal (at most 24 hours), and throws
for malformed input or values outside 0–24. No input is capped at the daily target.
