const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSample, model } = require('./helpers.js');

const M = model();
const cat = M.buildCatalog(loadSample());
const tes = (ids) => M.tripEvents({ entries: ids.map((id) => ({ id, snap: M.snapshotOf(cat.byId[id]) })) }, cat);

test('dates are local calendar days: no UTC shift, DST-safe day math', () => {
  assert.equal(M.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(M.addDays('2026-03-28', 1), '2026-03-29');
  assert.equal(M.diffDays('2026-03-27', '2026-03-30'), 3);
  assert.equal(M.diffDays('2026-10-24', '2026-10-26'), 2);
  assert.equal(M.weekday('2026-10-09'), 5);
  assert.ok(M.isISODate('2026-02-28'));
  assert.ok(!M.isISODate('2026-02-30'));
  assert.ok(!M.isISODate('9/10/2026'));
  assert.equal(M.fmtDate('2026-10-09'), '9 באוקטובר');
  assert.equal(M.fmtRange('2026-10-09', '2026-10-11'), '9–11 באוקטובר');
});

test('multi-day events expand to stable per-day ids; singles keep their id', () => {
  const days = cat.events.filter((e) => e.parentId === 1000000001);
  assert.equal(days.length, 6);
  assert.deepEqual(days.map((d) => d.id), [100000000101, 100000000102, 100000000103, 100000000104, 100000000105, 100000000106]);
  assert.equal(days[0].dayTotal, 6);
  assert.equal(days[0].dayNo, 1);
  assert.equal(days[0].sessions.length, 1);
  assert.equal(days[2].sessions, null);
  const darts = cat.byId[1000000002];
  assert.equal(darts.parentId, null);
  assert.equal(darts.sportId, 'darts');
});

test('sport identity: legacy football only for records without a sport; unknown never becomes football', () => {
  assert.equal(M.sportIdOf(undefined), 'football');
  assert.equal(M.sportIdOf('f1'), 'motorsport');
  assert.equal(M.sportIdOf('basketball'), 'unknown');
  const bad = M.buildCatalog({ fixtures: [{ id: 5, sport: 'basketball', dt: '2026-10-01T00:00', title: 'X', comp_id: 9, comp: 'C', country: 'Spain', city: 'Madrid', lat: 40, lng: -3 }] });
  assert.equal(bad.events[0].sportId, 'unknown');
  assert.equal(bad.events[0].kind, 'event');
});

test('destinations: exact/alias match resolves; a prefix is only a suggestion; unknown stays unknown', () => {
  const idx = M.buildDestinations(cat);
  assert.equal(M.matchDestination(idx, 'לונדון').status, 'resolved');
  assert.equal(M.matchDestination(idx, 'London').status, 'resolved');
  assert.equal(M.matchDestination(idx, 'לונדון (אנגליה)').dest.kind, 'city');
  assert.equal(M.matchDestination(idx, 'אנגליה').dest.kind, 'country');
  const partial = M.matchDestination(idx, 'לונ');
  assert.equal(partial.status, 'unresolved');
  assert.ok(partial.options.length >= 1);
  assert.equal(M.matchDestination(idx, 'zzzznotacity').status, 'unknown');
  assert.equal(M.matchDestination(idx, '   ').status, 'empty');
});

test('query: fixed dates are hard boundaries; city radius vs country scope are not interchangeable', () => {
  const idx = M.buildDestinations(cat);
  const london = M.matchDestination(idx, 'London').dest;
  const r = M.query(cat, { dest: london, dates: { from: '2026-10-09', to: '2026-10-11' }, radiusKm: 150 });
  const ids = r.events.map((e) => e.id);
  assert.ok(ids.includes(101) && ids.includes(102) && ids.includes(104));
  assert.ok(!ids.includes(105), 'Manchester is outside 150 km of London');
  assert.ok(ids.includes(106), 'Boulogne is ~149 km straight-line from London: inside 150 km (a channel crossing the planner must not call easy)');
  const near = M.query(cat, { dest: london, dates: { from: '2026-10-09', to: '2026-10-11' }, radiusKm: 100 });
  assert.ok(!near.events.some((e) => e.id === 106) && near.events.some((e) => e.id === 101));
  assert.ok(!ids.includes(108), 'a November fixture is outside the fixed dates');
  const wide = M.query(cat, { dest: london, dates: { from: '2026-10-09', to: '2026-10-11' }, radiusKm: 300 });
  assert.ok(wide.events.some((e) => e.id === 105));
  const eng = M.matchDestination(idx, 'England').dest;
  const country = M.query(cat, { dest: eng, dates: { from: '2026-10-09', to: '2026-10-11' } });
  assert.ok(country.events.some((e) => e.id === 105) && !country.events.some((e) => e.id === 106));
  const onlyTennis = M.query(cat, { dest: london, dates: { from: '2026-10-09', to: '2026-10-11' }, sports: ['tennis'] });
  assert.ok(onlyTennis.events.length > 0 && onlyTennis.events.every((e) => e.sportId === 'tennis'));
});

test('groupResults: only parents with 3+ selectable days collapse into a group; days stay individually selectable', () => {
  const idx = M.buildDestinations(cat);
  const london = M.matchDestination(idx, 'London').dest;
  const wide = M.query(cat, { dest: london, dates: { from: '2026-10-09', to: '2026-10-14' }, radiusKm: 150 });
  const groups = M.groupResults(wide.events).flatMap((d) => d.items.filter((i) => i.type === 'group'));
  assert.equal(groups.length, 1);
  assert.equal(groups[0].days.length, 6);
  const narrow = M.query(cat, { dest: london, dates: { from: '2026-10-09', to: '2026-10-10' }, radiusKm: 150 });
  assert.equal(M.groupResults(narrow.events).flatMap((d) => d.items.filter((i) => i.type === 'group')).length, 0);
});

test('trip dates: explicit > fixed search range > derived (labelled); fixed dates never gain a night', () => {
  const three = tes([101, 102, 104]);
  const fixed = M.tripDates({}, three, { from: '2026-10-09', to: '2026-10-11' });
  assert.deepEqual([fixed.arrival, fixed.departure, fixed.source, fixed.nights, fixed.eventDays], ['2026-10-09', '2026-10-11', 'search', 2, 3]);
  const derived = M.tripDates({}, three, null);
  assert.deepEqual([derived.arrival, derived.departure, derived.source, derived.nights], ['2026-10-09', '2026-10-12', 'derived', 3]);
  const explicit = M.tripDates({ arrival: '2026-10-08', departure: '2026-10-12' }, three, { from: '2026-10-09', to: '2026-10-11' });
  assert.deepEqual([explicit.source, explicit.nights], ['explicit', 4]);
});

test('P13 travel links: flight dates and hotel nights agree, same-city and different-city', () => {
  const same = tes([101, 102, 104]);
  const d1 = M.tripDates({}, same, { from: '2026-10-09', to: '2026-10-11' });
  const l1 = M.travelLinks(M.tripStays(same, d1), d1, 'TLV');
  assert.equal(l1.flights.length, 1);
  assert.equal(l1.flights[0].kind, 'return');
  assert.ok(l1.flights[0].url.includes(encodeURIComponent('on 2026-10-09 through 2026-10-11')));
  assert.equal(l1.hotels.length, 1);
  assert.ok(l1.hotels[0].url.includes('checkin=2026-10-09') && l1.hotels[0].url.includes('checkout=2026-10-11'));
  assert.equal(l1.hotels[0].nights, 2);
  const two = tes([101, 105]);
  const d2 = M.tripDates({}, two, { from: '2026-10-09', to: '2026-10-11' });
  const l2 = M.travelLinks(M.tripStays(two, d2), d2, 'TLV');
  assert.deepEqual(l2.flights.map((f) => f.kind), ['oneway-out', 'oneway-back']);
  assert.equal(l2.hotels.length, 2);
  assert.equal(l2.hotels[0].checkout, l2.hotels[1].checkin);
  assert.equal(l2.hotels[1].checkout, d2.departure);
});

test('pairNote: honest about conflicts and unverified transfers (no fabricated feasibility)', () => {
  const e = (id) => cat.byId[id];
  assert.equal(M.pairNote(e(102), e(103)).kind, 'same-day-close');
  assert.equal(M.pairNote(e(101), e(106)).kind, 'transfer-unverified');
  const sameDay = M.pairNote(e(102), e(106));
  assert.deepEqual([sameDay.kind, sameDay.transfer], ['same-day-transfer', 'unverified']);
  assert.equal(M.pairNote(e(104), e(107)).kind, 'same-day-unknown-time');
  assert.equal(M.transferKind(e(104), e(106)), 'unverified');
  assert.equal(M.transferKind(e(101), e(102)), 'local');
});

test('placeInfo: unknown venue is explicit, a city point is approximate, provisional multi-city keeps provenance', () => {
  assert.equal(M.placeInfo(cat.byId[1000000002]).status, 'approximate');
  assert.equal(M.placeInfo(cat.byId[101]).status, 'verified');
  const uc = cat.events.find((e) => e.parentId === 1000000003);
  const p = M.placeInfo(uc);
  assert.ok(p.provisional);
  assert.equal(p.locations.length, 2);
  assert.equal(p.locations[1].city, 'Perth');
});

test('safeUrl and esc: untrusted provider fields cannot become script or unsafe links', () => {
  assert.equal(M.safeUrl('javascript:alert(1)'), null);
  assert.equal(M.safeUrl('data:text/html,<script>'), null);
  assert.equal(M.safeUrl('https://example.org/x'), 'https://example.org/x');
  assert.equal(M.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  const evil = M.buildCatalog({ fixtures: [{ id: 9, dt: '2026-10-01T20:00', home: '<b>x</b>', away: 'y', comp_id: 1, comp: 'C', country: 'Spain', city: 'Madrid', lat: 40, lng: -3, web_url: 'javascript:alert(1)' }] });
  assert.equal(evil.events[0].officialUrl, null);
});
