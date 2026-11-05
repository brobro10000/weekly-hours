# Weekly Hours

Build a small, public GitHub Pages app for manually tracking hours across a Monday–Sunday week.

- Use React, TypeScript, Vite, and the imported DayPicker calendar component.
- Apply Radix Themes with indigo/slate tokens. Keep graphics compact and respect reduced-motion preferences.
- Keep entries browser-local. Do not add accounts, analytics, or server storage.
- Calculate in integer minutes. Weekdays expect 480 minutes; weekends and observed US federal holidays expect zero.
- Keep every date editable, including holidays and weekends. Empty entries differ from explicit zero entries.
- Show negative differences in red, positive differences in green, and zero or empty differences neutrally.
- Always include signs or text so color is never the only signal.
- Keep the layout minimal, responsive, and keyboard accessible. Run axe checks for the main page and calendar.
- Wrap prose and comments at roughly 120 characters. Preserve code and generated formats.
- Run `npm test`, `npm run build`, and `npm run test:e2e` before publishing changes.
- Keep deployment at `/weekly-hours/` and publish through the GitHub Pages workflow.

## Domain interface

`src/lib/time.ts` exports `dateKey`, `parseDateKey`, `addDays`, `startOfWeek`, `weekDays`, `holidaysForYear`,
`holidaysOn`, `expectedMinutes`, `parseHours`, `formatMinutes`, `formatDelta`, and `summarizeWeek`.
Date functions use local civil dates, not UTC date strings. Entries are a record of ISO date keys to integer minutes.

`Holiday` is `{ date: string; name: string; observed: boolean }`; the yearly list includes actual holiday dates and
shifted observed dates, including observed dates belonging to a holiday in an adjacent year.
`summarizeWeek(start, entries)` returns `{ total: number; expected: number; delta: number; holidayDays: number }`.
`parseHours` returns null for blank, integer minutes for a valid nonnegative decimal (at most 24 hours), and throws
for malformed input or values outside 0–24. No input is capped at the daily target.
