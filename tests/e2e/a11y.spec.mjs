import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open, firstSearch, toPlan, PLAN_FEED } from './helpers.mjs';

// Automated axe checks cover only a subset of WCAG; keyboard/focus behaviour is asserted separately below and
// screen-reader / real-device checks are documented as a manual handoff in QA_REPORT.md.
async function scan(page, label) {
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = res.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(bad, label + ' axe violations').toEqual([]);
}

test.describe('axe on the main states', () => {
  test('first visit, results, event dialog, filter dialog, trip', async ({ page }) => {
    await open(page, { feed: PLAN_FEED });
    await scan(page, 'onboarding');
    await firstSearch(page);
    await scan(page, 'results');
    await page.locator('#list .title-btn').first().click();
    await expect(page.locator('#evDialog')).toBeVisible();
    await scan(page, 'event dialog');
    await page.keyboard.press('Escape');
    await page.click('#filterBtn');
    await expect(page.locator('#fdDialog')).toBeVisible();
    await scan(page, 'filter dialog');
    await page.keyboard.press('Escape');
    await page.locator('#list .ev:not(.ev-group) .add').first().click();
    await page.click('#tab-trip');
    await scan(page, 'trip');
  });

  test('plan tab: form, proposals, replace panel, empty state', async ({ page }) => {
    await toPlan(page);
    await scan(page, 'plan with proposals');
    await page.locator('.plan-card [data-pl="replace"]').first().click();
    await scan(page, 'plan replace panel');
    await page.check('input[name="plMode"][value="flexible"]');
    await page.selectOption('#plMonth', '2027-02');
    await page.click('#plGo');
    await expect(page.locator('#plResults')).toContainText('אחרי סוף הנתונים');
    await scan(page, 'plan empty state');
  });
});

test.describe('keyboard', () => {
  test('the plan form and a proposal are fully operable without a pointer, with a visible focus ring', async ({ page }) => {
    await toPlan(page);
    await page.locator('#plText').focus();
    await page.keyboard.insertText('סוף שבוע בלונדון באוקטובר');
    await page.keyboard.press('Enter');                                                       // Enter submits from the text field
    await page.waitForSelector('.plan-card');
    const lock = page.locator('.plan-card [data-pl="lock"]').first();
    await lock.focus();
    await expect(lock).toBeFocused();
    const outline = await lock.evaluate((el) => { const s = getComputedStyle(el); return { w: s.outlineWidth, st: s.outlineStyle }; });
    expect(outline.st).not.toBe('none'); expect(parseFloat(outline.w)).toBeGreaterThanOrEqual(2);   // :focus-visible is not overridden away
    await page.keyboard.press('Enter');
    await expect(lock).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.plan-card [data-pl="lock"]').first()).toBeFocused();         // focus is kept after the list re-renders
    await page.locator('.plan-card [data-pl="replace"]').first().focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.plan-alts-wrap')).toBeVisible();
    await expect(page.locator('.plan-alts-wrap button').first()).toBeFocused();              // focus moves into the opened panel
  });

  test('320px: the plan flow reflows with no horizontal scroll and nothing clipped', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await toPlan(page);
    const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(over.sw).toBeLessThanOrEqual(over.cw + 1);
    await page.click('#tab-trip');
    const over2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    expect(over2.sw).toBeLessThanOrEqual(over2.cw + 1);
  });

  test('200% text zoom equivalent (narrow viewport + larger root font): long Hebrew names wrap, never truncate', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page, { feed: PLAN_FEED });
    await page.addStyleTag({ content: 'html{font-size:200% !important}' });
    await firstSearch(page);
    const clipped = await page.evaluate(() => [...document.querySelectorAll('#list .title-btn')].filter((b) => b.scrollWidth > b.clientWidth + 1).length);
    expect(clipped).toBe(0);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over).toBeLessThanOrEqual(1);
  });
});
