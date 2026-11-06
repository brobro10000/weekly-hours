# Weekly Hours

Track a workweek with a daily hours entry or a 24-hour event timeline. Each date remembers its own setting, and both
views feed the same holiday-adjusted weekly total.

**[Open Weekly Hours](https://brobro10000.github.io/weekly-hours/)**

## How it works

- Monday–Friday starts at 8 hours per day, or 40 per week.
- Weekends and observed US federal holidays expect zero hours. Every day remains editable.
- Open a day, enter counted hours such as `6.5`, and select **Save hours**.
- Turn on **Event timeline** for a date to add time blocks or recurring events. Empty dates start with simple entry.
  Dates with scheduled events open in timeline view until you choose another setting for that date.
- With the timeline hidden, existing blocks still contribute to their categories. If a counted block is already on
  the day, the simple form shows its duration and asks for **Additional counted hours**.
- **Green · Counted:** contributes to the weekly target.
- **Orange · Related:** work-related time shown separately; does not reduce the target.
- **Red · Away from desk:** tracked separately; does not reduce the target.
- For example, counted time from `09:00` to `15:30` totals 6h 30m and shows a daily balance of `−1h 30m`.
- Daily balances retain signed red shortfalls, green excess, and neutral on-target values.
- Times use a 24-hour clock with one-minute precision. `24:00` is valid as an end time. Split overnight work into
  separate blocks on the two dates. Overlaps are prevented across all categories; adjacent blocks are allowed.
- The calendar labels holidays and their observed dates. Choose a date to open its Monday–Sunday week.
- Entries save automatically in the current browser, including across weeks. There are no accounts or analytics.

Clearing browser storage removes saved entries. Different browsers and devices keep separate data. No personal hours
are published to the repository or sent to a backend.

## Recurring events

Enable **Repeat weekly** and choose one or more weekdays, an interval from 1 to 12 weeks, a start date, and an optional
inclusive end date. Leave the end date empty to continue indefinitely. Weeks start Monday; recurrence stays at the same
local clock time across daylight-saving changes. Holidays remain available and are included in recurring schedules.

Edit or delete **This occurrence** to change just one date. Editing an occurrence creates a separate one-off override.
**Entire series** edits change the repeating rule, including earlier dates, while keeping individually edited overrides.
Deleting an entire series also removes its direct one-off overrides. An override turned into a new recurring schedule
is independent. Overlap validation checks recurring intersections beyond the currently visible week.

Listed counted events contribute immediately to the displayed week's total, including scheduled events later in that
week. There is no separate planned-versus-completed state.

## Earlier hours

Hours saved in the first version are preserved as counted totals without clock times. Expand a day to update or clear
its counted hours. In timeline view, **Hours without time blocks** includes these entries and hours saved in simple
view. Reduce this value when replacing those hours with counted blocks.
The old storage key is retained as a backup; future changes use the new categorized schedule.

## Design

Built with [Radix Themes](https://www.radix-ui.com/themes/docs/overview/getting-started), using indigo accents, slate
surfaces, a consistent type and spacing scale, rounded controls, and accessible focus states. A compact seven-bar
graphic stacks the three time categories; dashed marks represent weekday targets. Holiday and weekend tracks are striped.
Hover or focus a bar to read its hours. Subtle transitions and dialog motion respect reduced-motion preferences.

The imported [DayPicker](https://daypicker.dev/) calendar supports keyboard navigation. The summary moves above the
entry list on narrow screens. Signed values and text reinforce color throughout.

## Holidays

The app applies the eleven recurring nationwide federal holidays under the standard Monday–Friday schedule in
[OPM's federal holiday guidance](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/).
Saturday holidays are observed Friday and Sunday holidays Monday, including observances crossing year boundaries.
Juneteenth is included from 2021. Other recurring rules follow the modern schedule.

State and employer-specific holidays, regional Inauguration Day observances, and one-time executive closures are not
included. Holiday names and dates are calculated locally; no calendar account or network API is needed.

## Development

Requires Node.js 24 or later.

```sh
npm ci
npm run dev
```

Open the `/weekly-hours/` URL printed by Vite.

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Tests cover minute arithmetic, holidays and observances, recurring intersections and exceptions, date boundaries, safe
data migration, persistence, browser interactions, responsive layouts, reduced motion, and axe accessibility checks.

## Deployment

GitHub Pages uses GitHub Actions. Pushes to `main` run the checks, build `dist/`, and deploy the static site.
Pull requests run the same checks without deploying. The Vite base path is `/weekly-hours/`.

The public site includes no sample hours. Screenshots or tests may use fictional entries in isolated browser sessions.
