// Shared helpers for the end-to-end suite. The app is loaded exactly as in production (classic scripts, no build) but with
//  - the deterministic sample feed (tests/fixtures/sample-data.js) served in place of fixtures.js,
//  - a fixed clock (2026-10-02, 10:00 Jerusalem) so "today"/past-date logic never depends on the real date,
//  - Leaflet served from node_modules (same bytes as the CDN build, so SRI still verifies) so the map works offline,
//  - analytics/tile hosts blocked (local analytics is off anyway).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const SAMPLE = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'sample-data.js'), 'utf8');
export const NOW = new Date('2026-10-02T10:00:00+03:00');

export async function prepare(page, opts = {}) {
  await page.clock.setFixedTime(NOW);
  const feed = opts.feed || SAMPLE;
  await page.route('**/fixtures.js', (r) => r.fulfill({ contentType: 'application/javascript', body: feed }));
  await page.route('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', (r) => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(ROOT, 'node_modules/leaflet/dist/leaflet.js')) }));
  await page.route('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', (r) => r.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(ROOT, 'node_modules/leaflet/dist/leaflet.css')) }));
  await page.route(/tile\.openstreetmap\.org|google-analytics|googletagmanager|fonts\.(googleapis|gstatic)/, (r) => (opts.allowNet ? r.continue() : r.abort()));
  if (opts.storage) {
    await page.addInitScript((kv) => {
      if (sessionStorage.getItem('__seeded')) return;
      sessionStorage.setItem('__seeded', '1');
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
    }, opts.storage);
  }
  if (opts.brokenStorage) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    });
  }
}

export async function open(page, opts = {}) {
  await prepare(page, opts);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.errors = errors;
  await page.goto('/index.html');
  return errors;
}

// first visit: type the destination, pick it from the list with the keyboard, set exact dates, submit
export async function firstSearch(page, { dest = 'לונדון', from = '2026-10-09', to = '2026-10-11', submit = 'click' } = {}) {
  await page.fill('#obDest', dest);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.fill('#obFrom', from);
  await page.fill('#obTo', to);
  if (submit === 'enter') await page.press('#obTo', 'Enter'); else await page.click('#obGo');
  await page.waitForSelector('#list .ev, #list .empty');
}

// the planner feed: three London weekends (Oct 9-11, Nov 20-22), Manchester (Dec), Brighton, and a French club across the Channel
export const PLAN_FEED = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'plan-data.js'), 'utf8');
export async function toPlan(page, opts = {}) {
  await open(page, { feed: PLAN_FEED });
  await firstSearch(page, opts);
  await page.click('#tab-plan');
  await page.waitForSelector('#plResults .plan-card, #plResults .empty-note');
}

export function titles(page) { return page.locator('#list .ev .title-btn, #list .ev-group .title-text').allInnerTexts(); }
export async function tripIds(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('tosport_v2_trip') || '{"trip":{"entries":[]}}').trip.entries.map((e) => e.id)); }
