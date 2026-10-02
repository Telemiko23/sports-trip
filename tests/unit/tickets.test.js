const test = require('node:test');
const assert = require('node:assert/strict');
const { model, tickets, loadSample } = require('./helpers.js');
const M = model(), T = tickets();
const cat = M.buildCatalog(loadSample());
const ev = cat.byId[102];                                    // Arsenal - Leeds
const T0 = Date.parse('2026-10-02T10:00:00Z');
const MIN = 60000;
const good = (o) => Object.assign({ match: 'exact', status: 'priced', scope: 'occurrence', amount: 61.5, currency: 'EUR', quantityBasis: 'per-ticket', feesIncluded: true,
  fetchedAt: new Date(T0).toISOString(), url: 'https://www.sportsevents365.com/event/1?aff=x', externalId: 'E1' }, o || {});
const doc = (offer, extra) => Object.assign({ schema: 1, provider: 'sportsevents365', generatedAt: new Date(T0).toISOString(), ttlMinutes: 60, priceDisplay: true, offers: { 102: offer } }, extra || {});
const state = (offer, now, extra) => T.resolve(ev, doc(offer, extra), now == null ? T0 + MIN : now).state;

test('exact match with a fresh, fully described quote is the only way to a number', () => {
  const r = T.resolve(ev, doc(good()), T0 + MIN);
  assert.equal(r.state, 'priced');
  assert.equal(r.offer.amount, 61.5);
});

test('expiry runs on the CURRENT clock: valid just inside the window, a price-free link just outside - and fetchedAt is never reset', () => {
  assert.equal(state(good(), T0 + 59 * MIN), 'priced');
  const late = T.resolve(ev, doc(good()), T0 + 61 * MIN);
  assert.equal(late.state, 'expired');
  assert.ok(late.url, 'a verified event link is kept');
  T.reset(); T.setDoc(doc(good()));
  T.configure({ now: () => T0 + 61 * MIN });
  const html = T.detailHtml(ev);
  assert.ok(!/61|€/.test(html.replace(/https?:\/\/[^"]+/g, '')), 'no numeric price once expired');
  assert.match(html, /מחיר עדכני אצל הספק/);
  assert.equal(T.chipHtml(ev).includes('€'), false);
  T.reset();
});

test('an offer fetched "in the future" (clock skew or tampering) is not fresh', () => {
  assert.equal(state(good({ fetchedAt: new Date(T0 + 30 * MIN).toISOString() }), T0), 'expired');
  assert.equal(state(good({ fetchedAt: 'not a date' }), T0), 'expired');
});

test('the provider-side expiresAt can only shorten validity', () => {
  assert.equal(state(good({ expiresAt: new Date(T0 + 10 * MIN).toISOString() }), T0 + 20 * MIN), 'expired');
});

test('numeric prices are OFF until the snapshot is activated', () => {
  const r = T.resolve(ev, doc(good(), { priceDisplay: false }), T0 + MIN);
  assert.equal(r.state, 'link'); assert.equal(r.reason, 'prices-off');
  assert.equal(T.resolve(ev, doc(good(), { priceDisplay: undefined }), T0 + MIN).state, 'link');
});

test('unknown fee basis, wrong quantity basis, bad amount or currency, or a non-occurrence scope: link only, never a number', () => {
  [good({ feesIncluded: null }), good({ feesIncluded: undefined }), good({ quantityBasis: 'unknown' }), good({ amount: 0 }), good({ amount: '61' }), good({ amount: Infinity }), good({ currency: 'XXX' }),
    good({ scope: 'pass' }), good({ scope: 'parent-event' }), good({ scope: 'session' }), good({ scope: undefined })].forEach((o) => assert.equal(state(o), 'link', JSON.stringify(o)));
});

test('only exact/reviewed matches count; ambiguous is quarantined and shows nothing that pretends to match', () => {
  assert.equal(state(good({ match: 'fuzzy' })), 'unmatched');
  assert.equal(state(good({ match: undefined })), 'unmatched');
  assert.equal(state(good({ match: 'reviewed' })), 'priced');
  assert.equal(state(good({ match: 'ambiguous' })), 'ambiguous');
  T.reset(); T.setDoc(doc(good({ match: 'ambiguous' })));
  T.configure({ now: () => T0 + MIN });
  assert.equal(T.chipHtml(ev), '');
  assert.ok(!/href=/.test(T.detailHtml(ev)), 'no link for an ambiguous candidate');
  T.reset();
});

test('outbound links: https only, approved host only, no userinfo/lookalike tricks', () => {
  ['http://www.sportsevents365.com/e', 'javascript:alert(1)', 'https://evil.com/', 'https://sportsevents365.com.evil.com/', 'https://evilsportsevents365.com/',
    'https://sportsevents365.com@evil.com/', 'https://evil.com@sportsevents365.com/', '//www.sportsevents365.com/e', '', null, 42].forEach((u) => assert.equal(T.safeOutbound(u), null, String(u)));
  assert.ok(T.safeOutbound('https://www.sportsevents365.com/e?x=1'));
  assert.ok(T.safeOutbound('https://sportsevents365.com/e'));
  assert.equal(state(good({ url: 'https://evil.com/x' })), 'unmatched');             // no safe link and no price rights: nothing
});

test('no-offers is a timestamped statement about the provider only; stale it degrades; never "sold out"', () => {
  assert.equal(state({ match: 'exact', status: 'no-offers', fetchedAt: new Date(T0).toISOString(), url: good().url }), 'none');
  assert.equal(state({ match: 'exact', status: 'no-offers', fetchedAt: new Date(T0).toISOString(), url: good().url }, T0 + 2 * 60 * MIN), 'expired');
  T.reset(); T.setDoc(doc({ match: 'exact', status: 'no-offers', fetchedAt: new Date(T0).toISOString(), url: good().url })); T.configure({ now: () => T0 + MIN });
  const html = T.detailHtml(ev);
  assert.match(html, /אין כרגע הצעות אצל הספק/); assert.doesNotMatch(html, /(?<!לא אומר שהאירוע )אזל|sold out|כרטיסים אחרונים/);
  T.reset();
});

test('a parent-event-only link is not priced for a day, and says to choose the day', () => {
  T.reset(); T.setDoc(doc(good({ scope: 'parent-event', status: 'link-only' })));
  T.configure({ now: () => T0 + MIN });
  const html = T.detailHtml(ev);
  assert.match(html, /בדיקת כרטיסים לאירוע/); assert.match(html, /יש לבחור שם את היום/); assert.ok(!/€/.test(html));
  T.reset();
});

test('rendering: rel=sponsored noopener, disclosure without a "no extra cost" promise, fee basis and timestamp, no urgency language', () => {
  T.reset(); T.setDoc(doc(good({ feesIncluded: false }))); T.configure({ now: () => T0 + MIN });
  const html = T.detailHtml(ev);
  assert.match(html, /rel="sponsored noopener noreferrer"/);
  assert.match(html, /עמלה/); assert.match(html, /תוספות חובה/); assert.match(html, /נבדק ב/);
  assert.doesNotMatch(html + T.disclosureHtml(), /ללא עלות נוספת|אחרונים|הנחה|%|מבצע/);
  assert.match(html, /₪|€|EUR/);
  T.reset();
});

test('amounts are shown without rounding down; currency is never silently converted', () => {
  assert.match(T.money(10.001, 'EUR'), /10\.01/);
  assert.match(T.money(61.5, 'EUR'), /61\.50/);
  assert.doesNotMatch(T.money(61.5, 'EUR'), /₪|\$/);
});

test('the validity window comes from the snapshot, falls back to the configured default, and cannot be stretched by absurd values', () => {
  assert.equal(T.resolve(ev, doc(good(), { ttlMinutes: 5 }), T0 + 6 * MIN).state, 'expired');
  assert.equal(T.resolve(ev, doc(good(), { ttlMinutes: 100000 }), T0 + 61 * MIN).state, 'expired');   // out-of-range: default 60 applies
});

test('nextExpiry tells the page when to re-render; failures and bad files leave the product working without data', async () => {
  T.reset(); T.setDoc(doc(good()));
  assert.equal(T.nextExpiry(T0), T0 + 60 * MIN);
  assert.equal(T.nextExpiry(T0 + 61 * MIN), null);
  T.reset();
  assert.equal(T.setDoc({ schema: 2, offers: {} }), null);
  assert.equal(T.chipHtml(ev), '');
  assert.equal(T.detailHtml(ev), null, 'no data: the dialog keeps its generic text');
  await T.load('x', () => Promise.reject(new Error('offline')));
  assert.deepEqual(T.status(), { loaded: true, failed: true, hasData: false });
  await T.load('x', () => Promise.resolve({ ok: false }));
  assert.equal(T.status().hasData, false);
  T.reset();
});
