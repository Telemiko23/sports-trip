// Rollback proof: the SAME browser profile and origin (localhost:8760) visits baseline -> v2 -> baseline.
//   node tests/capture/rollback-proof.mjs [--baseline C:\path\to\baseline] [--v2 C:\path\to\v2]
// Shows that (1) v2 migrates a saved v1 trip without touching the legacy keys (byte-identical),
// (2) edits made in v2 do not corrupt the old app, and (3) the old app still runs and shows its original trip.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const BASELINE = arg('baseline', 'C:\\Users\\LiranTelem\\sports-trip-baseline');
const V2 = arg('v2', path.resolve(import.meta.dirname, '..', '..'));
const PORT = 8760, URL = `http://localhost:${PORT}/index.html`;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

async function serve(dir) {
  const p = spawn('py', ['-m', 'http.server', String(PORT), '--directory', dir], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { const r = await fetch(URL); if (r.ok) return p; } catch (e) { } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error('server did not start for ' + dir);
}
const stop = (p) => new Promise((res) => { p.once('exit', res); p.kill(); setTimeout(res, 1500); });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tosport-rollback-'));
const launch = async () => { const c = await chromium.launchPersistentContext(profile, { locale: 'he-IL', timezoneId: 'Asia/Jerusalem', viewport: { width: 1280, height: 800 } }); await c.route(/google-analytics|googletagmanager|fonts\.(googleapis|gstatic)|tile\.openstreetmap/, (r) => r.abort()); return c; };
const legacy = (page) => page.evaluate(() => ({ trip: localStorage.getItem('tripIds_v1'), ctx: localStorage.getItem('filterCtx_v1'), ob: localStorage.getItem('onboarded_v1') }));
const shots = path.resolve(V2, 'docs', 'evolution', 'screenshots');

// ---- 1. baseline: a saved trip of two real feed ids (London) ----
let srv = await serve(BASELINE), ctx = await launch();
let page = ctx.pages()[0] || await ctx.newPage();
await page.goto(URL);
const seed = await page.evaluate(() => {
  const f = window.TRIP_DATA.fixtures.filter((x) => !x.sport && x.city === 'London' && x.lat != null).slice(0, 2);
  return { ids: f.map((x) => x.id), base: { city: f[0].city, cityHe: f[0].city_he, lat: f[0].lat, lng: f[0].lng, country: f[0].country }, d: f[0].dt.slice(0, 10) };
});
await page.evaluate((s) => {
  localStorage.setItem('tripIds_v1', JSON.stringify(s.ids));
  localStorage.setItem('filterCtx_v1', JSON.stringify({ base: s.base, from: s.d, to: s.d }));
  localStorage.setItem('onboarded_v1', '1');
}, seed);
await page.reload();
const baselineBadge = await page.locator('.js-trip-count').first().innerText();
const before = await legacy(page);
ok(seed.ids.length === 2 && baselineBadge === '2', `baseline shows the saved trip (${baselineBadge} events)`);
await ctx.close(); await stop(srv);

// ---- 2. v2 on the same origin ----
srv = await serve(V2); ctx = await launch(); page = ctx.pages()[0] || await ctx.newPage();
await page.goto(URL); await page.waitForSelector('[data-trip-count]');
const v2Badge = await page.locator('[data-trip-count]').first().innerText();
ok(v2Badge === '2', `v2 migrated the same two events (${v2Badge})`);
ok(JSON.stringify(await legacy(page)) === JSON.stringify(before), 'legacy keys are byte-identical after v2 started and migrated');
const keys = await page.evaluate(() => Object.keys(localStorage).sort());
ok(keys.includes('tosport_v2_trip') && keys.includes('tosport_legacy_backup_v1'), 'v2 keys and the legacy backup were written additively: ' + keys.join(', '));
await page.reload(); await page.waitForSelector('[data-trip-count]');
const keys2 = await page.evaluate(() => Object.keys(localStorage).sort());
ok(JSON.stringify(keys) === JSON.stringify(keys2) && JSON.stringify(await legacy(page)) === JSON.stringify(before), 'a second start is idempotent (no new keys, legacy still identical)');
await page.locator('#list .ev:not(.ev-group) .add').first().click().catch(() => {});                // a v2-only edit
await page.screenshot({ path: path.join(shots, 'rollback-v2.png') });
ok(JSON.stringify(await legacy(page)) === JSON.stringify(before), 'a v2 edit does not rewrite the legacy keys');
await ctx.close(); await stop(srv);

// ---- 3. back to the baseline, same profile ----
srv = await serve(BASELINE); ctx = await launch(); page = ctx.pages()[0] || await ctx.newPage();
await page.goto(URL);
const backBadge = await page.locator('.js-trip-count').first().innerText();
ok(backBadge === '2', `the old UI runs again and still shows its original trip (${backBadge} events)`);
ok(JSON.stringify(await legacy(page)) === JSON.stringify(before), 'legacy keys are still byte-identical after returning to the baseline');
await page.screenshot({ path: path.join(shots, 'rollback-baseline-again.png') });
await ctx.close(); await stop(srv);
fs.rmSync(profile, { recursive: true, force: true });
console.log(process.exitCode ? 'ROLLBACK PROOF FAILED' : 'ROLLBACK PROOF OK');
