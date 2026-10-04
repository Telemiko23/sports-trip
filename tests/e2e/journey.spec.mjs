import { test, expect } from '@playwright/test';
import { open, firstSearch, tripIds } from './helpers.mjs';

test.describe('P01 first visit, destination and fixed dates', () => {
  test('London + 9–11 October: matching results, exact dates retained into My trip, no sport choice required', async ({ page }) => {
    await open(page);
    await expect(page.locator('#onboarding')).toBeVisible();
    await expect(page.locator('#obTitle')).toContainText('גלו את אירועי הספורט');
    await firstSearch(page);
    await expect(page.locator('#summary')).toContainText('אירועים');
    await expect(page.locator('#ctxBar')).toContainText('לונדון');
    await expect(page.locator('#ctxBar')).toContainText('9–11 באוקטובר');
    const names = await page.locator('#list .ev .title-btn').allInnerTexts();
    expect(names.join(' ')).toContain('ארסנל');
    expect(names.join(' ')).not.toContain("מנצ'סטר");              // outside the 150 km nearby area
    await page.locator('#list .ev', { hasText: 'ארסנל' }).locator('.add').click();
    await page.locator('#list .ev', { hasText: 'ווסט האם' }).locator('.add').click();
    await page.click('#tab-trip');
    await expect(page.locator('.tsummary')).toContainText('2 לילות');           // fixed 9→11: no extra night
    await expect(page.locator('#tArr')).toHaveValue('2026-10-09');
    await expect(page.locator('#tDep')).toHaveValue('2026-10-11');
    await expect(page.locator('.tday')).toHaveCount(3);
    await expect(page.locator('.tfree')).toHaveCount(1);                           // the 11th has no chosen event: free time, not "no events"
    expect(page.errors).toEqual([]);
  });

  test('the secondary path «עדיין אין לי יעד» opens deliberate global browsing', async ({ page }) => {
    await open(page);
    await page.fill('#obFrom', '2026-10-09');
    await page.fill('#obTo', '2026-10-11');
    await page.click('#obBrowse');
    await expect(page.locator('#ctxBar')).toContainText('כל היעדים');
    await expect(page.locator('#list .ev').first()).toBeVisible();
  });

  test('Enter submits the first-visit form from a date field and from the destination (after selecting)', async ({ page }) => {
    await open(page);
    await firstSearch(page, { submit: 'enter' });
    await expect(page.locator('#summary')).toContainText('אירועים');
  });
});

test.describe('P03 invalid destination', () => {
  test('first visit: unknown text blocks submission with an explanation, never a worldwide fallback', async ({ page }) => {
    await open(page);
    await page.fill('#obDest', 'zzzznotacity');
    await page.fill('#obFrom', '2026-10-09');
    await page.fill('#obTo', '2026-10-11');
    await page.click('#obGo');
    await expect(page.locator('#obDestErr')).toBeVisible();
    await expect(page.locator('#obDest')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#onboarding')).toBeVisible();
  });

  test('editing in place: invalid text keeps the applied destination and results; clearing/«no destination» is explicit', async ({ page }) => {
    await open(page);
    await firstSearch(page);
    const before = await page.locator('#summary').innerText();
    await page.click('#ctxEdit');
    await page.fill('#cxDest', 'zzzznotacity');
    await page.click('#cxGo');
    await expect(page.locator('#cxDestErr')).toBeVisible();
    await page.keyboard.press('Escape');                                          // closes the combobox list or the dialog
    if (await page.locator('#ctxDialog[open]').count()) await page.keyboard.press('Escape');
    await expect(page.locator('#ctxBar')).toContainText('לונדון');
    expect(await page.locator('#summary').innerText()).toBe(before);
  });

  test('a prefix is a suggestion, not the destination', async ({ page }) => {
    await open(page);
    await page.fill('#obDest', 'לונ');
    await page.fill('#obFrom', '2026-10-09');
    await page.fill('#obTo', '2026-10-11');
    await page.press('#obTo', 'Enter');
    await expect(page.locator('#obDestErr')).toBeVisible();
  });
});

test.describe('P07 add from the list, resize, refresh and return', () => {
  test('selections survive refresh and viewport change; no duplicates; focus stays on the add button', async ({ page }) => {
    await open(page);
    await firstSearch(page);
    const add = page.locator('#list .ev', { hasText: 'ארסנל' }).locator('.add');
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(add).toHaveAttribute('aria-pressed', 'true');
    await expect(add).toBeFocused();
    await expect(page.locator('[data-trip-count]')).toHaveText('1');
    await page.setViewportSize({ width: 600, height: 800 });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(page.locator('#list .ev', { hasText: 'ארסנל' }).locator('.add')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-trip-count]')).toHaveText('1');
    expect((await tripIds(page)).length).toBe(1);
    await page.locator('#list .ev', { hasText: 'ארסנל' }).locator('.add').click();     // toggle off, then undo
    await expect(page.locator('.toast')).toContainText('הוסר מהטיול');
    await page.click('.toast-act');
    expect((await tripIds(page)).length).toBe(1);
  });
});
