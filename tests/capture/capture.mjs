// Screenshot/behavior capture for the evolution work (development tooling only - not part of the site).
//   node tests/capture/capture.mjs --ui baseline --url http://localhost:8741 --out docs/evolution/screenshots/baseline
// The baseline scenario drives the v1.17.0 UI; a v2 scenario is added next to it when the new UI exists.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const UI = arg('ui', 'baseline'), URL = arg('url', 'http://localhost:8741'), OUT = arg('out', 'docs/evolution/screenshots/baseline');
fs.mkdirSync(OUT, { recursive: true });
const VIEWS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } };
const notes = [];
const note = (s) => { notes.push(s); console.log(s); };

async function baselineScenario(page, view) {
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${view}-${name}.png`), fullPage: false });
  await page.goto(URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await shot('01-first-visit');
  // destination + fixed dates, typed like a user and submitted with Enter
  await page.fill('#obFrom', '2026-10-09');
  await page.fill('#obTo', '2026-10-11');
  await page.fill('#obBase', 'לונדון');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#list .match');
  note(`[${view}] results after onboarding: ${await page.locator('#summary').innerText()}`);
  await shot('02-results');
  // add the first three listed events (fresh locator each time: the list re-renders after every add)
  for (let i = 0; i < 3; i++) await page.locator('#list .match .add[aria-pressed="false"]').first().click();
  note(`[${view}] trip count after 3 adds: ${await page.locator('.js-trip-count').first().innerText()}`);
  // the trip: dedicated screen on mobile, always-visible panel on desktop
  if (view === 'mobile') await page.click('#bottomNav [data-tab="trip"]');
  await shot('03-trip');
  if (view === 'mobile') await page.click('#bottomNav [data-tab="discover"]');
  // planning: pasted-style free text
  await page.click(view === 'mobile' ? '#bottomNav [data-tab="plan"]' : '#tabbar [data-tab="plan"]');
  await page.fill('#smartText', 'סוף שבוע בלונדון באוקטובר עם משחק של ארסנל');
  await page.press('#smartText', 'Enter');
  await page.waitForTimeout(300);
  note(`[${view}] plan understood: ${await page.locator('#smartUnderstood').innerText()}`);
  await shot('04-plan');
  // map view
  await page.click(view === 'mobile' ? '#bottomNav [data-tab="discover"]' : '#tabbar [data-tab="discover"]');
  await page.click('#discoverToggle [data-mode="map"]');
  await page.waitForTimeout(800);
  await shot('05-map');
  await page.click('#discoverToggle [data-mode="list"]');
  // sessions: widen the window to a multi-day event that has a session table
  await page.evaluate(() => { const f = document.getElementById('from'), t = document.getElementById('to'); f.value = '2026-10-01'; f.dispatchEvent(new Event('change', { bubbles: true })); t.value = '2026-12-31'; t.dispatchEvent(new Event('change', { bubbles: true })); });
  const detail = page.locator('#list .detail-btn').first();
  if (await detail.count()) { await detail.click(); await page.waitForTimeout(200); await shot('06-session-dialog'); await page.keyboard.press('Escape'); }
  const storage = await page.evaluate(() => ({ tripIds_v1: localStorage.getItem('tripIds_v1'), filterCtx_v1: localStorage.getItem('filterCtx_v1'), onboarded_v1: localStorage.getItem('onboarded_v1') }));
  fs.writeFileSync(path.join(OUT, `${view}-storage.json`), JSON.stringify(storage, null, 2));
  note(`[${view}] storage keys written: ${Object.keys(storage).join(', ')}`);
}

const browser = await chromium.launch();
for (const [view, vp] of Object.entries(VIEWS)) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  if (UI === 'baseline') await baselineScenario(page, view);
  note(`[${view}] page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'capture-notes.txt'), notes.join('\n') + '\n');
