const test = require('node:test');
const assert = require('node:assert/strict');
const { model, planner, loadSample } = require('./helpers.js');
const M = model(), P = planner();

// the feed lives in tests/fixtures/plan-data.js (shared with the Playwright suite)
const fs = require('node:fs'), vm = require('node:vm');
const FEED = (() => { const sb = { window: {} }; vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'fixtures', 'plan-data.js'), 'utf8'), sb); return sb.window.TRIP_DATA; })();
const cat = M.buildCatalog(FEED);
const dests = M.buildDestinations(cat);
const dest = (label) => dests.find((d) => d.labelHe === label);
const london = () => { const d = dest('לונדון'); return { kind: 'city', key: d.key, city: d.labelEn, cityHe: d.labelHe, country: d.country, countryHe: d.countryHe, lat: d.lat, lng: d.lng }; };
const base = (o) => Object.assign({ dest: london(), radiusKm: 150, mode: 'fixed', from: '2026-10-09', to: '2026-10-11', pace: 'balanced', lodging: 'single' }, o);
const ids = (pr) => pr.events.map((e) => e.id);
const byTitle = (s) => cat.events.find((e) => e.titleEn.includes(s)).id;

test('fixed dates are a hard boundary and pace is a target, not a fill-every-day rule', () => {
  const r = P.propose(base(), cat);
  assert.ok(r.proposals.length >= 1);
  r.proposals.forEach((pr) => {
    pr.events.forEach((e) => assert.ok(e.date >= '2026-10-09' && e.date <= '2026-10-11'));
    assert.ok(pr.events.length <= 2, 'balanced target for 3 days is 2');
    assert.ok(pr.freeDays.length >= 1, 'a free day is preserved');
  });
  assert.equal(P.targetCount('balanced', 3), 2);
  assert.equal(P.targetCount('balanced', 7), 4);
  assert.equal(P.targetCount('balanced', 2), 1);
});

test('the three paces have different objectives', () => {
  const single = P.propose(base({ pace: 'single' }), cat), balanced = P.propose(base(), cat), sport = P.propose(base({ pace: 'sport' }), cat);
  single.proposals.forEach((pr) => assert.equal(pr.events.length, 1, 'single: one event per proposal'));
  assert.ok(single.proposals.length >= 2, 'a small shortlist of alternatives');
  assert.ok(Math.max(...sport.proposals.map((p) => p.events.length)) > Math.max(...balanced.proposals.map((p) => p.events.length)), 'sport pace attends more');
  // nothing in any pace puts two events on one day unless both times are known (and far apart) - here the 12:30/12:30 pair never qualifies
  [single, balanced, sport].forEach((r) => r.proposals.forEach((pr) => { const d = pr.events.map((e) => e.date); assert.equal(new Set(d).size, d.length, 'no same-day pair'); }));
});

test('single base keeps everything near one place; multi-city never auto-chains an unverified (water / long) move', () => {
  const single = P.propose(base({ dest: null, lodging: 'single', pace: 'sport' }), cat);
  single.proposals.forEach((pr) => assert.equal(pr.facts.cityChanges, 0));
  const multi = P.propose(base({ dest: null, lodging: 'multi', pace: 'sport' }), cat);
  multi.proposals.forEach((pr) => {
    const cities = pr.events.map((e) => e.city);
    assert.ok(!(cities.includes('Boulogne-sur-Mer') && cities.includes('London')), 'London + Boulogne is a channel crossing: not generated');
    assert.ok(!(cities.includes('Manchester') && cities.includes('London')), 'London + Manchester (~260 km) cannot be established: not generated');
  });
});

test('a city destination never proposes an event across the Channel as its base (unverified transfer), and says how many were skipped', () => {
  const r = P.propose(base({ pace: 'sport', lodging: 'multi', radiusKm: 300 }), cat);
  r.proposals.forEach((pr) => pr.events.forEach((e) => assert.notEqual(e.city, 'Boulogne-sur-Mer')));
  assert.ok(r.unverified >= 1);
});

test('flexible dates: distinct real windows inside the range, with actual dates and exact duration', () => {
  const r = P.propose(base({ mode: 'flexible', from: '2026-10-01', to: '2026-12-31', days: 3 }), cat);
  assert.ok(r.windows.length >= 2 && r.windows.length <= 3);
  const keys = new Set(r.proposals.map((p) => p.key));
  assert.equal(keys.size, r.proposals.length, 'no duplicate event sets');
  r.windows.forEach((w) => {
    assert.equal(M.diffDays(w.window.from, w.window.to) + 1, 3);
    assert.ok(w.window.from >= '2026-10-01' && w.window.to <= '2026-12-31');
    assert.ok(w.best.events.length >= 1);
  });
  for (let i = 1; i < r.windows.length; i++) assert.ok(Math.abs(M.diffDays(r.windows[0].window.from, r.windows[i].window.from)) >= 2, 'windows are not the same trip shifted by a day');
  // a start-weekday anchor (Friday) is honoured
  const fri = P.propose(base({ mode: 'flexible', from: '2026-10-01', to: '2026-12-31', days: 3, startWeekdays: [5] }), cat);
  fri.windows.forEach((w) => assert.equal(M.weekday(w.window.from), 5));
});

test('flexible dates: truthful lack of coverage instead of an invented range', () => {
  assert.equal(P.propose(base({ mode: 'flexible', from: '2026-10-01', to: '2026-10-02', days: 3 }), cat).empty, 'range-too-short');
  assert.equal(P.propose(base({ mode: 'flexible', from: '2026-10-20', to: '2026-11-05', days: 3 }), cat).empty, 'no-events');
  const beyond = P.propose(base({ mode: 'flexible', from: '2027-03-01', to: '2027-03-31', days: 3 }), cat);
  assert.equal(beyond.empty, 'beyond-feed');
  assert.equal(beyond.coverage.last, cat.last);
});

test('a locked event is kept (windows without it are not offered); an unsatisfiable lock is explained, never dropped', () => {
  const west = byTitle('West Ham');
  const fixed = P.propose(base({ locked: [west] }), cat);
  fixed.proposals.forEach((pr) => assert.ok(ids(pr).includes(west)));
  const flex = P.propose(base({ mode: 'flexible', from: '2026-10-01', to: '2026-12-31', days: 3, locked: [west] }), cat);
  flex.windows.forEach((w) => assert.ok(w.window.from <= '2026-10-09' && w.window.to >= '2026-10-09'));
  const stranded = P.propose(base({ from: '2026-10-10', to: '2026-10-11', locked: [west] }), cat);
  assert.ok(stranded.conflicts.some((c) => c.kind === 'locked-outside-window' && c.id === west), 'locked event outside the fixed dates is reported');
  const noWin = P.propose(base({ mode: 'flexible', from: '2026-10-01', to: '2026-12-31', days: 3, locked: [west, byTitle('Man City')] }), cat);
  assert.equal(noWin.empty, 'locked-conflict');
  assert.ok(noWin.conflicts.some((c) => c.kind === 'locked-no-window'));
});

test('excluded events are never reintroduced; lock+exclude is reported', () => {
  const arsenal = byTitle('Arsenal - Leeds');
  const r = P.propose(base({ pace: 'sport', excluded: [arsenal] }), cat);
  r.proposals.forEach((pr) => assert.ok(!ids(pr).includes(arsenal)));
  const c = P.propose(base({ locked: [arsenal], excluded: [arsenal] }), cat);
  assert.ok(c.conflicts.some((x) => x.kind === 'locked-and-excluded'));
});

test('existing trip entries in the window are kept and counted; the proposal adds to them', () => {
  const west = byTitle('West Ham');
  const r = P.propose(base({ fixed: [west] }), cat);
  r.proposals.forEach((pr) => { assert.ok(ids(pr).includes(west)); assert.ok(pr.items.find((i) => i.id === west).inTrip); assert.ok(pr.events.length <= 2); });
});

test('team is a soft preference (and only an actual team); a country name is never a team', () => {
  const teams = P.teamsFromCatalog(cat);
  const p1 = P.parse('סוף שבוע בלונדון באוקטובר עם משחק של ארסנל', { dests, teams, today: new Date(2026, 9, 2) });
  assert.equal(p1.city.labelHe, 'לונדון'); assert.equal(p1.month, 10); assert.equal(p1.weekend, true); assert.equal(p1.days, 3); assert.equal(p1.team.he, 'ארסנל');
  const p2 = P.parse('אנגליה בינואר', { dests, teams: [{ he: 'אנגליה', en: 'England', names: ['אנגליה'] }].concat(teams), today: new Date(2026, 9, 2) });
  assert.equal(p2.team, null, 'no accidental England-team preference');
  assert.equal(p2.country.key, 'England'); assert.equal(p2.month, 1); assert.equal(p2.year, 2027);
  const r = P.propose(base({ pace: 'single', team: p1.team }), cat);
  assert.equal(r.proposals[0].events[0].titleEn, 'Arsenal - Leeds', 'the preferred team match is ranked first, but other proposals remain');
  assert.ok(r.proposals.length > 1);
  assert.ok(r.proposals[0].items[0].team);
});

test('mixed month text: "אמצע-סוף ינואר" is mid AND end of the month', () => {
  const p = P.parse('אמצע-סוף ינואר', { dests, today: new Date(2026, 9, 2) });
  assert.equal(p.part, 'mid-end');
  assert.deepEqual(P.monthWindow(p, '2026-10-02'), { from: '2027-01-11', to: '2027-01-31' });
  assert.equal(P.monthWindow(P.parse('בספטמבר', { dests, today: new Date(2026, 9, 2) }), '2027-10-05'), null);
});

test('competition tier is normalised within the candidate set and unranked sports are neither buried nor floated', () => {
  const list = cat.events.filter((e) => e.date >= '2026-10-09' && e.date <= '2026-10-11');
  const tb = P.tierBonuses(list);
  const pl = list.find((e) => e.comp === 'Premier League'), ch = list.find((e) => e.comp === 'Championship'), l2 = list.find((e) => e.comp === 'Ligue 2'), tennis = list.find((e) => e.sportId === 'tennis'), darts = list.find((e) => e.sportId === 'darts');
  assert.ok(tb[pl.id] > tb[ch.id], 'within football the tier still orders');
  assert.equal(tb[tennis.id], tb[darts.id], 'unranked sports carry no signal and are treated alike');
  assert.ok(tb[tennis.id] > tb[l2.id] && tb[tennis.id] < tb[pl.id], 'a neutral midpoint: not below every football match, not above the top one');
  const only = P.tierBonuses(list.filter((e) => e.sportId === 'tennis'));
  assert.deepEqual([...new Set(Object.values(only))], [P.tierBonuses(list)[tennis.id]], 'same neutral value whatever else is in the set');
});

test('unlocated and provisional-location events are not auto-routed; they are counted instead', () => {
  const sample = M.buildCatalog(loadSample());
  const r = P.propose({ dest: null, mode: 'fixed', from: '2027-01-01', to: '2027-01-03', pace: 'sport', lodging: 'multi', radiusKm: 150 }, sample);
  assert.equal(r.proposals.length, 0);
  assert.equal(r.unlocated > 0, true);
  assert.ok(r.empty);
});

test('alternatives for a slot describe date changes and conflicts before anything is replaced', () => {
  const r = P.propose(base({ pace: 'balanced' }), cat);
  const pr = r.proposals[0], slot = pr.events[0].id;
  const alts = P.alternatives(base(), cat, pr, slot);
  assert.ok(alts.length >= 1);
  alts.forEach((a) => { assert.ok(!pr.events.some((e) => e.id === a.ev.id)); assert.ok('compatible' in a && 'dateChanged' in a && Array.isArray(a.notes)); });
  assert.ok(alts.every((a) => a.ev.id !== slot), 'the slot itself is not an alternative');
});

test('unknown finish time is uncertainty: two generated events never share a day without known, well-separated times', () => {
  const r = P.propose(base({ pace: 'sport', dest: london() }), cat);
  r.proposals.forEach((pr) => {
    const byDate = {}; pr.events.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    Object.values(byDate).filter((l) => l.length > 1).forEach((l) => l.forEach((e) => assert.ok(e.timeKnown)));
  });
});
