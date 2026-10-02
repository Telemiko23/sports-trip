const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSample, model, store } = require('./helpers.js');

const M = model();
const S = store();
const cat = M.buildCatalog(loadSample());

function memStorage(initial) {
  const m = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m)
  };
}
const brokenStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };

test('P19 legacy migration: keeps legacy keys byte-identical, writes a backup, builds a v2 trip', () => {
  const legacy = {
    tripIds_v1: JSON.stringify([101, 102, 999999]),
    filterCtx_v1: JSON.stringify({ base: { city: 'London', cityHe: 'לונדון', lat: 51.5074, lng: -0.1278, country: 'England' }, from: '2026-10-09', to: '2026-10-11' }),
    onboarded_v1: '1'
  };
  const st = memStorage(legacy);
  const { state, report } = S.load(st, cat);
  assert.equal(report.migrated, true);
  assert.deepEqual(state.trip.entries.map((e) => e.id), [101, 102, 999999], 'an id missing from the feed is KEPT, not silently erased');
  assert.equal(state.trip.entries[0].snap.title, 'ווסט האם – קווינס פארק ריינג\'רס');
  assert.equal(state.trip.entries[2].snap, null);
  assert.equal(state.context.dest.cityHe, 'לונדון');
  assert.deepEqual([state.context.dates.from, state.context.dates.to], ['2026-10-09', '2026-10-11']);
  assert.equal(state.meta.onboarded, true);
  S.save(st, state);
  const after = st.dump();
  for (const k of Object.keys(legacy)) assert.equal(after[k], legacy[k], k + ' must be untouched');
  const backup = JSON.parse(after.tosport_legacy_backup_v1);
  assert.equal(backup.tripIds_v1, legacy.tripIds_v1);
  assert.equal(backup.filterCtx_v1, legacy.filterCtx_v1);
});

test('migration is idempotent: a second start changes nothing and never rewrites the backup', () => {
  const st = memStorage({ tripIds_v1: JSON.stringify([101]) });
  const first = S.load(st, cat);
  S.save(st, first.state);
  const snapshot = JSON.stringify(st.dump());
  const second = S.load(st, cat);
  assert.equal(second.report.migrated, false);
  assert.deepEqual(second.state.trip.entries.map((e) => e.id), [101]);
  S.save(st, second.state);
  assert.equal(JSON.stringify(st.dump()), snapshot);
});

test('malformed legacy data is reported and preserved in the backup, not erased', () => {
  const st = memStorage({ tripIds_v1: '{not json', filterCtx_v1: '[1,2' });
  const { state, report } = S.load(st, cat);
  assert.ok(report.issues.includes('legacy-trip-malformed') && report.issues.includes('legacy-ctx-malformed'));
  assert.equal(state.trip.entries.length, 0);
  assert.equal(st.dump().tripIds_v1, '{not json');
  assert.equal(JSON.parse(st.dump().tosport_legacy_backup_v1).tripIds_v1, '{not json');
});

test('legacy values are validated field by field (hostile ids / coordinates / dates)', () => {
  const st = memStorage({ tripIds_v1: JSON.stringify([101, '102', -5, 1.5, null, {}, 1e20, 101]), filterCtx_v1: JSON.stringify({ base: { city: 'X', lat: 999, lng: 5 }, from: 'bad', to: '2026-13-40' }) });
  const { state } = S.load(st, cat);
  assert.deepEqual(state.trip.entries.map((e) => e.id), [101]);
  assert.equal(state.context.dest, null);
  assert.equal(state.context.dates, null);
});

test('unavailable storage: the app still starts, flagged, with an empty trip', () => {
  const { state, report } = S.load(brokenStorage, cat);
  assert.equal(state.ui.storageOk, false);
  assert.ok(report.issues.includes('storage-unavailable'));
  assert.equal(S.save(brokenStorage, state), false);
});

test('trip actions: add is idempotent (no duplicates), remove is undoable, lock/exclude behave', () => {
  const st = S.createStore();
  const add = (id) => st.dispatch({ type: 'TRIP_ADD', id, snap: M.snapshotOf(cat.byId[id]) });
  add(101); add(101); add(102);
  assert.equal(st.get().trip.entries.length, 2);
  st.dispatch({ type: 'TRIP_LOCK', id: 102, locked: true });
  st.dispatch({ type: 'TRIP_REMOVE', id: 101 });
  assert.deepEqual(st.get().trip.entries.map((e) => e.id), [102]);
  st.dispatch({ type: 'TRIP_UNDO' });
  assert.deepEqual(st.get().trip.entries.map((e) => e.id), [101, 102]);
  st.dispatch({ type: 'TRIP_EXCLUDE', id: 102 });
  assert.ok(st.get().trip.entries.some((e) => e.id === 102), 'a locked event is never removed by an exclusion');
  st.dispatch({ type: 'TRIP_EXCLUDE', id: 101 });
  assert.deepEqual(st.get().trip.entries.map((e) => e.id), [102]);
  assert.deepEqual(st.get().trip.excluded, [102, 101]);
  st.dispatch({ type: 'TRIP_ADD', id: 101, snap: null });
  assert.deepEqual(st.get().trip.excluded, [102], 'adding an excluded event by hand lifts its exclusion');
});

test('clearing and replacing the whole trip are explicit and recoverable', () => {
  const st = S.createStore();
  [101, 102, 104].forEach((id) => st.dispatch({ type: 'TRIP_ADD', id, snap: null }));
  st.dispatch({ type: 'TRIP_CLEAR' });
  assert.equal(st.get().trip.entries.length, 0);
  st.dispatch({ type: 'TRIP_UNDO' });
  assert.equal(st.get().trip.entries.length, 3);
  st.dispatch({ type: 'TRIP_REPLACE', trip: { entries: [{ id: 105 }] } });
  assert.deepEqual(st.get().trip.entries.map((e) => e.id), [105]);
  st.dispatch({ type: 'TRIP_UNDO' });
  assert.equal(st.get().trip.entries.length, 3);
  st.dispatch({ type: 'TRIP_MERGE', entries: [{ id: 101 }, { id: 106 }] });
  assert.deepEqual(st.get().trip.entries.map((e) => e.id), [101, 102, 104, 106], 'merge deduplicates and removes nothing');
});

test('P08 draft contract: edits do not touch applied filters until applied; cancel discards; reset keeps destination/dates/trip', () => {
  const st = S.createStore();
  st.dispatch({ type: 'CONTEXT_COMMIT', dest: { kind: 'country', country: 'England', countryHe: 'אנגליה' }, dates: { mode: 'fixed', from: '2026-10-09', to: '2026-10-11' } });
  st.dispatch({ type: 'TRIP_ADD', id: 101, snap: null });
  st.dispatch({ type: 'DRAFT_OPEN' });
  st.dispatch({ type: 'DRAFT_SET', excludedComps: { 40: true } });
  assert.deepEqual(st.get().filters.excludedComps, {});
  st.dispatch({ type: 'DRAFT_CANCEL' });
  assert.equal(st.get().ui.draft, null);
  assert.deepEqual(st.get().filters.excludedComps, {});
  st.dispatch({ type: 'DRAFT_OPEN' });
  st.dispatch({ type: 'DRAFT_SET', excludedComps: { 40: true }, radiusKm: 80 });
  st.dispatch({ type: 'DRAFT_APPLY' });
  assert.deepEqual(st.get().filters.excludedComps, { 40: true });
  assert.equal(st.get().context.radiusKm, 80);
  st.dispatch({ type: 'SPORTS_SET', sports: ['football'] });
  st.dispatch({ type: 'FILTERS_RESET' });
  assert.equal(st.get().filters.sports, null);
  assert.deepEqual(st.get().filters.excludedComps, {});
  assert.equal(st.get().context.dest.country, 'England');
  assert.equal(st.get().context.dates.from, '2026-10-09');
  assert.equal(st.get().trip.entries.length, 1);
});

test('P21 export/import: round trip works; hostile or oversized input is rejected, never executed', () => {
  const st = S.createStore();
  st.dispatch({ type: 'CONTEXT_COMMIT', dest: { kind: 'city', city: 'London', cityHe: 'לונדון', country: 'England', lat: 51.5, lng: -0.1 }, dates: { mode: 'fixed', from: '2026-10-09', to: '2026-10-11' } });
  [101, 102].forEach((id) => st.dispatch({ type: 'TRIP_ADD', id, snap: M.snapshotOf(cat.byId[id]) }));
  const doc = S.exportDoc(st.get(), '2.0.0');
  assert.equal(doc.legacy.tripIds_v1.length, 2);
  assert.equal(doc.legacy.filterCtx_v1.from, '2026-10-09');
  const back = S.parseImport(JSON.stringify(doc));
  assert.equal(back.ok, true);
  assert.deepEqual(back.doc.trip.entries.map((e) => e.id), [101, 102]);
  assert.equal(S.parseImport('not json').error, 'not-json');
  assert.equal(S.parseImport('x'.repeat(S.LIMITS.maxImportBytes + 1)).error, 'too-large');
  assert.equal(S.parseImport(JSON.stringify({ format: 'other', version: 2 })).error, 'wrong-format');
  assert.equal(S.parseImport(JSON.stringify({ format: 'tosport-trip-backup', version: 99 })).error, 'unsupported-version');
  const hostile = S.parseImport(JSON.stringify({ format: 'tosport-trip-backup', version: 2,
    trip: { entries: [{ id: 101, snap: { title: '<img src=x onerror=alert(1)>'.repeat(50), city: 'x' } }, { id: '__proto__' }, { id: 1e30 }], origin: 'a'.repeat(5000) },
    context: { dest: { kind: 'city', city: 'x', lat: 'NaN', lng: 5 }, dates: { from: '2026-10-11', to: '2026-10-09' } } }));
  assert.equal(hostile.ok, true);
  assert.deepEqual(hostile.doc.trip.entries.map((e) => e.id), [101]);
  assert.ok(hostile.doc.trip.entries[0].snap.title.length <= 200);
  assert.ok(hostile.doc.trip.origin.length <= 200);
  assert.equal(hostile.doc.context.dest, null);
  assert.equal(hostile.doc.context.dates, null);
});

test('trip dates action keeps departure on/after arrival', () => {
  const st = S.createStore();
  st.dispatch({ type: 'TRIP_DATES', arrival: '2026-10-12', departure: '2026-10-09' });
  assert.deepEqual([st.get().trip.arrival, st.get().trip.departure], ['2026-10-12', '2026-10-12']);
  st.dispatch({ type: 'TRIP_DATES', arrival: 'garbage', departure: null });
  assert.deepEqual([st.get().trip.arrival, st.get().trip.departure], [null, null]);
});
