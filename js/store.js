/* ToSport v2 - one explicit state layer: a serializable state, ONE reducer that owns every transition, subscribers,
   and storage (versioned, additive, with a legacy migration that never touches the old keys).
   Pure/injectable (storage is passed in), so it runs in Node tests. Exposes window.ToSport.store. */
(function (root, factory) {
  var api = factory(typeof require === 'function' && typeof module === 'object' ? require('./model.js') : root.ToSport.model);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ToSport = root.ToSport || {}; root.ToSport.store = api; }
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  var KEYS = {
    context: 'tosport_v2_context', trip: 'tosport_v2_trip', backup: 'tosport_legacy_backup_v1',
    legacyTrip: 'tripIds_v1', legacyCtx: 'filterCtx_v1', legacyOnboarded: 'onboarded_v1'
  };
  var DEFAULT_ORIGIN = 'Ben Gurion International Airport – Tel Aviv, ישראל (TLV)';
  var LIMITS = { maxEntries: 400, maxExcluded: 400, maxImportBytes: 400000, maxStr: 200 };
  var PACES = ['single', 'balanced', 'sport'];

  function initialState() {
    return {
      v: 2,
      context: { dest: null, dates: null, radiusKm: 150, browse: false },
      filters: { sports: null, excludedComps: {}, excludedWeekdays: {} },
      prefs: { pace: 'balanced', lodging: 'single' },
      trip: { entries: [], excluded: [], arrival: null, departure: null, origin: DEFAULT_ORIGIN },
      meta: { onboarded: false, lastVisit: null },
      ui: { tab: 'search', mode: 'list', day: 'all', pin: null, draft: null, undo: null, storageOk: true, notice: null }
    };
  }

  /* ---------- small validators (everything that comes from storage or an import is untrusted) ---------- */
  function isId(x) { return typeof x === 'number' && isFinite(x) && Math.floor(x) === x && x > 0 && x < 1e15; }
  function str(x, n) { return typeof x === 'string' ? x.slice(0, n || LIMITS.maxStr) : ''; }
  function num(x, lo, hi) { return typeof x === 'number' && isFinite(x) && x >= lo && x <= hi ? x : null; }
  function iso(x) { return typeof x === 'string' && M.isISODate(x) ? x : null; }
  function cleanDest(d) {
    if (!d || typeof d !== 'object') return null;
    if (d.kind === 'city') {
      var lat = num(d.lat, -90, 90), lng = num(d.lng, -180, 180);
      if (lat == null || lng == null || !str(d.city)) return null;
      return { kind: 'city', key: str(d.key), city: str(d.city), cityHe: str(d.cityHe) || str(d.city), country: str(d.country), countryHe: str(d.countryHe), lat: lat, lng: lng };
    }
    if (d.kind === 'country' && str(d.country)) return { kind: 'country', key: str(d.key), country: str(d.country), countryHe: str(d.countryHe) || str(d.country) };
    return null;
  }
  function cleanDates(d) {
    if (!d || typeof d !== 'object') return null;
    var from = iso(d.from), to = iso(d.to);
    if (!from || !to || to < from) return null;
    if (d.mode === 'flexible') {
      var days = num(d.days, 1, 30);
      return { mode: 'flexible', from: from, to: to, days: days ? Math.round(days) : 3, weekdays: Array.isArray(d.weekdays) ? d.weekdays.filter(function (w) { return w === 0 || (w >= 1 && w <= 6); }).slice(0, 7) : null };
    }
    return { mode: 'fixed', from: from, to: to };
  }
  function cleanSnap(s, id) {
    if (!s || typeof s !== 'object') return null;
    return { id: id, title: str(s.title), dt: str(s.dt, 20), date: iso(s.date) || str(s.dt, 10), city: str(s.city), cityHe: str(s.cityHe), venue: s.venue ? str(s.venue) : null,
      compHe: str(s.compHe), sportId: str(s.sportId, 30) || 'unknown', timeKnown: !!s.timeKnown, kind: s.kind === 'event' ? 'event' : 'match' };
  }
  function cleanEntries(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (e) {
      var id = e && typeof e === 'object' ? e.id : e;
      if (!isId(id) || seen[id] || out.length >= LIMITS.maxEntries) return;
      seen[id] = 1;
      out.push({ id: id, locked: !!(e && e.locked), addedAt: e && typeof e.addedAt === 'string' ? str(e.addedAt, 30) : null, snap: e && typeof e === 'object' ? cleanSnap(e.snap, id) : null });
    });
    return out;
  }
  function cleanIdList(list) {
    var seen = {}, out = [];
    (Array.isArray(list) ? list : []).forEach(function (x) { if (isId(x) && !seen[x] && out.length < LIMITS.maxExcluded) { seen[x] = 1; out.push(x); } });
    return out;
  }
  function cleanFilters(f) {
    var out = { sports: null, excludedComps: {}, excludedWeekdays: {} };
    if (!f || typeof f !== 'object') return out;
    if (Array.isArray(f.sports) && f.sports.length) out.sports = f.sports.map(function (s) { return str(s, 30); }).filter(function (s) { return M.SPORT_REGISTRY[s]; }).slice(0, 10);
    if (out.sports && !out.sports.length) out.sports = null;
    if (f.excludedComps && typeof f.excludedComps === 'object') Object.keys(f.excludedComps).slice(0, 300).forEach(function (k) { if (f.excludedComps[k] && /^\d{1,12}$/.test(k)) out.excludedComps[k] = true; });
    if (f.excludedWeekdays && typeof f.excludedWeekdays === 'object') [0, 1, 2, 3, 4, 5, 6].forEach(function (d) { if (f.excludedWeekdays[d]) out.excludedWeekdays[d] = true; });
    return out;
  }
  function cleanTrip(t) {
    t = t && typeof t === 'object' ? t : {};
    return { entries: cleanEntries(t.entries), excluded: cleanIdList(t.excluded), arrival: iso(t.arrival), departure: iso(t.departure), origin: str(t.origin) || DEFAULT_ORIGIN };
  }
  function cleanContext(c) {
    c = c && typeof c === 'object' ? c : {};
    var r = num(c.radiusKm, 5, 2000);
    return { dest: cleanDest(c.dest), dates: cleanDates(c.dates), radiusKm: r == null ? 150 : Math.round(r), browse: !!c.browse };
  }
  function cleanPrefs(p) {
    p = p && typeof p === 'object' ? p : {};
    return { pace: PACES.indexOf(p.pace) !== -1 ? p.pace : 'balanced', lodging: p.lodging === 'multi' ? 'multi' : 'single' };
  }

  /* ---------- the reducer: every state transition lives here ---------- */
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function reduce(state, a) {
    var s = copy(state), t = s.trip, ui = s.ui;
    switch (a.type) {
      case 'HYDRATE':
        s.context = cleanContext(a.context); s.filters = cleanFilters(a.filters); s.prefs = cleanPrefs(a.prefs); s.trip = cleanTrip(a.trip);
        s.meta = { onboarded: !!(a.meta && a.meta.onboarded), lastVisit: a.meta && iso(a.meta.lastVisit) || null };
        ui.storageOk = a.storageOk !== false;
        return s;
      case 'CONTEXT_COMMIT':
        s.context.dest = cleanDest(a.dest); s.context.dates = cleanDates(a.dates);
        s.context.browse = !s.context.dest && !!a.browse;
        if (a.radiusKm != null) { var rr = num(a.radiusKm, 5, 2000); if (rr != null) s.context.radiusKm = Math.round(rr); }
        s.meta.onboarded = true; ui.day = 'all'; ui.pin = null; ui.notice = null;
        return s;
      case 'CONTEXT_RADIUS': { var r2 = num(a.km, 5, 2000); if (r2 != null) s.context.radiusKm = Math.round(r2); ui.pin = null; return s; }
      case 'SPORTS_SET':
        s.filters.sports = Array.isArray(a.sports) && a.sports.length ? a.sports.filter(function (x) { return M.SPORT_REGISTRY[x]; }) : null;
        if (s.filters.sports && !s.filters.sports.length) s.filters.sports = null;
        return s;
      case 'FILTERS_SET': s.filters = cleanFilters(a.filters); return s;
      case 'FILTERS_RESET': s.filters = cleanFilters(null); ui.draft = null; return s;   // optional filters only: never the destination, dates or trip
      case 'DRAFT_OPEN': ui.draft = { excludedComps: copy(s.filters.excludedComps), excludedWeekdays: copy(s.filters.excludedWeekdays), radiusKm: s.context.radiusKm }; return s;
      case 'DRAFT_SET': if (ui.draft) { if (a.excludedComps) ui.draft.excludedComps = a.excludedComps; if (a.excludedWeekdays) ui.draft.excludedWeekdays = a.excludedWeekdays; if (a.radiusKm != null) { var rd = num(a.radiusKm, 5, 2000); if (rd != null) ui.draft.radiusKm = Math.round(rd); } } return s;
      case 'DRAFT_CANCEL': ui.draft = null; return s;
      case 'DRAFT_APPLY': if (ui.draft) { s.filters.excludedComps = ui.draft.excludedComps; s.filters.excludedWeekdays = ui.draft.excludedWeekdays; s.context.radiusKm = ui.draft.radiusKm; ui.draft = null; ui.pin = null; } return s;
      case 'VIEW':
        ['tab', 'mode', 'day', 'pin'].forEach(function (k) { if (a[k] !== undefined) ui[k] = a[k]; });
        return s;
      case 'TRIP_ADD': {
        if (!isId(a.id) || t.entries.some(function (e) { return e.id === a.id; }) || t.entries.length >= LIMITS.maxEntries) return s;
        t.entries.push({ id: a.id, locked: false, addedAt: a.at || null, snap: cleanSnap(a.snap, a.id) });
        t.excluded = t.excluded.filter(function (x) { return x !== a.id; });
        return s;
      }
      case 'TRIP_REMOVE': {
        var i = -1; t.entries.forEach(function (e, k) { if (e.id === a.id) i = k; });
        if (i === -1) return s;
        ui.undo = { kind: 'remove', entry: t.entries[i], index: i };
        t.entries.splice(i, 1);
        return s;
      }
      case 'TRIP_UNDO': {
        var u = ui.undo; ui.undo = null;
        if (!u) return s;
        if (u.kind === 'remove' && !t.entries.some(function (e) { return e.id === u.entry.id; })) t.entries.splice(Math.min(u.index, t.entries.length), 0, u.entry);
        if (u.kind === 'clear' || u.kind === 'replace') { t.entries = cleanEntries(u.entries); t.excluded = cleanIdList(u.excluded); if (u.kind === 'replace') { t.arrival = iso(u.arrival); t.departure = iso(u.departure); } }
        return s;
      }
      case 'UNDO_DISMISS': ui.undo = null; return s;
      case 'TRIP_LOCK': t.entries.forEach(function (e) { if (e.id === a.id) e.locked = !!a.locked; }); return s;
      case 'TRIP_EXCLUDE':
        if (isId(a.id) && t.excluded.indexOf(a.id) === -1 && t.excluded.length < LIMITS.maxExcluded) t.excluded.push(a.id);
        t.entries = t.entries.filter(function (e) { return e.id !== a.id || e.locked; });
        return s;
      case 'TRIP_UNEXCLUDE': t.excluded = t.excluded.filter(function (x) { return x !== a.id; }); return s;
      case 'TRIP_CLEAR': ui.undo = { kind: 'clear', entries: t.entries, excluded: t.excluded }; t.entries = []; t.excluded = []; t.arrival = null; t.departure = null; return s;
      case 'TRIP_MERGE': {                      // add without duplicates; never removes anything
        var have = {}; t.entries.forEach(function (e) { have[e.id] = 1; });
        cleanEntries(a.entries).forEach(function (e) { if (!have[e.id] && t.entries.length < LIMITS.maxEntries) { t.entries.push(e); have[e.id] = 1; } });
        return s;
      }
      case 'TRIP_REPLACE': {                    // explicit and recoverable: the previous trip becomes the undo snapshot
        ui.undo = { kind: 'replace', entries: t.entries, excluded: t.excluded, arrival: t.arrival, departure: t.departure };
        var nt = cleanTrip(a.trip); t.entries = nt.entries; t.excluded = nt.excluded; t.arrival = nt.arrival; t.departure = nt.departure;
        return s;
      }
      case 'TRIP_DATES': t.arrival = iso(a.arrival); t.departure = iso(a.departure); if (t.arrival && t.departure && t.departure < t.arrival) t.departure = t.arrival; return s;
      case 'TRIP_ORIGIN': t.origin = str(a.origin) || DEFAULT_ORIGIN; return s;
      case 'TRIP_ACK': t.entries.forEach(function (e) { if (e.id === a.id) e.snap = cleanSnap(a.snap, a.id); }); return s;
      case 'IMPORT_APPLY': {                    // a validated backup: replace everything (undoable) or merge the trip only
        var d = a.doc || {};
        if (a.mode === 'replace') {
          ui.undo = { kind: 'clear', entries: t.entries, excluded: t.excluded };
          s.context = cleanContext(d.context); s.filters = cleanFilters(d.filters); s.prefs = cleanPrefs(d.prefs); s.trip = cleanTrip(d.trip); s.meta.onboarded = true;
          return s;
        }
        var have2 = {}; t.entries.forEach(function (e) { have2[e.id] = 1; });
        cleanEntries(d.trip && d.trip.entries).forEach(function (e) { if (!have2[e.id] && t.entries.length < LIMITS.maxEntries) { t.entries.push(e); have2[e.id] = 1; } });
        return s;
      }
      case 'PREFS': s.prefs = cleanPrefs({ pace: a.pace !== undefined ? a.pace : s.prefs.pace, lodging: a.lodging !== undefined ? a.lodging : s.prefs.lodging }); return s;
      case 'NOTICE': ui.notice = a.notice || null; return s;
      case 'META': if (a.onboarded !== undefined) s.meta.onboarded = !!a.onboarded; if (a.lastVisit !== undefined) s.meta.lastVisit = iso(a.lastVisit); return s;
      default: return s;
    }
  }

  function createStore(initial) {
    var state = initial || initialState(), subs = [];
    return {
      get: function () { return state; },
      dispatch: function (a) { var prev = state; state = reduce(state, a); subs.slice().forEach(function (fn) { fn(state, prev, a); }); return state; },
      subscribe: function (fn) { subs.push(fn); return function () { subs = subs.filter(function (x) { return x !== fn; }); }; }
    };
  }

  /* ---------- persistence ---------- */
  function readJSON(storage, key) {
    var raw = null;
    try { raw = storage.getItem(key); } catch (e) { return { ok: false, unavailable: true, raw: null, value: null }; }
    if (raw == null) return { ok: true, raw: null, value: null };
    try { return { ok: true, raw: raw, value: JSON.parse(raw) }; } catch (e) { return { ok: false, malformed: true, raw: raw, value: null }; }
  }
  function writeRaw(storage, key, value) { try { storage.setItem(key, value); return true; } catch (e) { return false; } }

  // Legacy (v1.x) -> v2. Idempotent; never modifies or deletes a legacy key; a backup of the original strings is kept.
  function migrateLegacy(storage, cat) {
    var report = { migrated: false, ids: 0, ctx: false, issues: [], backedUp: false };
    var lt = readJSON(storage, KEYS.legacyTrip), lc = readJSON(storage, KEYS.legacyCtx), lo = null;
    try { lo = storage.getItem(KEYS.legacyOnboarded); } catch (e) { }
    if (lt.unavailable) { report.issues.push('storage-unavailable'); return { trip: null, context: null, onboarded: false, report: report }; }
    var has = lt.raw != null || lc.raw != null || lo != null;
    if (!has) return { trip: null, context: null, onboarded: false, report: report };
    var existingBackup = null; try { existingBackup = storage.getItem(KEYS.backup); } catch (e) { }
    if (existingBackup == null) {
      report.backedUp = writeRaw(storage, KEYS.backup, JSON.stringify({ at: new Date().toISOString(), tripIds_v1: lt.raw, filterCtx_v1: lc.raw, onboarded_v1: lo }));
    }
    var entries = [];
    if (lt.malformed) report.issues.push('legacy-trip-malformed');
    else if (Array.isArray(lt.value)) {
      lt.value.forEach(function (id) {
        if (!isId(id)) { report.issues.push('legacy-trip-bad-id'); return; }
        var ev = cat && cat.byId ? cat.byId[id] : null;
        entries.push({ id: id, locked: false, addedAt: null, snap: ev ? M.snapshotOf(ev) : null });
      });
    } else if (lt.value != null) report.issues.push('legacy-trip-not-array');
    entries = cleanEntries(entries); report.ids = entries.length;
    var context = null;
    if (lc.malformed) report.issues.push('legacy-ctx-malformed');
    else if (lc.value && typeof lc.value === 'object') {
      var b = lc.value.base, dest = null;
      if (b && typeof b === 'object' && num(b.lat, -90, 90) != null && num(b.lng, -180, 180) != null && str(b.city)) {
        dest = { kind: 'city', key: str(b.city) + '|' + str(b.country), city: str(b.city), cityHe: str(b.cityHe) || str(b.city), country: str(b.country), countryHe: M.countryHe(str(b.country)), lat: b.lat, lng: b.lng };
      }
      var dates = cleanDates({ mode: 'fixed', from: lc.value.from, to: lc.value.to });
      if (dest || dates) { context = { dest: dest, dates: dates, radiusKm: 150, browse: false }; report.ctx = true; }
    }
    report.migrated = true;
    return { trip: { entries: entries, excluded: [], arrival: null, departure: null, origin: DEFAULT_ORIGIN }, context: context, onboarded: lo === '1' || !!context || entries.length > 0, report: report };
  }

  function load(storage, cat) {
    var base = initialState(), report = { migrated: false, issues: [], storageOk: true };
    var c = readJSON(storage, KEYS.context), t = readJSON(storage, KEYS.trip);
    if (c.unavailable || t.unavailable) { return { state: reduce(base, { type: 'HYDRATE', storageOk: false }), report: { migrated: false, issues: ['storage-unavailable'], storageOk: false } }; }
    if (c.malformed) report.issues.push('v2-context-malformed');
    if (t.malformed) report.issues.push('v2-trip-malformed');
    var hydrate = { type: 'HYDRATE', storageOk: true };
    if (t.value || c.value) {
      var cv = c.value || {}, tv = t.value && t.value.trip ? t.value.trip : (t.value || {});
      hydrate.context = cv.context; hydrate.filters = cv.filters; hydrate.prefs = cv.prefs; hydrate.meta = cv.meta; hydrate.trip = tv;
    } else {
      var m = migrateLegacy(storage, cat);
      report.migrated = m.report.migrated; report.issues = report.issues.concat(m.report.issues); report.legacy = m.report;
      hydrate.context = m.context; hydrate.trip = m.trip; hydrate.meta = { onboarded: m.onboarded };
    }
    return { state: reduce(base, hydrate), report: report };
  }

  function save(storage, state) {
    var ok1 = writeRaw(storage, KEYS.context, JSON.stringify({ v: 2, context: state.context, filters: state.filters, prefs: state.prefs, meta: state.meta }));
    var ok2 = writeRaw(storage, KEYS.trip, JSON.stringify({ v: 2, trip: state.trip }));
    return ok1 && ok2;
  }

  /* ---------- export / import (local backup; versioned) ---------- */
  function exportDoc(state, appVersion) {
    var legacyIds = state.trip.entries.map(function (e) { return e.id; });
    var ctx = state.context, legacyCtx = null;
    if (ctx.dest && ctx.dest.kind === 'city' || ctx.dates) {
      legacyCtx = { base: ctx.dest && ctx.dest.kind === 'city' ? { city: ctx.dest.city, cityHe: ctx.dest.cityHe, lat: ctx.dest.lat, lng: ctx.dest.lng, country: ctx.dest.country } : null,
        from: ctx.dates ? ctx.dates.from : null, to: ctx.dates ? ctx.dates.to : null };
    }
    return { format: 'tosport-trip-backup', version: 2, exportedAt: new Date().toISOString(), app: { version: appVersion || '' },
      context: state.context, filters: state.filters, prefs: state.prefs, trip: state.trip,
      legacy: { note: 'Only event selections and filters can be restored into the v1 UI (see ROLLBACK.md).', tripIds_v1: legacyIds, filterCtx_v1: legacyCtx } };
  }
  // returns {ok:true, doc:{context,filters,prefs,trip}} or {ok:false, error:'code'}; never throws on hostile input
  function parseImport(text) {
    if (typeof text !== 'string') return { ok: false, error: 'not-text' };
    if (text.length > LIMITS.maxImportBytes) return { ok: false, error: 'too-large' };
    var d; try { d = JSON.parse(text); } catch (e) { return { ok: false, error: 'not-json' }; }
    if (!d || typeof d !== 'object' || d.format !== 'tosport-trip-backup') return { ok: false, error: 'wrong-format' };
    if (d.version !== 2) return { ok: false, error: 'unsupported-version' };
    var trip = cleanTrip(d.trip);
    if (!trip.entries.length && !(d.trip && Array.isArray(d.trip.entries) && d.trip.entries.length === 0)) return { ok: false, error: 'no-trip' };
    return { ok: true, doc: { context: cleanContext(d.context), filters: cleanFilters(d.filters), prefs: cleanPrefs(d.prefs), trip: trip } };
  }

  return {
    KEYS: KEYS, DEFAULT_ORIGIN: DEFAULT_ORIGIN, LIMITS: LIMITS, PACES: PACES, initialState: initialState, reduce: reduce, createStore: createStore,
    load: load, save: save, migrateLegacy: migrateLegacy, exportDoc: exportDoc, parseImport: parseImport,
    clean: { dest: cleanDest, dates: cleanDates, entries: cleanEntries, trip: cleanTrip, filters: cleanFilters, context: cleanContext }
  };
});
