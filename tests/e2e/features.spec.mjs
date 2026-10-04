import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { open, prepare, firstSearch, tripIds, SAMPLE } from './helpers.mjs';

async function searchLondon(page) { await open(page); await firstSearch(page); }

test.describe('P08 draft filters', () => {
  test('edits do not touch applied results until applied; cancel/Escape discard; chips and reset keep destination, dates and trip', async ({ page }) => {
    await searchLondon(page);
    await page.locator('#list .ev', { hasText: 'ארסנל' }).locator('.add').click();
    const summary0 = await page.locator('#summary').innerText();
    await page.click('#filterBtn');
    await expect(page.locator('#fdDialog')).toBeVisible();
    await page.locator('#fdDialog summary', { hasText: 'כדורגל' }).click();
    await page.locator('#fdDialog label.comp', { hasText: "הצ'מפיונשיפ" }).locator('input').uncheck();
    await expect(page.locator('#fdApply')).toContainText('הצג');
    expect(await page.locator('#summary').innerText()).toBe(summary0);                 // background state untouched
    await page.keyboard.press('Escape');                                                // discard
    await expect(page.locator('#fdDialog')).not.toBeVisible();
    expect(await page.locator('#summary').innerText()).toBe(summary0);
    await expect(page.locator('#filterBtnText')).toHaveText('סינון');
    await expect(page.locator('#filterBtn')).toBeFocused();                             // focus returns to the opener

    await page.click('#filterBtn');
    await page.locator('#fdDialog summary', { hasText: 'כדורגל' }).click();
    await page.locator('#fdDialog label.comp', { hasText: "הצ'מפיונשיפ" }).locator('input').uncheck();
    await page.click('#fdApply');
    await expect(page.locator('#list .ev', { hasText: 'ווסט האם' })).toHaveCount(0);
    await expect(page.locator('#filterChips')).toContainText('תחרויות מוסתרות: 1');
    await expect(page.locator('#filterBtnText')).toHaveText('סינון (1)');

    await page.locator('#filterChips [data-act="reset-filters"]').click();             // scoped reset: optional filters only
    await expect(page.locator('#list .ev', { hasText: 'ווסט האם' })).toHaveCount(1);
    await expect(page.locator('#ctxBar')).toContainText('לונדון');
    await expect(page.locator('#ctxBar')).toContainText('9–11 באוקטובר');
    await expect(page.locator('[data-trip-count]')).toHaveText('1');
  });

  test('basic sport chips filter live and «כל הענפים» restores', async ({ page }) => {
    await searchLondon(page);
    await page.locator('.chipbtn[data-sport="tennis"]').click();
    const kinds = await page.locator('#list .ev .sport-label').allInnerTexts();
    expect(kinds.length).toBeGreaterThan(0);
    expect(kinds.every((k) => k.includes('טניס'))).toBe(true);
    await page.locator('.chipbtn[data-sport="all"]').click();
    expect((await page.locator('#list .ev').count())).toBeGreaterThan(kinds.length);
  });
});

test.describe('event details', () => {
  test('every event opens a detail dialog; Escape and Back close it and return focus; add from inside', async ({ page }) => {
    await searchLondon(page);
    const opener = page.locator('#list .ev', { hasText: 'ארסנל' }).locator('.title-btn');
    await opener.click();
    const dlg = page.locator('#evDialog');
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('#evTitle')).toContainText('ארסנל');
    await expect(dlg).toContainText('Emirates Stadium');
    await expect(dlg).toContainText('מידע על כרטיסים אינו זמין');
    await dlg.locator('.add').click();
    await expect(page.locator('#list .ev', { hasText: 'ארסנל' }).locator('.add')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(dlg).not.toBeVisible();
    await expect(opener).toBeFocused();
    await opener.click();                                                                // Back closes the dialog without leaving the app
    await page.goBack();
    await expect(dlg).not.toBeVisible();
    await expect(page.locator('#ctxBar')).toContainText('לונדון');
  });

  test('a session table is shown for a tournament day that has one, and an unknown venue says so', async ({ page }) => {
    await open(page);
    await page.fill('#obDest', 'לונדון'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.fill('#obFrom', '2026-10-09'); await page.fill('#obTo', '2026-10-10'); await page.click('#obGo');
    await page.waitForSelector('#list .ev');
    await page.locator('#list .ev', { hasText: 'סמפל אינדורס' }).first().locator('.title-btn').click();
    await expect(page.locator('#evDialog')).toContainText('מגרש מרכזי');
    await page.keyboard.press('Escape');
    await page.locator('#list .ev', { hasText: 'ערב דארטס' }).locator('.title-btn').click();
    await expect(page.locator('#evDialog')).toContainText('מיקום מדויק עדיין לא ידוע');
    await expect(page.locator('#evDialog')).toContainText('מרכז העיר בלבד');
  });
});

test.describe('P12 multi-day events and United Cup', () => {
  test('a tournament with 3+ days becomes ONE group; a single day can still be added; counts say events vs tournament days', async ({ page }) => {
    await open(page);
    await page.fill('#obDest', 'לונדון'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.fill('#obFrom', '2026-10-09'); await page.fill('#obTo', '2026-10-14'); await page.click('#obGo');
    await page.waitForSelector('#list .ev-group');
    await expect(page.locator('#list .ev-group')).toHaveCount(1);
    await expect(page.locator('#summary')).toContainText('טורנירים רב־יומיים');
    await page.locator('#list .ev-group summary').click();
    await page.locator('#list .ev-group li[data-ev="100000000103"] .add').click();
    expect(await tripIds(page)).toEqual([100000000103]);
  });

  test('United Cup keeps every known location with provenance and is visibly provisional (no false single-city venue)', async ({ page }) => {
    await open(page);
    await page.fill('#obFrom', '2027-01-01'); await page.fill('#obTo', '2027-01-10'); await page.click('#obBrowse');
    await page.waitForSelector('#list .ev-group');
    await expect(page.locator('#list .ev-group')).toContainText('מיקום משוער');
    await expect(page.locator('#list .ev-group')).toContainText('מיקום מדויק עדיין לא ידוע');
    await page.locator('#list .ev-group summary').click();
    await page.locator('#list .ev-group [data-open]').first().click();
    await expect(page.locator('#evDialog')).toContainText('Perth');
    await expect(page.locator('#evDialog')).toContainText('Sydney');
    await expect(page.locator('#evDialog')).toContainText('AllSportDB');
  });
});

test.describe('P19 storage, migration, export/import', () => {
  const legacy = {
    tripIds_v1: JSON.stringify([102, 101, 424242]),
    filterCtx_v1: JSON.stringify({ base: { city: 'London', cityHe: 'לונדון', lat: 51.5074, lng: -0.1278, country: 'England' }, from: '2026-10-09', to: '2026-10-11' }),
    onboarded_v1: '1'
  };
  test('legacy keys are migrated, kept byte-identical, backed up; an id missing from the feed is preserved', async ({ page }) => {
    await open(page, { storage: legacy });
    await expect(page.locator('#onboarding')).toBeHidden();
    await expect(page.locator('.toast')).toContainText('שחזרנו');
    await expect(page.locator('[data-trip-count]')).toHaveText('3');
    await expect(page.locator('#ctxBar')).toContainText('לונדון');
    await page.click('#tab-trip');
    await expect(page.locator('.tentry--missing')).toHaveCount(1);
    await expect(page.locator('.tentry--missing')).toContainText('כבר לא מופיע בעדכון האחרון');
    const after = await page.evaluate(() => ({ t: localStorage.getItem('tripIds_v1'), c: localStorage.getItem('filterCtx_v1'), o: localStorage.getItem('onboarded_v1'), b: localStorage.getItem('tosport_legacy_backup_v1') }));
    expect(after.t).toBe(legacy.tripIds_v1); expect(after.c).toBe(legacy.filterCtx_v1); expect(after.o).toBe('1');
    expect(JSON.parse(after.b).tripIds_v1).toBe(legacy.tripIds_v1);
    await page.reload();                                                                  // idempotent: same trip after a second start
    await expect(page.locator('[data-trip-count]')).toHaveText('3');
  });

  test('malformed legacy data: the app loads, the problem is reported, the original is preserved', async ({ page }) => {
    await open(page, { storage: { tripIds_v1: '{not json', filterCtx_v1: '[1,2', onboarded_v1: '1' } });
    await expect(page.locator('#main')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('לא היו תקינים');
    const kept = await page.evaluate(() => localStorage.getItem('tripIds_v1'));
    expect(kept).toBe('{not json');
    expect(page.errors).toEqual([]);
  });

  test('unavailable storage: still usable, with an honest notice', async ({ page }) => {
    await open(page, { brokenStorage: true });
    await expect(page.locator('#onboarding')).toBeVisible();
    await expect(page.locator('.toast')).toContainText('השמירה בדפדפן אינה זמינה');
    await firstSearch(page);
    await page.locator('#list .ev:not(.ev-group) .add').first().click();
    await expect(page.locator('[data-trip-count]')).toHaveText('1');
  });

  test('export → clear (confirmed, undoable) → import restores; hostile files are rejected', async ({ page }, info) => {
    await searchLondon(page);
    await page.locator('#list .ev', { hasText: 'ארסנל' }).locator('.add').click();
    await page.locator('#list .ev', { hasText: 'ווסט האם' }).locator('.add').click();
    await page.click('#tab-trip');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportTrip')]);
    const file = info.outputPath('backup.json');
    await dl.saveAs(file);
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(doc.format).toBe('tosport-trip-backup');
    expect(doc.legacy.tripIds_v1.length).toBe(2);
    page.once('dialog', (d) => d.accept());
    await page.click('#clearTrip');
    await expect(page.locator('.empty')).toContainText('עוד לא בחרתם');
    await page.click('.toast-act');                                                       // undo the clear
    await expect(page.locator('.tentry')).toHaveCount(2);
    page.once('dialog', (d) => d.accept());
    await page.click('#clearTrip');
    await expect(page.locator('.empty')).toBeVisible();
    await page.setInputFiles('#importFile', file);                                       // empty trip -> restored directly
    await expect(page.locator('.tentry')).toHaveCount(2);
    const bad = info.outputPath('bad.json');
    fs.writeFileSync(bad, '{"format":"nope"}');
    await page.setInputFiles('#importFile', bad);
    await expect(page.locator('.toast').last()).toContainText('לא קובץ גיבוי');
    await expect(page.locator('.tentry')).toHaveCount(2);
  });
});

test.describe('P20 the feed changes under a saved trip', () => {
  const entries = [101, 102].map((id) => ({ id, locked: false, addedAt: null, snap: { id, title: id === 101 ? 'ווסט האם – QPR' : 'ארסנל – לידס', dt: id === 101 ? '2026-10-09T18:00' : '2026-10-10T12:30', date: id === 101 ? '2026-10-09' : '2026-10-10', city: 'London', cityHe: 'לונדון', venue: id === 101 ? 'London Stadium' : 'Emirates Stadium', compHe: 'x', sportId: 'football', timeKnown: true, kind: 'match' } }));
  const storage = { tosport_v2_trip: JSON.stringify({ v: 2, trip: { entries, excluded: [], arrival: null, departure: null, origin: 'TLV' } }),
    tosport_v2_context: JSON.stringify({ v: 2, context: { dest: null, dates: { mode: 'fixed', from: '2026-10-09', to: '2026-10-11' }, radiusKm: 150, browse: true }, filters: {}, prefs: {}, meta: { onboarded: true } }) };
  test('a changed event asks for reconciliation; a vanished event is kept and explained, never silently deleted', async ({ page }) => {
    const feed = SAMPLE.replace(/\{ id: 102,[^\n]*\n/, '');                              // event 102 is gone from the feed
    await open(page, { storage, feed });
    await page.click('#tab-trip');
    await expect(page.locator('.tentry')).toHaveCount(2);
    await expect(page.locator('.tentry--missing')).toContainText('כבר לא מופיע בעדכון האחרון');
    await expect(page.locator('.tentry:not(.tentry--missing)')).toContainText('פרטי האירוע השתנו');   // 101 moved from 18:00 to 20:00
    await expect(page.locator('.tentry:not(.tentry--missing)')).toContainText('היה:');
    await page.locator('[data-ack]').click();
    await expect(page.locator('.tstatus.warn', { hasText: 'השתנו' })).toHaveCount(0);
    expect((await tripIds(page)).sort()).toEqual([101, 102]);                           // nothing was dropped
  });
});

test.describe('P21 untrusted provider data', () => {
  test('markup and unsafe URLs in provider fields never become script or links', async ({ page }) => {
    const evil = SAMPLE.replace("home: 'West Ham'", "home: '<img src=x onerror=window.__pwned=1>'").replace("home_he: 'ווסט האם'", "home_he: '<img src=x onerror=window.__pwned=1>'")
      .replace("venue: 'London Stadium'", "venue: '\"><script>window.__pwned=1</script>'").replace("web_url: 'https://example.org/atp/sample'", "web_url: 'javascript:window.__pwned=1'");
    await open(page, { feed: evil });
    await firstSearch(page);
    await page.locator('#list .title-btn').first().click();
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(await page.locator('a[href^="javascript:"]').count()).toBe(0);
    expect(await page.locator('#list img[onerror], #list script').count()).toBe(0);
    expect(page.errors).toEqual([]);
  });
});

test.describe('P22 blocked network', () => {
  test('map library blocked: the list keeps working and the failure is explained', async ({ page }) => {
    await prepare(page);
    page.errors = []; page.on('pageerror', (e) => page.errors.push(e.message));
    await page.route('https://cdn.jsdelivr.net/**', (r) => r.abort());
    await page.goto('/index.html');
    await firstSearch(page);
    await page.click('.viewsw [data-mode="map"]');
    await expect(page.locator('#mapPanel')).toContainText('המפה לא נטענה');
    await page.click('.viewsw [data-mode="list"]');
    await expect(page.locator('#list .ev').first()).toBeVisible();
  });
});

test.describe('returning visitor and navigation', () => {
  test('saved context with PAST dates: explained, selections preserved, new dates offered (nothing shifted silently)', async ({ page }) => {
    const storage = { tosport_v2_context: JSON.stringify({ v: 2, context: { dest: null, dates: { mode: 'fixed', from: '2026-09-01', to: '2026-09-05' }, radiusKm: 150, browse: true }, filters: {}, prefs: {}, meta: { onboarded: true } }),
      tosport_v2_trip: JSON.stringify({ v: 2, trip: { entries: [{ id: 101 }], excluded: [], arrival: null, departure: null, origin: 'TLV' } }) };
    await open(page, { storage });
    await expect(page.locator('#retBanner')).toContainText('כבר עברו');
    await expect(page.locator('#retBanner')).toContainText('האירועים שבחרתם נשמרו');
    await expect(page.locator('[data-trip-count]')).toHaveText('1');
    await page.click('#retBanner [data-act="continue-trip"]');
    await expect(page.locator('#view-trip')).toBeVisible();
  });

  test('tabs are real tabs with roving focus and arrow keys; Back returns to the previous view', async ({ page }) => {
    await searchLondon(page);
    await expect(page.locator('#tab-search')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#tab-search').focus();
    await page.keyboard.press('ArrowLeft');                                               // RTL: the next tab
    await expect(page.locator('#tab-plan')).toBeFocused();
    await expect(page.locator('#tab-plan')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(page.locator('#tab-trip')).toHaveAttribute('aria-selected', 'true');
    await page.goBack();
    await expect(page.locator('#tab-plan')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#view-trip')).toBeHidden();
  });
});
