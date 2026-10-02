// After-screenshots of the v2 flows (deterministic sample feeds, fixed clock, MOCK ticket offers - mocks are for this capture only).
//   py -m http.server 8742   then   node tests/capture/v2-shots.mjs [--url http://localhost:8742]
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { prepare, firstSearch, PLAN_FEED, NOW } from '../e2e/helpers.mjs';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('url', 'http://localhost:8742');
const OUT = path.resolve(import.meta.dirname, '..', '..', 'docs', 'evolution', 'screenshots', 'v2');
fs.mkdirSync(OUT, { recursive: true });
const iso = (m) => new Date(NOW.getTime() - m * 60000).toISOString();
const GOOD = { match: 'exact', scope: 'occurrence', quantityBasis: 'per-ticket', feesIncluded: true, currency: 'EUR', url: 'https://www.sportsevents365.com/e/1' };
const OFFERS = { schema: 1, provider: 'sportsevents365', generatedAt: iso(5), ttlMinutes: 60, priceDisplay: true, offers: {
  [Object.keys({}).length]: undefined } };
delete OFFERS.offers.undefined;

const profiles = { desktop: { viewport: { width: 1280, height: 800 } }, mobile: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } };
const browser = await chromium.launch();

for (const [name, p] of Object.entries(profiles)) {
  const ctx = await browser.newContext({ ...p, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
  const page = await ctx.newPage();
  await prepare(page, { feed: PLAN_FEED });
  // offers keyed by occurrence id of the plan feed: resolve ids from the app itself after load
  let offers = null;
  await page.route('**/tickets/offers.json', (r) => (offers ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(offers) }) : r.fulfill({ status: 404, body: '' })));
  const shot = async (label, opts = {}) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, `${name}-${label}.png`), fullPage: !!opts.full }); };

  await page.goto(BASE + '/index.html');
  await shot('01-first-entry');
  await firstSearch(page, { dest: 'לונדון', from: '2026-10-09', to: '2026-10-11' });
  await shot('02-results');
  await page.click('#tab-plan'); await page.waitForSelector('.plan-card');
  await page.locator('#view-plan').scrollIntoViewIfNeeded();
  await shot('03-plan-fixed-proposals', { full: true });
  await page.fill('#plText', 'סוף שבוע בלונדון באוקטובר עם משחק של ארסנל');
  await page.click('#plGo'); await page.waitForSelector('.plan-card');
  await shot('04-plan-flexible-windows', { full: true });
  await page.locator('.plan-card [data-pl="replace"]').first().click();
  await shot('05-plan-replace-preview', { full: true });
  await page.click('[data-pl="replace-close"]');
  await page.locator('.plan-card [data-pl="choose"]').first().click();
  await page.locator('.plan-card [data-pl="add"]').first().click();

  // ticket states: build the mock snapshot from the ids the app actually has
  const ids = await page.evaluate(() => { const c = window.ToSport.app.cat; const f = (s) => c.events.find((e) => e.titleEn.includes(s)).id; return { arsenal: f('Arsenal - Leeds'), west: f('West Ham'), palace: f('Crystal'), mu: f('Man United') }; });
  offers = { schema: 1, provider: 'sportsevents365', generatedAt: iso(5), ttlMinutes: 60, priceDisplay: true, offers: {
    [ids.arsenal]: { ...GOOD, status: 'priced', amount: 61.5, fetchedAt: iso(10) },
    [ids.west]: { ...GOOD, status: 'link-only', fetchedAt: iso(10) },
    [ids.palace]: { ...GOOD, status: 'no-offers', fetchedAt: iso(10) },
    [ids.mu]: { ...GOOD, status: 'priced', amount: 99, fetchedAt: iso(180) } } };
  await page.reload();
  await page.click('#tab-search'); await page.waitForSelector('#list .ev .tix-chip');
  await shot('06-ticket-states-on-cards', { full: true });
  await page.locator('#list .ev', { hasText: 'ארסנל' }).first().locator('.title-btn').click();
  await shot('07-event-detail-priced-mock');
  await page.keyboard.press('Escape');
  await page.click('#tab-trip'); await page.waitForSelector('.tentry');
  await shot('08-trip-populated', { full: true });
  await ctx.close();
}
await browser.close();
console.log('saved to', OUT);
