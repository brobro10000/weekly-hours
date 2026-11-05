# Weekly Hours

A small, public time tracker for a clearer workweek. Enter decimal hours, see each day's balance, and compare the
week's total with a holiday-adjusted target.

**[Open Weekly Hours](https://brobro10000.github.io/weekly-hours/)**

## How it works

- Monday–Friday starts at 8 hours per day, or 40 per week.
- Weekends and observed US federal holidays expect zero hours. Every day remains editable.
- Entering `6.5` on a normal weekday shows `−1h 30m`; entering `8.5` shows `+30m`.
- Red means below target, green means above target, and neutral means on target or no entry yet.
- A blank field is unentered. Explicit `0` counts as zero hours against the day's target.
- Entries accept decimal hours from 0 through 24 and round to the nearest minute.
- The calendar labels holidays and their observed dates. Choose a date to open its Monday–Sunday week.
- Entries save automatically in the current browser, including across weeks. There are no accounts or analytics.

Clearing browser storage removes saved entries. Different browsers and devices keep separate data. No personal hours
are published to the repository or sent to a backend.

## Design

Built with [Radix Themes](https://www.radix-ui.com/themes/docs/overview/getting-started), using indigo accents, slate
surfaces, a consistent type and spacing scale, rounded controls, and accessible focus states. A compact seven-bar
graphic responds to the entered hours; dashed marks represent weekday targets. Holiday and weekend tracks are striped.
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

Tests cover minute arithmetic, holidays and observations, date boundaries, persistence, browser interactions,
responsive layouts, reduced motion, and axe accessibility checks for both the main page and calendar dialog.

## Deployment

GitHub Pages uses GitHub Actions. Pushes to `main` run the checks, build `dist/`, and deploy the static site.
Pull requests run the same checks without deploying. The Vite base path is `/weekly-hours/`.

The public site includes no sample hours. Screenshots or tests may use fictional entries in isolated browser sessions.
