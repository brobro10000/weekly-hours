import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const fixedToday = new Date('2026-11-05T12:00:00-05:00');
const storageKey = 'weekly-hours.schedule.v2';
const legacyKey = 'weekly-hours.entries.v1';
const summary = (page: Page) => page.getByRole('complementary', { name: 'WEEKLY TOTAL' });
const balance = (page: Page, date: string) => page.locator(`#balance-${date}`);
const panel = (page: Page) => page.locator('.day-timeline');
const timelineSwitch = (page: Page) => page.getByRole('switch', { name: 'Event timeline', exact: true });
const hoursField = (page: Page, name = 'Counted hours') => page.getByLabel(name, { exact: true });
const calendarTrigger = (page: Page) => page.getByRole('button', { name: /Nov 2 – Nov 8/ });
const eventRow = (page: Page, title: string) => page.getByRole('list', { name: 'Events for this day' })
  .getByRole('listitem').filter({ has: page.getByText(title, { exact: true }) });

async function openDay(page: Page, weekday = 'Monday') {
  const trigger = page.getByRole('button', { name: new RegExp(`^${weekday}`) });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await expect(timelineSwitch(page)).toBeVisible();
}

type EventInput = { title: string; start?: string; end?: string; category?: 'Counted' | 'Related' | 'Away from desk' };

async function beginEvent(page: Page, { title, start = '09:00', end = '10:00', category = 'Counted' }: EventInput) {
  if (!await timelineSwitch(page).isChecked()) await timelineSwitch(page).click();
  await page.getByRole('button', { name: 'Add event', exact: true }).click();
  await page.getByRole('textbox', { name: /^Event title/ }).fill(title);
  await page.getByRole('textbox', { name: 'Start time', exact: true }).fill(start);
  await page.getByRole('textbox', { name: 'End time', exact: true }).fill(end);
  await page.getByRole('radio', { name: new RegExp(`^${category}`) }).check();
}

async function saveEvent(page: Page) {
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('form')).toHaveCount(0);
}

async function addEvent(page: Page, event: EventInput) {
  await beginEvent(page, event);
  await saveEvent(page);
}

async function repeatOn(page: Page, days: string[], interval = '1', until = '') {
  await page.getByRole('checkbox', { name: 'Repeat weekly', exact: true }).check();
  for (const weekday of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
    await page.getByRole('checkbox', { name: weekday, exact: true }).setChecked(days.includes(weekday));
  }
  await page.getByRole('spinbutton', { name: 'Repeat every (weeks)', exact: true }).fill(interval);
  if (until) await page.getByLabel(/^Ends on/).fill(until);
}

async function nextWeek(page: Page) {
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
}

async function assertAxe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(result.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map(node => ({
    target: node.target, failure: node.failureSummary,
  })) }))).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixedToday);
  await page.goto('./');
});

test('simple hours update the balance and each date remembers its own timeline switch', async ({ page }) => {
  await openDay(page);
  await expect(timelineSwitch(page)).not.toBeChecked();
  await expect(panel(page)).toBeHidden();
  await hoursField(page).fill('6.5');
  await page.getByRole('button', { name: 'Save hours', exact: true }).click();
  await expect(balance(page, '2026-11-02')).toHaveText('−1h 30m');
  await expect(summary(page).getByLabel('6h 30m logged', { exact: true })).toBeVisible();

  await openDay(page, 'Tuesday');
  await timelineSwitch(page).click();
  await expect(panel(page)).toBeVisible();
  await nextWeek(page);
  await openDay(page, 'Tuesday');
  await expect(timelineSwitch(page)).not.toBeChecked();

  await page.reload();
  await openDay(page, 'Tuesday');
  await expect(timelineSwitch(page)).toBeChecked();
  await expect(panel(page)).toBeVisible();
  await openDay(page);
  await expect(timelineSwitch(page)).not.toBeChecked();
  await expect(hoursField(page)).toHaveValue('6.5');
  await timelineSwitch(page).click();
  await expect(hoursField(page, 'Hours without time blocks')).toHaveValue('6.5');
  await expect(panel(page).locator('.timeline-block')).toHaveCount(0);
  await expect(summary(page).getByLabel('6h 30m logged', { exact: true })).toBeVisible();
});

test('hiding a recurring date keeps each category counted once and leaves other occurrences visible', async ({ page }) => {
  await openDay(page);
  await beginEvent(page, { title: 'Regular work' });
  await repeatOn(page, ['Monday', 'Wednesday']);
  await saveEvent(page);
  await addEvent(page, { title: 'Reading', start: '11:00', end: '11:30', category: 'Related' });
  await addEvent(page, { title: 'Lunch', start: '12:00', end: '12:45', category: 'Away from desk' });
  await timelineSwitch(page).click();
  await expect(panel(page)).toBeHidden();
  await expect(hoursField(page, 'Additional counted hours')).toHaveValue('');
  await expect(summary(page).getByLabel('2h logged', { exact: true })).toBeVisible();
  await hoursField(page, 'Additional counted hours').fill('7.5');
  await page.getByRole('button', { name: 'Save hours', exact: true }).click();
  await expect(balance(page, '2026-11-02')).toHaveText('+30m');
  await expect(summary(page).getByLabel('9h 30m logged', { exact: true })).toBeVisible();
  await expect(summary(page).getByRole('img', { name: /^Monday:/ })).toHaveAccessibleName(
    /8h 30m counted, 30m related, 45m away/);
  await openDay(page, 'Wednesday');
  await expect(timelineSwitch(page)).toBeChecked();
  await expect(eventRow(page, 'Regular work')).toBeVisible();
  await nextWeek(page);
  await openDay(page);
  await expect(timelineSwitch(page)).toBeChecked();
  await expect(eventRow(page, 'Regular work')).toBeVisible();

  await page.reload();
  await openDay(page);
  await expect(timelineSwitch(page)).not.toBeChecked();
  await expect(hoursField(page, 'Additional counted hours')).toHaveValue('7.5');
  await timelineSwitch(page).click();
  await expect(page.getByRole('list', { name: 'Events for this day' }).getByRole('listitem')).toHaveCount(3);
  await expect(hoursField(page, 'Hours without time blocks')).toHaveValue('7.5');
  await expect(summary(page).getByLabel('9h 30m logged', { exact: true })).toBeVisible();
});

test('the simple editor and day switch are accessible on a narrow screen and work by keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 810 });
  await openDay(page);
  await expect(hoursField(page)).toBeVisible();
  await hoursField(page).fill('8.5');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await assertAxe(page);
  await timelineSwitch(page).focus();
  await page.keyboard.press('Space');
  await expect(timelineSwitch(page)).toBeChecked();
  await expect(panel(page)).toBeVisible();
  await expect(timelineSwitch(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(timelineSwitch(page)).not.toBeChecked();
  await expect(hoursField(page)).toHaveValue('8.5');
  await hoursField(page).press('Enter');
  await expect(balance(page, '2026-11-02')).toHaveText('+30m');
});

test('three labeled categories appear on the timeline but only counted hours reduce the weekly target', async ({ page }) => {
  await openDay(page);
  await addEvent(page, { title: 'Focused work', start: '09:00', end: '15:30' });
  await addEvent(page, { title: 'Work reading', start: '16:00', end: '17:00', category: 'Related' });
  await addEvent(page, { title: 'Desk break', start: '17:00', end: '18:30', category: 'Away from desk' });
  await expect(eventRow(page, 'Focused work')).toHaveClass(/category-counted/);
  await expect(eventRow(page, 'Work reading')).toHaveClass(/category-related/);
  await expect(eventRow(page, 'Desk break')).toHaveClass(/category-away/);
  await expect(panel(page).locator('.timeline-block')).toHaveCount(3);
  await expect(balance(page, '2026-11-02')).toHaveText('−1h 30m');
  await expect(balance(page, '2026-11-02')).toHaveClass(/negative/);
  await expect(summary(page).getByLabel('6h 30m logged', { exact: true })).toBeVisible();
  await expect(summary(page).getByRole('status')).toContainText('33h 30m remaining');
  await openDay(page, 'Tuesday');
  await addEvent(page, { title: 'Long workday', start: '08:00', end: '16:30' });
  await expect(balance(page, '2026-11-03')).toHaveText('+30m');
  await expect(balance(page, '2026-11-03')).toHaveClass(/positive/);
  await expect(summary(page).getByLabel('15h logged', { exact: true })).toBeVisible();
});

test('events persist after reload and one-off events can be edited and deleted', async ({ page }) => {
  await openDay(page);
  await addEvent(page, { title: 'A saved block', start: '09:00', end: '11:00' });
  await page.reload();
  await openDay(page);
  await expect(eventRow(page, 'A saved block')).toContainText('09:00–11:00');
  await page.getByRole('button', { name: 'Edit A saved block', exact: true }).click();
  await page.getByRole('textbox', { name: 'End time', exact: true }).fill('12:00');
  await saveEvent(page);
  await expect(summary(page).getByLabel('3h logged', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete A saved block', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Events for this day' })).toHaveCount(0);
  await expect(balance(page, '2026-11-02')).toHaveText('—');
  await page.reload();
  await expect(summary(page).getByLabel('0h logged', { exact: true })).toBeVisible();
});

test('overlapping events are rejected while touching endpoints are accepted', async ({ page }) => {
  await openDay(page);
  await addEvent(page, { title: 'Morning work', start: '09:00', end: '11:00' });
  await beginEvent(page, { title: 'Overlapping break', start: '10:30', end: '11:30', category: 'Away from desk' });
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('overlaps');
  await expect(page.getByRole('alert')).toContainText('Morning work');
  await expect(eventRow(page, 'Overlapping break')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Start time', exact: true }).fill('11:00');
  await saveEvent(page);
  await expect(eventRow(page, 'Overlapping break')).toContainText('11:00–11:30');
  await expect(summary(page).getByLabel('2h logged', { exact: true })).toBeVisible();
});

test('recurring events honor multiple weekdays, a two-week interval, and an inclusive end date', async ({ page }) => {
  await openDay(page);
  await beginEvent(page, { title: 'Biweekly focus' });
  await repeatOn(page, ['Monday', 'Wednesday'], '2', '2026-11-18');
  await saveEvent(page);
  await expect(summary(page).getByLabel('2h logged', { exact: true })).toBeVisible();
  await openDay(page, 'Wednesday');
  await expect(eventRow(page, 'Biweekly focus')).toContainText('Every 2 weeks');
  await nextWeek(page);
  await expect(summary(page).getByLabel('0h logged', { exact: true })).toBeVisible();
  await nextWeek(page);
  await expect(summary(page).getByLabel('2h logged', { exact: true })).toBeVisible();
  await openDay(page, 'Wednesday');
  await expect(eventRow(page, 'Biweekly focus')).toBeVisible();
  await nextWeek(page);
  await nextWeek(page);
  await expect(summary(page).getByLabel('0h logged', { exact: true })).toBeVisible();
});

test('editing and deleting one occurrence preserves the rest of a recurring series', async ({ page }) => {
  await openDay(page);
  await beginEvent(page, { title: 'Weekly focus' });
  await repeatOn(page, ['Monday', 'Wednesday']);
  await saveEvent(page);
  await page.getByRole('button', { name: 'Edit Weekly focus', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'This occurrence', exact: true })).toBeChecked();
  await page.getByRole('textbox', { name: /^Event title/ }).fill('Extended Monday');
  await page.getByRole('textbox', { name: 'End time', exact: true }).fill('11:00');
  await saveEvent(page);
  await expect(summary(page).getByLabel('3h logged', { exact: true })).toBeVisible();
  await openDay(page, 'Wednesday');
  await expect(eventRow(page, 'Weekly focus')).toContainText('09:00–10:00');
  await nextWeek(page);
  await openDay(page);
  await page.getByRole('button', { name: 'Delete Weekly focus', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'This occurrence', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(summary(page).getByLabel('1h logged', { exact: true })).toBeVisible();
  await nextWeek(page);
  await openDay(page);
  await expect(eventRow(page, 'Weekly focus')).toContainText('09:00–10:00');
  await page.reload();
  await openDay(page);
  await expect(eventRow(page, 'Extended Monday')).toContainText('09:00–11:00');
});

test('whole-series edits and deletion apply across weeks', async ({ page }) => {
  await openDay(page);
  await beginEvent(page, { title: 'Monday series' });
  await repeatOn(page, ['Monday']);
  await saveEvent(page);
  await page.getByRole('button', { name: 'Edit Monday series', exact: true }).click();
  await page.getByRole('radio', { name: 'Entire series', exact: true }).check();
  await page.getByRole('textbox', { name: 'End time', exact: true }).fill('11:00');
  await saveEvent(page);
  await nextWeek(page);
  await openDay(page);
  await expect(eventRow(page, 'Monday series')).toContainText('09:00–11:00');
  await page.getByRole('button', { name: 'Delete Monday series', exact: true }).click();
  await page.getByRole('radio', { name: 'Entire series', exact: true }).check();
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await expect(summary(page).getByLabel('0h logged', { exact: true })).toBeVisible();
  await openDay(page);
  await expect(page.getByRole('list', { name: 'Events for this day' })).toHaveCount(0);
});

test('holiday-adjusted targets still include counted work on holidays and weekends', async ({ page }) => {
  await calendarTrigger(page).click();
  await page.getByRole('button', { name: 'Thursday, November 26, 2026, Thanksgiving Day', exact: true }).click();
  await expect(summary(page)).toContainText('of 32h expected');
  await openDay(page, 'Thursday');
  await addEvent(page, { title: 'Holiday work', start: '10:00', end: '12:00' });
  await expect(balance(page, '2026-11-26')).toHaveText('+2h');
  await openDay(page, 'Saturday');
  await addEvent(page, { title: 'Weekend work', start: '10:00', end: '11:30' });
  await expect(balance(page, '2026-11-28')).toHaveText('+1h 30m');
  await expect(summary(page).getByLabel('3h 30m logged', { exact: true })).toBeVisible();
  await expect(summary(page).getByRole('status')).toContainText('28h 30m remaining');
});

test('the end of day accepts 24:00 and invalid or backwards times do not save', async ({ page }) => {
  await openDay(page);
  await beginEvent(page, { title: 'Late work', start: '23:00', end: '22:00' });
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('End time must be after start time');
  await page.getByRole('textbox', { name: 'End time', exact: true }).fill('24:30');
  await page.getByRole('button', { name: 'Save event', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Use 24-hour times');
  await page.getByRole('textbox', { name: 'End time', exact: true }).fill('24:00');
  await saveEvent(page);
  await expect(eventRow(page, 'Late work')).toContainText('23:00–24:00');
  await expect(summary(page).getByLabel('1h logged', { exact: true })).toBeVisible();
});

test('earlier totals migrate without invented clock times and can be cleared without changing the v1 backup', async ({ page }) => {
  const earlier = { '2026-11-02': 390, '2026-11-03': 0 };
  await page.evaluate(({ key, values }) => localStorage.setItem(key, JSON.stringify(values)), { key: legacyKey, values: earlier });
  await page.reload();
  await expect(summary(page).getByLabel('6h 30m logged', { exact: true })).toBeVisible();
  await expect(balance(page, '2026-11-03')).toHaveText('−8h');
  await openDay(page);
  await expect(hoursField(page)).toHaveValue('6.5');
  await timelineSwitch(page).click();
  await expect(hoursField(page, 'Hours without time blocks')).toHaveValue('6.5');
  await expect(panel(page).locator('.timeline-block')).toHaveCount(0);
  await addEvent(page, { title: 'New work', start: '09:00', end: '10:00' });
  await expect(summary(page).getByLabel('7h 30m logged', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear hours', exact: true }).click();
  await expect(summary(page).getByLabel('1h logged', { exact: true })).toBeVisible();
  await page.reload();
  await expect(summary(page).getByLabel('1h logged', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), legacyKey)).toEqual(earlier);
});

test('failed saves retain multiple new events and recover together on the next successful save', async ({ page }) => {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as Window & { restoreStorage?: () => void }).restoreStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await openDay(page);
  await addEvent(page, { title: 'First unsaved', start: '09:00', end: '10:00' });
  await addEvent(page, { title: 'Second unsaved', start: '10:00', end: '11:00' });
  await expect(summary(page).getByLabel('2h logged', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('could not save');
  await page.evaluate(() => { (window as Window & { restoreStorage?: () => void }).restoreStorage?.(); });
  await addEvent(page, { title: 'Recovery', start: '11:00', end: '12:00' });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await openDay(page);
  await expect(page.getByRole('list', { name: 'Events for this day' }).getByRole('listitem')).toHaveCount(3);
  await expect(summary(page).getByLabel('3h logged', { exact: true })).toBeVisible();
});

test('an independent change from another tab preserves the active event draft and both saved events', async ({ page }) => {
  await openDay(page);
  await beginEvent(page, { title: 'My draft', start: '09:00', end: '10:00' });
  await page.evaluate(key => {
    const schedule = JSON.parse(localStorage.getItem(key)!);
    schedule.events.push({
      id: 'another-tab', title: 'Other tab event', category: 'counted', date: '2026-11-03',
      start: 540, end: 660, recurrence: null, excludedDates: [],
    });
    localStorage.setItem(key, JSON.stringify(schedule));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, storageKey);
  await expect(page.getByRole('textbox', { name: /^Event title/ })).toHaveValue('My draft');
  await saveEvent(page);
  await expect(summary(page).getByLabel('3h logged', { exact: true })).toBeVisible();
  await openDay(page, 'Tuesday');
  await expect(eventRow(page, 'Other tab event')).toBeVisible();
});

test('calendar holidays and keyboard focus remain available with expandable days', async ({ page }) => {
  const trigger = calendarTrigger(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Choose a week' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Wednesday, November 11, 2026, Veterans Day', exact: true }))
    .toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  const monday = page.getByRole('button', { name: /^Monday/ });
  await monday.focus();
  await page.keyboard.press('Enter');
  await expect(monday).toHaveAttribute('aria-expanded', 'true');
  await beginEvent(page, { title: 'Keyboard draft' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Add event', exact: true })).toBeFocused();
});

test('expanded timelines and recurrence editors fit 390px and 320px mobile screens', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await openDay(page);
    await beginEvent(page, { title: 'Mobile recurrence' });
    await repeatOn(page, ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Save event', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await calendarTrigger(page).click();
    const bounds = await page.getByRole('dialog', { name: 'Choose a week' }).boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
  }
});

test('reduced motion suppresses timeline and page animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await openDay(page);
  await beginEvent(page, { title: 'Quiet motion' });
  await repeatOn(page, ['Monday']);
  const movingElements = await page.evaluate(() => Array.from(document.querySelectorAll('*')).filter(element => {
    const style = getComputedStyle(element);
    const seconds = (duration: string) => duration.split(',').map(value => {
      const text = value.trim();
      return parseFloat(text) / (text.endsWith('ms') ? 1000 : 1);
    });
    return [...seconds(style.animationDuration), ...seconds(style.transitionDuration)].some(value => value > 0.001);
  }).map(element => element.className));
  expect(movingElements).toEqual([]);
});

test('collapsed day summaries pass axe accessibility checks', async ({ page }) => {
  await openDay(page);
  await addEvent(page, { title: 'Accessible work', start: '09:00', end: '15:30' });
  await page.getByRole('button', { name: /^Monday/ }).click();
  await assertAxe(page);
});

test('expanded event lists and recurrence editor pass axe accessibility checks', async ({ page }) => {
  await openDay(page);
  await addEvent(page, { title: 'Existing work' });
  await beginEvent(page, { title: 'Repeating meeting', start: '10:00', end: '11:00', category: 'Related' });
  await repeatOn(page, ['Monday', 'Wednesday']);
  await assertAxe(page);
});

test('the holiday calendar passes axe accessibility checks', async ({ page }) => {
  await calendarTrigger(page).click();
  await expect(page.getByRole('dialog', { name: 'Choose a week' })).toBeVisible();
  await assertAxe(page);
});

test('corrupt saved schedules are kept intact while new in-tab entries remain usable', async ({ page }) => {
  const raw = '{"version":2,"events":"broken","legacy":{}}';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: storageKey, value: raw });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('existing data has been kept');
  await openDay(page);
  await addEvent(page, { title: 'Temporary work' });
  await expect(summary(page).getByLabel('1h logged', { exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBe(raw);
});

test('turning recurrence off keeps a new one-off event on the opened day', async ({ page }) => {
  await openDay(page);
  await beginEvent(page, { title: 'Keep this Monday' });
  await repeatOn(page, ['Monday']);
  await page.getByLabel('Starts on', { exact: true }).fill('2026-11-10');
  await page.getByRole('checkbox', { name: 'Repeat weekly', exact: true }).uncheck();
  await saveEvent(page);
  await expect(eventRow(page, 'Keep this Monday')).toContainText('09:00–10:00');
  await expect(summary(page).getByLabel('1h logged', { exact: true })).toBeVisible();
  await page.reload();
  await openDay(page);
  await expect(eventRow(page, 'Keep this Monday')).toBeVisible();
  await nextWeek(page);
  await expect(summary(page).getByLabel('0h logged', { exact: true })).toBeVisible();
});

test('a conflicting cross-tab event stays visible while an unsaved local event is corrected', async ({ page }) => {
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    const testWindow = window as Window & {
      restoreStorage?: () => void;
      writeAsOtherTab?: (key: string, value: string) => void;
    };
    testWindow.restoreStorage = () => { Storage.prototype.setItem = original; };
    testWindow.writeAsOtherTab = (key, value) => original.call(localStorage, key, value);
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await openDay(page);
  await addEvent(page, { title: 'Local work', start: '09:00', end: '10:00' });
  await expect(page.getByRole('alert')).toContainText('could not save');
  await page.evaluate(key => {
    const testWindow = window as Window & { writeAsOtherTab?: (key: string, value: string) => void };
    const schedule = { version: 2, legacy: {}, events: [{
      id: 'remote-conflict', title: 'Remote conflict', category: 'counted', date: '2026-11-02',
      start: 570, end: 630, recurrence: null, excludedDates: [],
    }] };
    testWindow.writeAsOtherTab?.(key, JSON.stringify(schedule));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, storageKey);
  await expect(eventRow(page, 'Local work')).toBeVisible();
  await expect(eventRow(page, 'Remote conflict')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/overlap|another tab|conflict/i);
  await timelineSwitch(page).click();
  await expect(panel(page)).toBeHidden();
  await timelineSwitch(page).click();
  await expect(eventRow(page, 'Local work')).toBeVisible();
  await page.evaluate(() => { (window as Window & { restoreStorage?: () => void }).restoreStorage?.(); });
  await page.getByRole('button', { name: 'Edit Local work', exact: true }).click();
  await page.getByRole('textbox', { name: 'Start time', exact: true }).fill('10:30');
  await page.getByRole('textbox', { name: 'End time', exact: true }).fill('11:30');
  await saveEvent(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await openDay(page);
  await expect(eventRow(page, 'Local work')).toContainText('10:30–11:30');
  await expect(eventRow(page, 'Remote conflict')).toContainText('09:30–10:30');
  await expect(page.getByRole('list', { name: 'Events for this day' }).getByRole('listitem')).toHaveCount(2);
  await expect(summary(page).getByLabel('2h logged', { exact: true })).toBeVisible();
});
