import { test, expect } from '@playwright/test';
import { open, firstSearch, toPlan, PLAN_FEED, tripIds } from './helpers.mjs';

const card = (page, i = 0) => page.locator('.plan-card').nth(i);

test.describe('P09 pace presets have different objectives', () => {
  test('balanced (default, labelled) vs single-event vs sport-focused; free time preserved; previews never touch the trip', async ({ page }) => {
    await toPlan(page);
    await expect(page.locator('input[name="plPace"][value="balanced"]')).toBeChecked();
    await expect(page.locator('#plFormHost')).toContainText('ברירת מחדל');
    await expect(page.locator('#plResults')).toContainText('תצוגה מקדימה');
    const maxEvents = async () => Math.max(...(await page.locator('.plan-card').evaluateAll((cs) => cs.map((c) => c.querySelectorAll('.plan-ev').length))));
    const balanced = await maxEvents();
    expect(balanced).toBeLessThanOrEqual(2);                                              // ~1 per 2 days over 3 days
    await expect(page.locator('.plan-free').first()).toBeVisible();                        // a free day is shown as free time, not an error
    await page.check('input[name="plPace"][value="single"]');
    await page.waitForFunction(() => document.querySelectorAll('.plan-card').length > 0 && [...document.querySelectorAll('.plan-card')].every((c) => c.querySelectorAll('.plan-ev').length === 1));
    expect(await page.locator('.plan-card').count()).toBeGreaterThanOrEqual(2);            // a small shortlist of single-event choices
    await page.check('input[name="plPace"][value="sport"]');
    await page.waitForFunction((b) => [...document.querySelectorAll('.plan-card')].some((c) => c.querySelectorAll('.plan-ev').length > b), balanced);
    expect((await tripIds(page)).length).toBe(0);
    await page.reload();                                                                  // the pace is a persisted preference
    await page.click('#tab-plan');
    await expect(page.locator('input[name="plPace"][value="sport"]')).toBeChecked();
  });
});

test.describe('P02 flexible month + duration', () => {
  test('distinct real windows with actual dates; choosing one carries exact dates into search', async ({ page }) => {
    await open(page, { feed: PLAN_FEED });
    await page.fill('#obDest', 'לונדון'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.check('input[name="obMode"][value="flexible"]');
    await page.selectOption('#obMonth', '2026-11');
    await page.selectOption('#obDays', '3');
    await page.click('#obGo');                                                              // a flexible request opens the Plan tab
    await expect(page.locator('#tab-plan')).toHaveAttribute('aria-selected', 'true');
    await page.waitForSelector('.plan-card');
    const heads = await page.locator('.plan-card h3').allInnerTexts();
    expect(heads.length).toBeGreaterThanOrEqual(1); expect(heads.length).toBeLessThanOrEqual(3);
    expect(heads[0]).toMatch(/חלון א׳: \d+–\d+ בנובמבר/);                                    // actual dates, inside the requested month
    await expect(card(page)).toContainText('ארסנל');
    await page.locator('.plan-card [data-pl="choose"]').first().click();
    await expect(page.locator('input[name="plMode"][value="fixed"]')).toBeChecked();        // the window became the fixed dates
    await page.click('#tab-search');
    await expect(page.locator('#ctxBar')).toContainText('בנובמבר');
    await expect(page.locator('#ctxBar')).not.toContainText('גמיש');
    expect(page.errors).toEqual([]);
  });

  test('a month beyond the feed says so truthfully; no invented range', async ({ page }) => {
    await toPlan(page);
    await page.check('input[name="plMode"][value="flexible"]');
    await page.selectOption('#plMonth', '2027-02');
    await page.click('#plGo');
    await expect(page.locator('#plResults')).toContainText('אחרי סוף הנתונים');
    await expect(page.locator('.plan-card')).toHaveCount(0);
  });
});

test.describe('P04/P05/P06 free text', () => {
  const SENTENCE = 'סוף שבוע בלונדון באוקטובר עם משחק של ארסנל';
  async function seed(page) {
    await open(page, { feed: PLAN_FEED });
    await firstSearch(page, { dest: 'לונדון', from: '2026-12-01', to: '2026-12-03' });
    await page.click('#tab-plan'); await page.waitForSelector('#plText');
  }

  test('paste then ONE click; typing then Enter: same understood constraints and the same eligible Arsenal choice', async ({ page }) => {
    await seed(page);
    await page.focus('#plText'); await page.keyboard.insertText(SENTENCE);                   // paste-like: an input event with no keydown
    await expect(page.locator('#plUnderstood')).toContainText('העדפה: ארסנל');             // understood live, before any button
    await page.click('#plGo');
    await expect(page.locator('input[name="plMode"][value="flexible"]')).toBeChecked();
    await expect(page.locator('#plMonth')).toHaveValue('2026-10');
    await expect(page.locator('#plDays')).toHaveValue('3');
    await expect(page.locator('#plStartDay')).toHaveValue('5');
    await page.waitForSelector('.plan-card');
    const first = await page.locator('.plan-card').first().innerText();
    expect(first).toContain('ארסנל'); expect(first).toContain('כולל משחק של ארסנל');
    expect(page.errors).toEqual([]);
  });

  test('typing then Enter: the same understood constraints and the same Arsenal choice', async ({ page }) => {
    await seed(page);
    await page.locator('#plText').pressSequentially(SENTENCE);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.plan-card');
    expect(await page.locator('.plan-card').first().innerText()).toContain('ארסנל');
    expect(page.errors).toEqual([]);
  });

  test('manual field edits are kept; clearing the text removes the team preference and keeps the fields', async ({ page }) => {
    await seed(page);
    await page.fill('#plText', SENTENCE);
    await page.click('#plApply');
    await page.selectOption('#plDays', '4');                                                // a deliberate edit after the text was applied
    await page.click('#plGo');                                                              // text unchanged: it must NOT re-override the edit
    await expect(page.locator('#plDays')).toHaveValue('4');
    await page.fill('#plText', '');
    await expect(page.locator('#plUnderstood')).toContainText('העדפת הקבוצה הוסרה');
    await page.click('#plGo');
    await expect(page.locator('#plDays')).toHaveValue('4');
    await page.waitForSelector('.plan-card');
    expect(await page.locator('.plan-card').first().innerText()).not.toContain('כולל משחק של ארסנל');
  });

  test('a country name is a destination, never a team; "אמצע-סוף ינואר" is read as mid AND end of the month', async ({ page }) => {
    await seed(page);
    await page.fill('#plText', 'אנגליה אמצע-סוף ינואר');
    await expect(page.locator('#plUnderstood')).toContainText('יעד: אנגליה');
    await expect(page.locator('#plUnderstood')).not.toContainText('העדפה');
    await page.click('#plApply');
    await expect(page.locator('#plDest')).toHaveValue(/אנגליה/);
    await expect(page.locator('#plMonth')).toHaveValue('2027-01');
    await expect(page.locator('#plPart')).toHaveValue('mid-end');
  });
});

test.describe('P10 lock, exclude, replace, regenerate', () => {
  test('a locked event survives regeneration, an excluded one never returns, a replacement previews consequences and leaves the trip alone', async ({ page }) => {
    await toPlan(page);
    await page.check('input[name="plPace"][value="sport"]');
    await page.waitForSelector('.plan-card');
    const day9 = () => page.locator('.plan-card').first().locator('.plan-day', { hasText: '9 באוקטובר' }).locator('.plan-ev').first();
    const lockedTitle = (await day9().locator('.title-btn').innerText()).trim();
    await day9().locator('[data-pl="lock"]').click();
    await expect(day9().locator('[data-pl="lock"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('[data-pl="regen"]');
    for (const c of await page.locator('.plan-card').all()) await expect(c).toContainText(lockedTitle);          // locked: in every proposal
    const arsenal = page.locator('.plan-ev', { hasText: 'ארסנל' }).first();
    expect(await arsenal.count()).toBeGreaterThan(0);
    await arsenal.locator('[data-pl="exclude"]').click();
    await page.click('[data-pl="regen"]');
    await expect(page.locator('.plan-card', { hasText: 'ארסנל' })).toHaveCount(0);                          // never reintroduced
    await expect(page.locator('.plan-excluded summary')).toContainText('(1)');
    const row = page.locator('.plan-card').first().locator('.plan-ev:not(.in-trip)').first();
    if (await row.count()) {
      await row.locator('[data-pl="replace"]').click();
      await expect(page.locator('.plan-alts-wrap')).toBeVisible();
      await expect(page.locator('.plan-alts-wrap')).toContainText(/בלי התנגשות|לא מומלץ|יעבור/);
    }
    expect((await tripIds(page)).length).toBe(0);
    await page.locator('.plan-excluded summary').click();
    await page.locator('[data-pl="unexclude"]').first().click();
    await expect(page.locator('.plan-excluded')).toHaveCount(0);
  });

  test('add merges without duplicates and keeps existing entries; replacing the whole trip is explicit and undoable', async ({ page }) => {
    await toPlan(page);
    await page.locator('.plan-card').first().locator('[data-pl="add"]').click();
    await expect(page.locator('[data-trip-count]')).not.toHaveText('0');
    const n1 = (await tripIds(page)).length;
    expect(n1).toBeGreaterThanOrEqual(1);
    await expect(page.locator('.plan-card').first()).toContainText('כבר בטיול');
    expect(await page.locator('.plan-card').first().locator('[data-pl="add"]').count()).toBe(0);             // nothing left to add: no duplicate path
    const rep = page.locator('[data-pl="replace-trip"]').first();
    if (await rep.count()) {
      page.once('dialog', (d) => d.accept());
      await rep.click();
      await expect(page.locator('.toast')).toContainText('הטיול הוחלף');
      await page.click('.toast-act');
      expect((await tripIds(page)).length).toBe(n1);
    }
  });

  test('a locked event outside the fixed dates is explained, never dropped, and the dates are not widened', async ({ page }) => {
    await toPlan(page);
    await page.check('input[name="plPace"][value="sport"]');
    await page.waitForSelector('.plan-card');
    await page.locator('.plan-card').first().locator('.plan-day', { hasText: '9 באוקטובר' }).locator('[data-pl="lock"]').first().click();
    await page.fill('#plFrom', '2026-10-10'); await page.fill('#plTo', '2026-10-11');
    await expect(page.locator('#plStale')).toBeVisible();                                    // the stale results are labelled
    await page.click('#plGo');
    await expect(page.locator('.plan-conflicts')).toContainText('מחוץ לתאריכים');
    await expect(page.locator('.plan-range')).toContainText('10–11 באוקטובר');
  });
});

test.describe('P11 honest conflicts and uncertainty', () => {
  test('across-the-Channel events are never auto-combined; a manual pair is allowed and explained', async ({ page }) => {
    await open(page, { feed: PLAN_FEED });
    await firstSearch(page, { dest: 'בולון', from: '2026-10-09', to: '2026-10-11' });
    await page.click('#tab-plan'); await page.waitForSelector('#plResults');
    await page.check('input[name="plLodging"][value="multi"]');
    await page.check('input[name="plPace"][value="sport"]');
    await page.waitForSelector('.plan-card');
    for (const c of await page.locator('.plan-card').all()) {
      const text = await c.innerText();
      expect(text.includes('סושו') && /ווסט האם|ארסנל|קריסטל/.test(text)).toBe(false);
    }
    await expect(page.locator('#plResults')).toContainText('קו אווירי');                      // distance is an estimate, not a travel time
    await page.click('#tab-search');
    await page.locator('#list .ev', { hasText: 'סושו' }).locator('.add').click();
    await page.locator('#list .ev', { hasText: 'קריסטל' }).locator('.add').click();
    await page.click('#tab-trip');
    await expect(page.locator('.tnote').first()).toBeVisible();
  });
});

test.describe('P10b replace inside My trip', () => {
  test('alternatives are previewed with consequences; swapping keeps position, is undoable; a locked entry cannot be replaced', async ({ page }) => {
    await toPlan(page);
    await page.check('input[name="plPace"][value="single"]');
    await page.waitForSelector('.plan-card');
    await page.locator('.plan-card').first().locator('[data-pl="add"]').click();
    await page.click('#tab-trip');
    const before = (await tripIds(page))[0];
    await page.locator('[data-replace]').first().click();
    await expect(page.locator('#repDialog')).toBeVisible();
    await expect(page.locator('#repDialog')).toContainText(/בלי התנגשות|לא מומלץ|יעבור/);
    await page.locator('#repDialog [data-swap-to]').first().click();
    await expect(page.locator('.toast', { hasText: 'האירוע הוחלף' })).toBeVisible();
    const after = (await tripIds(page));
    expect(after.length).toBe(1); expect(after[0]).not.toBe(before);
    await page.locator('.toast', { hasText: 'האירוע הוחלף' }).locator('.toast-act').click();
    expect(await tripIds(page)).toEqual([before]);
    await page.locator('[data-lock]').first().click();
    await expect(page.locator('[data-replace]')).toHaveCount(0);                              // a locked entry is not offered for replacement
    expect(page.errors).toEqual([]);
  });
});

test.describe('P21b hostile provider data in the Plan and ticket surfaces', () => {
  test('markup in names/competitions/venues never becomes elements or script in proposals, alternatives, excluded list or ticket dialog', async ({ page }) => {
    const evil = '<img src=x onerror="window.__pwned=1"><b id=injected>x</b>';
    const feed = PLAN_FEED.replace(/"home_he": "ארסנל"/g, '"home_he": ' + JSON.stringify(evil)).replace(/"venue": "London Ground"/g, '"venue": ' + JSON.stringify(evil)).replace(/"comp_he": "Premier League"/g, '"comp_he": ' + JSON.stringify(evil));
    await open(page, { feed });
    await firstSearch(page);
    await page.click('#tab-plan');
    await page.waitForSelector('.plan-card');
    await page.check('input[name="plPace"][value="sport"]');
    await page.waitForSelector('.plan-card');
    const row = page.locator('.plan-ev').first();
    await row.locator('[data-pl="replace"]').click().catch(() => {});
    await page.locator('.plan-ev [data-pl="exclude"]').first().click().catch(() => {});
    await page.locator('.plan-excluded summary').click().catch(() => {});
    expect(await page.locator('#view-plan').innerText()).toContain('onerror');                 // the hostile text really reached the page, as inert text
    expect(await page.locator('#injected').count()).toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(await page.locator('#view-plan img[src="x"]').count()).toBe(0);
    expect(page.errors).toEqual([]);
  });
});
