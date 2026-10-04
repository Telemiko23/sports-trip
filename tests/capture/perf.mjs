// Performance sanity check on the REAL feed under a throttled mobile profile (4x CPU slowdown + ~Fast 4G).
//   py -m http.server 8750   (in the repo root)   then   node tests/capture/perf.mjs [--url http://localhost:8750]
// Emulation, not a real device: it shows the order of magnitude and catches regressions, nothing more.
import { chromium, devices } from '@playwright/test';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : d; };
const URL = arg('url', 'http://localhost:8750') + '/index.html';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL', timezoneId: 'Asia/Jerusalem' });
await ctx.route(/google-analytics|googletagmanager|fonts\.(googleapis|gstatic)|tile\.openstreetmap/, (r) => r.abort());
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
await page.addInitScript(() => { window.__longTasks = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longTasks.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) { } });

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'load' });
const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
const bytes = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => ({ n: r.name.split('/').pop(), kb: Math.round((r.transferSize || r.encodedBodySize) / 1024) })).sort((a, b) => b.kb - a.kb).slice(0, 6));
await page.waitForSelector('#obDest');
const interactive = Date.now() - t0;

const step = async (label, fn) => { const s = Date.now(); await fn(); const ms = Date.now() - s; console.log(label.padEnd(44), String(ms).padStart(6), 'ms'); return ms; };
await step('first search: London, 9-11 Oct (type+pick+submit)', async () => {
  await page.fill('#obDest', 'לונדון'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  const d = new Date(Date.now() + 14 * 86400000), iso = (x) => x.toISOString().slice(0, 10);
  await page.fill('#obFrom', iso(d)); await page.fill('#obTo', iso(new Date(d.getTime() + 2 * 86400000)));
  await page.click('#obGo'); await page.waitForSelector('#list .ev, #list .empty');
});
await step('plan tab: first proposals', async () => { await page.click('#tab-plan'); await page.waitForSelector('.plan-card, #plResults .empty-note'); });
await step('plan: switch pace to sport', async () => { await page.check('input[name="plPace"][value="sport"]'); await page.waitForTimeout(50); });
await step('plan: flexible month (3 windows)', async () => {
  await page.check('input[name="plMode"][value="flexible"]');
  const opts = await page.$$eval('#plMonth option', (o) => o.map((x) => x.value)); await page.selectOption('#plMonth', opts[1]);
  await page.click('#plGo'); await page.waitForSelector('.plan-card, #plResults .empty-note');
});
await step('search tab: "הצג עוד" (pagination)', async () => { await page.click('#tab-search'); await page.waitForSelector('#list .ev'); });
const pm = await page.evaluate(() => ({ events: window.ToSport.app.cat.events.length, long: window.__longTasks, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }));
console.log(JSON.stringify({ dcl_ms: nav.dcl, load_ms: nav.load, form_interactive_ms: interactive, catalog_events: pm.events, longTasks_ms: pm.long, heap_mb: pm.heap, biggest_resources: bytes }, null, 1));
await browser.close();
