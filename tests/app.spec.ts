import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const fixedToday = new Date('2026-11-05T12:00:00-05:00');
const storageKey = 'weekly-hours.entries.v1';
const monday = 'Monday, November 2, 2026 hours';
const tuesday = 'Tuesday, November 3, 2026 hours';
const calendarTrigger = (page: Page) => page.getByRole('button', { name: /Nov 2 – Nov 8/ });
const summary = (page: Page) => page.getByRole('complementary', { name: 'WEEKLY TOTAL' });
const balance = (page: Page, date: string) => page.locator(`#balance-${date}`);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(fixedToday);
  await page.goto('./');
});

test('decimal hours show signed daily differences and an exact weekly total', async ({ page }) => {
  await expect(balance(page, '2026-11-02')).toHaveText('—');
  await page.getByRole('textbox', { name: monday }).fill('6.5');
  await expect(balance(page, '2026-11-02')).toHaveText('−1h 30m');
  await expect(balance(page, '2026-11-02')).toHaveClass(/negative/);
  await page.getByRole('textbox', { name: tuesday }).fill('8.5');
  await expect(balance(page, '2026-11-03')).toHaveText('+30m');
  await expect(balance(page, '2026-11-03')).toHaveClass(/positive/);
  await expect(summary(page).getByLabel('15h logged')).toBeVisible();
  await expect(summary(page).getByRole('status')).toContainText('25h remaining');
});

test('entries survive reload and explicit zero differs from clearing a day', async ({ page }) => {
  const input = page.getByRole('textbox', { name: monday });
  await input.fill('6.5');
  await page.reload();
  await expect(input).toHaveValue('6.5');
  await input.fill('0');
  await expect(balance(page, '2026-11-02')).toHaveText('−8h');
  await page.reload();
  await expect(input).toHaveValue('0');
  await input.fill('');
  await expect(balance(page, '2026-11-02')).toHaveText('—');
  await page.reload();
  await expect(input).toHaveValue('');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), storageKey))
    .not.toHaveProperty('2026-11-02');
});

test('week navigation keeps separate entries and returns to the current week', async ({ page }) => {
  await page.getByRole('textbox', { name: monday }).fill('7');
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  const nextMonday = page.getByRole('textbox', { name: 'Monday, November 9, 2026 hours' });
  await expect(nextMonday).toHaveValue('');
  await nextMonday.fill('9');
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  await expect(page.getByRole('textbox', { name: monday })).toHaveValue('7');
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await expect(nextMonday).toHaveValue('9');
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await expect(page.getByRole('textbox', { name: monday })).toHaveValue('7');
  await expect(page.getByRole('button', { name: 'This week', exact: true })).toBeDisabled();
});

test('Thanksgiving reduces the target and accepts holiday and weekend hours', async ({ page }) => {
  await calendarTrigger(page).click();
  await page.getByRole('button', { name: 'Thursday, November 26, 2026, Thanksgiving Day', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(summary(page)).toContainText('of 32h expected');
  await expect(page.getByText('Thanksgiving Day', { exact: true })).toBeVisible();
  for (const date of ['Monday, November 23', 'Tuesday, November 24', 'Wednesday, November 25', 'Friday, November 27']) {
    await page.getByRole('textbox', { name: `${date}, 2026 hours` }).fill('8');
  }
  await page.getByRole('textbox', { name: 'Thursday, November 26, 2026 hours' }).fill('2');
  await page.getByRole('textbox', { name: 'Saturday, November 28, 2026 hours' }).fill('1.5');
  await expect(balance(page, '2026-11-26')).toHaveText('+2h');
  await expect(balance(page, '2026-11-28')).toHaveText('+1h 30m');
  await expect(summary(page).getByLabel('35h 30m logged')).toBeVisible();
  await expect(summary(page).getByRole('status')).toContainText('3h 30m over target');
});

test('calendar labels holidays and Escape returns keyboard focus to its trigger', async ({ page }) => {
  const trigger = calendarTrigger(page);
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Choose a week' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Wednesday, November 11, 2026, Veterans Day', exact: true }))
    .toBeVisible();
  await expect(dialog.getByText('Thanksgiving Day', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('invalid input preserves the previous valid entry and reports a useful error', async ({ page }) => {
  const input = page.getByRole('textbox', { name: monday });
  await input.fill('8.5');
  await input.fill('25');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toContainText('Enter a number from 0 to 24');
  await expect(summary(page).getByLabel('8h 30m logged', { exact: true })).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue('8.5');
  await expect(input).toHaveAttribute('aria-invalid', 'false');
});

test('unsaved edits survive storage failures and persist together when storage recovers', async ({ page }) => {
  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    const testWindow = window as Window & { restoreStorageWrite?: () => void };
    testWindow.restoreStorageWrite = () => { Storage.prototype.setItem = nativeSetItem; };
    Storage.prototype.setItem = () => { throw new DOMException('Storage is full', 'QuotaExceededError'); };
  });
  await page.getByRole('textbox', { name: monday }).fill('6.5');
  await page.getByRole('textbox', { name: tuesday }).fill('8.5');
  await expect(page.getByRole('textbox', { name: monday })).toHaveValue('6.5');
  await expect(page.getByRole('textbox', { name: tuesday })).toHaveValue('8.5');
  await expect(summary(page).getByLabel('15h logged')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Your browser could not save these hours');
  await page.evaluate(() => {
    const testWindow = window as Window & { restoreStorageWrite?: () => void };
    testWindow.restoreStorageWrite?.();
    delete testWindow.restoreStorageWrite;
  });
  const wednesday = page.getByRole('textbox', { name: 'Wednesday, November 4, 2026 hours' });
  await wednesday.fill('8');
  await expect(summary(page).getByLabel('23h logged')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: monday })).toHaveValue('6.5');
  await expect(page.getByRole('textbox', { name: tuesday })).toHaveValue('8.5');
  await expect(wednesday).toHaveValue('8');
  await expect(summary(page).getByLabel('23h logged')).toBeVisible();
});

test('an unrelated storage event preserves the decimal draft being edited', async ({ page }) => {
  const input = page.getByRole('textbox', { name: monday });
  await input.fill('8.');
  await page.evaluate(key => {
    const entries = JSON.parse(localStorage.getItem(key) ?? '{}');
    entries['2026-11-03'] = 510;
    localStorage.setItem(key, JSON.stringify(entries));
    window.dispatchEvent(new StorageEvent('storage', { key }));
  }, storageKey);
  await expect(input).toHaveValue('8.');
  await expect(page.getByRole('textbox', { name: tuesday })).toHaveValue('8.5');
  await input.press('End');
  await input.pressSequentially('5');
  await expect(input).toHaveValue('8.5');
  await expect(summary(page).getByLabel('17h logged')).toBeVisible();
});

test('the page and holiday calendar fit narrow mobile screens', async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('textbox', { name: monday })).toBeVisible();
    await calendarTrigger(page).click();
    const dialog = page.getByRole('dialog', { name: 'Choose a week' });
    await expect(dialog).toBeVisible();
    const bounds = await dialog.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Close calendar', exact: true }).click();
  }
});

test('reduced-motion preference suppresses decorative animations and transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
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

test('the main page passes axe accessibility checks', async ({ page }) => {
  await page.getByRole('textbox', { name: monday }).fill('6.5');
  await page.getByRole('textbox', { name: tuesday }).fill('8.5');
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(result.violations).toEqual([]);
});

test('the open holiday calendar passes axe accessibility checks', async ({ page }) => {
  await calendarTrigger(page).click();
  await expect(page.getByRole('dialog', { name: 'Choose a week' })).toBeVisible();
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  expect(result.violations).toEqual([]);
});
