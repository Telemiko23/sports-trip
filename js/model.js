/* ToSport v2 - domain model: pure functions only (no DOM, no storage, no network), so they can be unit-tested
   in Node and reused by the planner/tickets/UI. Loaded as a classic script; exposes window.ToSport.model. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ToSport = root.ToSport || {}; root.ToSport.model = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- text safety ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  // only http(s) URLs are ever linked out; anything else (javascript:, data:, relative junk) becomes null
  function safeUrl(u) {
    if (typeof u !== 'string') return null;
    var s = u.trim();
    if (!/^https?:\/\//i.test(s) || s.length > 2000) return null;
    return s;
  }

  /* ---------- calendar dates (local calendar days, never UTC instants) ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // noon, so a DST change can never move the calendar day
  function parseDay(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); }
  function addDays(s, n) { var d = parseDay(s); d.setDate(d.getDate() + n); return isoOf(d); }
  function diffDays(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
  function weekday(s) { return parseDay(s).getDay(); }
  function isISODate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && isoOf(parseDay(s)) === s; }
  function todayISO(now) { return isoOf(now || new Date()); }
  function eachDay(from, to) { var out = []; for (var d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d); return out; }
  function monthEnd(ym) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return ym + '-' + pad(new Date(y, m, 0).getDate()); }

  var HE_COUNTRY = {
    England: 'אנגליה', Spain: 'ספרד', Germany: 'גרמניה', France: 'צרפת', Netherlands: 'הולנד', Italy: 'איטליה', Poland: 'פולין',
    Europe: 'אירופה (בין־לאומי)', Portugal: 'פורטוגל', Ukraine: 'אוקראינה', Belgium: 'בלגיה', Austria: 'אוסטריה',
    Switzerland: 'שוויץ', Turkey: 'טורקיה', Greece: 'יוון', Czechia: "צ'כיה", Denmark: 'דנמרק', Norway: 'נורווגיה',
    Sweden: 'שוודיה', Serbia: 'סרביה', Croatia: 'קרואטיה', Slovakia: 'סלובקיה', Hungary: 'הונגריה', Romania: 'רומניה',
    Bulgaria: 'בולגריה', Scotland: 'סקוטלנד', Ireland: 'אירלנד', Cyprus: 'קפריסין', Israel: 'ישראל',
    Azerbaijan: "אזרבייג'ן", Georgia: 'גאורגיה', Kazakhstan: 'קזחסטן',
    Armenia: 'ארמניה', 'Bosnia and Herzegovina': 'בוסניה והרצגובינה', Latvia: 'לטביה', Lithuania: 'ליטא',
    Albania: 'אלבניה', Andorra: 'אנדורה', Belarus: 'בלארוס', Estonia: 'אסטוניה', 'Faroe Islands': 'איי פרו',
    Finland: 'פינלנד', Gibraltar: 'גיברלטר', Iceland: 'איסלנד', Kosovo: 'קוסובו', Liechtenstein: 'ליכטנשטיין',
    Luxembourg: 'לוקסמבורג', Malta: 'מלטה', Moldova: 'מולדובה', Monaco: 'מונקו', Montenegro: 'מונטנגרו',
    'North Macedonia': 'צפון מקדוניה', Russia: 'רוסיה', 'San Marino': 'סן מרינו', Slovenia: 'סלובניה',
    Wales: 'ויילס', 'Northern Ireland': 'צפון אירלנד',
    'Formula 1': 'פורמולה 1', Tennis: 'טניס', Darts: 'דארטס',
    Singapore: 'סינגפור', China: 'סין', Japan: 'יפן', Malaysia: 'מלזיה', 'United States': 'ארצות הברית', Mexico: 'מקסיקו',
    Brazil: 'ברזיל', Qatar: 'קטאר', 'United Arab Emirates': 'איחוד האמירויות', Australia: 'אוסטרליה', 'United Kingdom': 'הממלכה המאוחדת'
  };
  function countryHe(c) { return HE_COUNTRY[c] || c || ''; }
  function destKey(country) { return country === 'United Kingdom' ? 'England' : country; }

  /* ---------- geography ---------- */
  function km(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function hasPos(f) { return f.lat != null && f.lng != null; }
  // land masses that are NOT connected by road/rail to continental Europe: a short straight-line distance
  // across one of these is not an easy local transfer (e.g. London -> northern France).
  var LANDMASS = { England: 'gb', Scotland: 'gb', Wales: 'gb', 'United Kingdom': 'gb', Ireland: 'ie', 'Northern Ireland': 'ie',
    Cyprus: 'cy', Malta: 'mt', Iceland: 'is', 'Faroe Islands': 'fo', Japan: 'jp', Singapore: 'sg', Australia: 'au',
    'United States': 'us', Mexico: 'mx', Brazil: 'br', China: 'cn', Malaysia: 'my', Qatar: 'qa', 'United Arab Emirates': 'ae', Israel: 'il' };
  function landmass(country) { return LANDMASS[country] || 'eu'; }
  // 'local' (same city / very close) · 'regional' (same landmass, moderate distance) · 'unverified' (water/long/unknown)
  function transferKind(a, b) {
    if (!hasPos(a) || !hasPos(b)) return 'unverified';
    var d = km(a, b);
    if (d <= 25) return 'local';
    if (landmass(a.country) !== landmass(b.country)) return 'unverified';
    return d <= 150 ? 'regional' : 'unverified';
  }

  /* ---------- sport identity registry (canonical ids; see MULTISPORT.md) ---------- */
  var SPORT_REGISTRY = {
    football: { he: 'כדורגל', en: 'Football', order: 1,
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.5 2.5-1.3 4h-4.4L8.5 10z"/><path d="M12 3v4.5M4.8 8.6L8.5 10M19.2 8.6L15.5 10M7.3 19l1.5-4.5M16.7 19l-1.5-4.5"/>' },
    motorsport: { he: 'ספורט מוטורי', en: 'Motorsport', order: 2, icon: '<path d="M6 21V4"/><path d="M6 4.5h12l-3 3.5 3 3.5H6"/>' },
    tennis: { he: 'טניס', en: 'Tennis', order: 3,
      icon: '<circle cx="12" cy="12" r="9"/><path d="M6.5 4.8C9 8 9 16 6.5 19.2M17.5 4.8c-2.5 3.2-2.5 11.2 0 14.4"/>' },
    darts: { he: 'דארטס', en: 'Darts', order: 4, icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>' },
    unknown: { he: 'ענף לא מסווג', en: 'Sport unspecified', order: 99, icon: '<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/>' }
  };
  // raw provider/competition sport code -> canonical id (a record with no `sport` at all is the legacy football dataset)
  var SPORT_CATEGORY = { f1: 'motorsport' };
  function sportIdOf(raw) {
    if (raw == null || raw === '') return 'football';
    var id = SPORT_CATEGORY[raw] || raw;
    return SPORT_REGISTRY[id] ? id : 'unknown';
  }
  function sportLabelHtml(sportId) {
    var s = SPORT_REGISTRY[sportId] || SPORT_REGISTRY.unknown;
    return '<span class="sport-label"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + s.icon + '</svg>' + esc(s.he) + '</span>';
  }

  /* ---------- catalog: the rolling feed -> selectable occurrences ---------- */
  // One selectable occurrence per match, and one per DAY of a multi-day event (id = eventId*100 + dayNo, as before,
  // so previously saved ids keep working). The parent event stays reachable through `parentId`.
  function expandRow(r) {
    var s = String(r.dt).slice(0, 10), e = r.date_to || s;
    var legacyFootball = r.sport == null || r.sport === '';
    var sportId = sportIdOf(r.sport);
    var isEvent = !legacyFootball && sportId !== 'football';
    var base = {
      sportId: sportId, rawSport: r.sport || null, kind: isEvent ? 'event' : 'match', status: r.status || null,
      comp: r.comp || '', compHe: r.comp_he || r.comp || '', compId: r.comp_id, round: r.round || null,
      country: r.country || '', city: r.city || '', cityHe: r.city_he || r.city || '',
      lat: r.lat == null ? null : r.lat, lng: r.lng == null ? null : r.lng,
      venue: r.venue || null, venueLat: r.venue_lat == null ? null : r.venue_lat, venueLng: r.venue_lng == null ? null : r.venue_lng,
      officialUrl: safeUrl(r.web_url), flag: r.flag && /^[a-z]{2}(-[a-z]{3})?$/.test(r.flag) ? r.flag : null,
      home: r.home || null, away: r.away || null, homeHe: r.home_he || r.home || null, awayHe: r.away_he || r.away || null,
      homeLogo: r.home_logo || null, awayLogo: r.away_logo || null,
      locations: Array.isArray(r.locs) ? r.locs : null, locationProvisional: !!r.loc_provisional,
      ticketsUrl: safeUrl(r.tickets_url)
    };
    base.destKey = destKey(base.country);
    if (!isEvent) {
      base.id = r.id; base.parentId = null; base.dayNo = null; base.dayTotal = null;
      base.dt = r.dt; base.date = s; base.endDate = s;
      base.timeKnown = r.status !== 'TBD' && /T\d\d:\d\d/.test(r.dt);
      base.hhmm = base.timeKnown ? String(r.dt).slice(11, 16) : null;
      base.title = base.homeHe + ' – ' + base.awayHe; base.titleEn = (base.home || '') + ' - ' + (base.away || '');
      base.sessions = null; base.sessionsNote = null;
      return [base];
    }
    var total = diffDays(s, e) + 1, out = [], n = 0;
    for (var d = s; d <= e && n < 60; d = addDays(d, 1)) {
      n++;
      var c = {}; for (var k in base) c[k] = base[k];
      var multi = total > 1;
      c.id = multi ? r.id * 100 + n : r.id; c.parentId = multi ? r.id : null; c.dayNo = multi ? n : null; c.dayTotal = multi ? total : null;
      c.dt = d + 'T00:00'; c.date = d; c.endDate = d; c.timeKnown = false; c.hhmm = null;
      var t = r.title_he || r.title || ''; c.title = multi ? t + ' - יום ' + n : t; c.titleEn = (r.title || '') + (multi ? ' - Day ' + n : '');
      c.parentTitle = t; c.parentFrom = s; c.parentTo = e;
      c.sessions = r.sessions && r.sessions[d] ? r.sessions[d] : null; c.sessionsNote = r.sessions_note || null;
      out.push(c);
    }
    return out;
  }

  function buildCatalog(DATA) {
    var rows = (DATA && Array.isArray(DATA.fixtures)) ? DATA.fixtures : [];
    var events = [];
    rows.forEach(function (r) { if (r && r.dt && r.id != null) events = events.concat(expandRow(r)); });
    events.sort(function (a, b) { return a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : (a.id < b.id ? -1 : 1); });
    var byId = {}, comps = [], compById = {};
    events.forEach(function (f) { byId[f.id] = f; });
    (DATA.competitions && DATA.competitions.length ? DATA.competitions : []).forEach(function (c) {
      var o = { id: c.id, label: c.label, labelHe: c.label_he || c.label, country: c.country, sportId: sportIdOf(c.sport), logo: c.logo || null };
      comps.push(o); compById[c.id] = o;
    });
    events.forEach(function (f) { if (!compById[f.compId]) { var o = { id: f.compId, label: f.comp, labelHe: f.compHe, country: f.country, sportId: f.sportId, logo: null }; comps.push(o); compById[f.compId] = o; } });
    var first = events.length ? events[0].date : null, last = events.length ? events[events.length - 1].date : null;
    var lastFootball = events.reduce(function (m, f) { return f.kind === 'match' && f.date > m ? f.date : m; }, '');
    return { events: events, byId: byId, comps: comps, compById: compById, generated: DATA && DATA.generated || null, first: first, last: last, lastFootball: lastFootball };
  }

  /* ---------- destinations: the cities/countries the data can actually resolve ---------- */
  function normText(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[\u0591-\u05C7]/g, '').replace(/[׳’`´]/g, "'").replace(/[״“”]/g, '"').replace(/\s+/g, ' ').trim();
  }
  function buildDestinations(cat) {
    var cities = {}, countries = {};
    cat.events.forEach(function (f) {
      var dk = f.destKey;
      if (dk && dk !== 'Europe') { var c = countries[dk] || (countries[dk] = { n: 0 }); c.n++; }
      if (f.city && hasPos(f)) {
        var key = f.city + '|' + dk;
        var x = cities[key] || (cities[key] = { kind: 'city', key: key, city: f.city, cityHe: f.cityHe || f.city, country: dk, lat: f.lat, lng: f.lng, n: 0 });
        x.n++;
      }
    });
    var out = [];
    Object.keys(cities).forEach(function (k) {
      var c = cities[k], ch = countryHe(c.country);
      out.push({ kind: 'city', key: c.key, label: c.cityHe + ' (' + ch + ')', labelHe: c.cityHe, labelEn: c.city, country: c.country, countryHe: ch,
        lat: c.lat, lng: c.lng, n: c.n, search: normText([c.cityHe, c.city, ch, c.country].join(' ')),
        exact: [normText(c.cityHe), normText(c.city), normText(c.cityHe + ' (' + ch + ')'), normText(c.city + ' (' + c.country + ')')] });
    });
    Object.keys(countries).forEach(function (k) {
      var ch = countryHe(k);
      out.push({ kind: 'country', key: k, label: ch + ' - כל המדינה', labelHe: ch, labelEn: k, country: k, countryHe: ch, n: countries[k].n,
        search: normText(ch + ' ' + k), exact: [normText(ch), normText(k)] });
    });
    out.sort(function (a, b) { return a.kind === b.kind ? (a.labelHe < b.labelHe ? -1 : 1) : (a.kind === 'city' ? -1 : 1); });
    return out;
  }
  // exact / alias match only - a prefix is a SUGGESTION, never silently the destination
  function matchDestination(index, text) {
    var t = normText(text);
    if (!t) return { status: 'empty' };
    var hits = index.filter(function (d) { return d.exact.indexOf(t) !== -1; });
    if (hits.length === 1) return { status: 'resolved', dest: hits[0] };
    if (hits.length > 1) {
      // "London" alone is both a city and (rarely) a country-less duplicate: prefer the city with the most events
      var cities = hits.filter(function (d) { return d.kind === 'city'; }).sort(function (a, b) { return b.n - a.n; });
      if (cities.length === 1 || (cities.length > 1 && cities[0].n > 3 * cities[1].n)) return { status: 'resolved', dest: cities[0] };
      return { status: 'ambiguous', options: hits.slice(0, 8) };
    }
    var sug = suggestDestinations(index, text, 8);
    return { status: sug.length ? 'unresolved' : 'unknown', options: sug };
  }
  function suggestDestinations(index, text, limit) {
    var t = normText(text);
    if (!t) return [];
    var starts = [], inside = [];
    index.forEach(function (d) {
      if (d.exact.some(function (e) { return e.indexOf(t) === 0; })) starts.push(d);
      else if (d.search.indexOf(t) !== -1) inside.push(d);
    });
    var byN = function (a, b) { return b.n - a.n; };
    return starts.sort(byN).concat(inside.sort(byN)).slice(0, limit || 8);
  }

  /* ---------- search query (the applied context) ---------- */
  // ctx: {dest, dates:{from,to}, radiusKm, sports:null|[ids], excludedComps:{id:true}, excludedWeekdays:{0..6:true}}
  function query(cat, ctx) {
    var from = ctx.dates && ctx.dates.from, to = ctx.dates && ctx.dates.to, noPos = 0;
    var dest = ctx.dest, sports = ctx.sports && ctx.sports.length ? ctx.sports : null;
    var exC = ctx.excludedComps || {}, exW = ctx.excludedWeekdays || {};
    var out = cat.events.filter(function (f) {
      if (from && f.date < from) return false;
      if (to && f.date > to) return false;
      if (sports && sports.indexOf(f.sportId) === -1) return false;
      if (exC[f.compId]) return false;
      if (exW[weekday(f.date)]) return false;
      if (dest && dest.kind === 'city') {
        if (!hasPos(f)) { noPos++; return false; }
        if (km(dest, f) > (ctx.radiusKm || 150)) return false;
      } else if (dest && dest.kind === 'country') {
        if (f.destKey !== dest.country) return false;
      }
      return true;
    });
    return { events: out, noPos: noPos };
  }
  function countBySport(list) { var c = {}; list.forEach(function (f) { c[f.sportId] = (c[f.sportId] || 0) + 1; }); return c; }
  function countByDay(list) { var c = {}; list.forEach(function (f) { c[f.date] = (c[f.date] || 0) + 1; }); return c; }

  // Group a result list for display: days in order; a parent event with 3+ selectable days in the result becomes ONE group
  // placed under its first day (each day stays individually selectable inside the group).
  function groupResults(list) {
    var perParent = {};
    list.forEach(function (f) { if (f.parentId) (perParent[f.parentId] = perParent[f.parentId] || []).push(f); });
    var grouped = {}; Object.keys(perParent).forEach(function (k) { if (perParent[k].length >= 3) grouped[k] = perParent[k]; });
    var days = [], idx = {};
    list.forEach(function (f) {
      var parentGroup = f.parentId && grouped[f.parentId];
      if (parentGroup && parentGroup[0] !== f) return;           // later days are inside the group card
      if (!idx[f.date]) { idx[f.date] = { date: f.date, items: [] }; days.push(idx[f.date]); }
      idx[f.date].items.push(parentGroup ? { type: 'group', parentId: f.parentId, days: parentGroup } : { type: 'event', ev: f });
    });
    return days;
  }

  /* ---------- presentation helpers ---------- */
  var HE_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  var HE_DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  // unambiguous Hebrew date text (never "9/10"): "9 באוקטובר"
  function fmtDate(s) { var d = parseDay(s); return d.getDate() + ' ב' + HE_MONTHS[d.getMonth()]; }
  function fmtDateLong(s) { var d = parseDay(s); return 'יום ' + HE_DAYS_FULL[d.getDay()] + ', ' + fmtDate(s); }
  function fmtRange(a, b) {
    if (a === b) return fmtDate(a);
    var x = parseDay(a), y = parseDay(b);
    if (x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear()) return x.getDate() + '–' + y.getDate() + ' ב' + HE_MONTHS[y.getMonth()];
    return fmtDate(a) + ' – ' + fmtDate(b);
  }
  function eventTimeState(f) {
    if (f.kind === 'event') return f.dayNo ? { state: 'day', label: 'יום ' + f.dayNo + (f.dayTotal ? ' מתוך ' + f.dayTotal : '') } : { state: 'allday', label: null };
    return f.timeKnown ? { state: 'known', label: f.hhmm } : { state: 'unpublished', label: null };
  }
  function placeInfo(f) {
    var pinKnown = f.venueLat != null && f.venueLng != null;
    var mapsUrl = null;
    if (f.venue) mapsUrl = pinKnown ? 'https://www.google.com/maps/search/?api=1&query=' + f.venueLat + ',' + f.venueLng
      : (f.city ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(f.venue + ', ' + f.city) : null);
    return {
      city: f.city, cityHe: f.cityHe, venue: f.venue, venueUrl: mapsUrl,
      status: f.venue ? (pinKnown ? 'verified' : 'venue-only') : (f.city ? 'approximate' : 'unknown'),
      provisional: !!f.locationProvisional, locations: f.locations
    };
  }
  function snapshotOf(f) {
    return { id: f.id, title: f.title, dt: f.dt, date: f.date, city: f.city, cityHe: f.cityHe, venue: f.venue, compHe: f.compHe, sportId: f.sportId, timeKnown: !!f.timeKnown, kind: f.kind };
  }

  /* ---------- the trip: derived facts ---------- */
  // entries: [{id, locked, addedAt, snap}] ; trip: {arrival, departure}; ctx dates: fixed {from,to} or null
  function tripEvents(trip, cat) {
    var out = [];
    (trip.entries || []).forEach(function (e) {
      var ev = cat.byId[e.id] || null;
      out.push({ entry: e, ev: ev, missing: !ev, snap: e.snap || null, changed: ev ? snapshotDiff(e.snap, ev) : null });
    });
    out.sort(function (a, b) {
      var da = a.ev ? a.ev.dt : (a.snap && a.snap.dt) || '9999', db = b.ev ? b.ev.dt : (b.snap && b.snap.dt) || '9999';
      return da < db ? -1 : da > db ? 1 : 0;
    });
    return out;
  }
  function snapshotDiff(snap, ev) {
    if (!snap) return null;
    var diffs = [];
    if (snap.dt && snap.dt !== ev.dt) diffs.push('dt');
    if ((snap.venue || null) !== (ev.venue || null)) diffs.push('venue');
    if ((snap.city || '') !== (ev.city || '')) diffs.push('city');
    return diffs.length ? diffs : null;
  }
  function entryDate(te) { return te.ev ? te.ev.date : (te.snap && te.snap.date) || null; }
  function entryCity(te) { return te.ev ? { city: te.ev.city, cityHe: te.ev.cityHe } : (te.snap ? { city: te.snap.city, cityHe: te.snap.cityHe } : { city: '', cityHe: '' }); }

  // trip dates: explicit (the traveller's own) > the fixed search range > derived from the events (assumption, labelled)
  function tripDates(trip, tes, ctxDates) {
    var days = tes.map(entryDate).filter(Boolean).sort();
    if (!days.length) return { arrival: trip.arrival || (ctxDates && ctxDates.from) || null, departure: trip.departure || (ctxDates && ctxDates.to) || null, source: 'none', eventDays: 0 };
    var first = days[0], last = days[days.length - 1];
    var arrival, departure, source;
    if (trip.arrival && trip.departure) { arrival = trip.arrival; departure = trip.departure; source = 'explicit'; }
    else if (ctxDates && ctxDates.from && ctxDates.to && ctxDates.from <= first && last <= ctxDates.to) { arrival = trip.arrival || ctxDates.from; departure = trip.departure || ctxDates.to; source = trip.arrival || trip.departure ? 'explicit' : 'search'; }
    else { arrival = trip.arrival || first; departure = trip.departure || addDays(last, 1); source = trip.arrival || trip.departure ? 'explicit' : 'derived'; }
    var distinct = {}; days.forEach(function (d) { distinct[d] = 1; });
    return { arrival: arrival, departure: departure, source: source, eventDays: Object.keys(distinct).length,
      nights: Math.max(0, diffDays(arrival, departure)), outside: days.filter(function (d) { return d < arrival || d > departure; }) };
  }

  // consecutive same-city events form one stay; hotel dates follow the trip's arrival/departure
  function tripStays(tes, dates) {
    var stays = [];
    tes.forEach(function (te) {
      var c = entryCity(te), d = entryDate(te);
      if (!c.city || !d) return;
      var last = stays[stays.length - 1];
      if (last && last.city === c.city) { if (d > last.lastEvent) last.lastEvent = d; }
      else stays.push({ city: c.city, cityHe: c.cityHe, firstEvent: d, lastEvent: d, ev: te.ev });
    });
    stays.forEach(function (s, i) {
      s.checkin = i === 0 ? dates.arrival : s.firstEvent;
      s.checkout = i === stays.length - 1 ? dates.departure : stays[i + 1].firstEvent;
      s.nights = Math.max(0, diffDays(s.checkin, s.checkout));
    });
    return stays;
  }
  function flightQuery(text) { return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(text); }
  function travelLinks(stays, dates, originText) {
    var out = { flights: [], hotels: [], notes: [] };
    if (!stays.length || !dates.arrival || !dates.departure) return out;
    var first = stays[0], last = stays[stays.length - 1];
    if (first.city !== last.city) {
      out.flights.push({ kind: 'oneway-out', city: first.cityHe || first.city, date: dates.arrival, url: flightQuery('Flights from ' + originText + ' to ' + first.city + ' on ' + dates.arrival) });
      out.flights.push({ kind: 'oneway-back', city: last.cityHe || last.city, date: dates.departure, url: flightQuery('Flights from ' + last.city + ' to ' + originText + ' on ' + dates.departure) });
    } else {
      out.flights.push({ kind: 'return', city: first.cityHe || first.city, from: dates.arrival, to: dates.departure, url: flightQuery('Flights from ' + originText + ' to ' + first.city + ' on ' + dates.arrival + ' through ' + dates.departure) });
    }
    stays.forEach(function (s) {
      if (s.nights < 1) { out.notes.push({ kind: 'no-nights', city: s.cityHe || s.city }); return; }
      var url = 'https://www.booking.com/searchresults.html?ss=' + encodeURIComponent(s.city) + '&checkin=' + s.checkin + '&checkout=' + s.checkout;
      var ev = s.ev;
      if (ev && ev.venueLat != null && ev.venueLng != null) url += '&latitude=' + ev.venueLat + '&longitude=' + ev.venueLng + '&distance=3000';
      out.hotels.push({ city: s.cityHe || s.city, checkin: s.checkin, checkout: s.checkout, nights: s.nights, url: url });
    });
    return out;
  }

  // notes between two consecutive trip entries: only what affects a decision (no decorative distances)
  function pairNote(prev, cur) {
    if (!prev || !cur) return null;
    var a = prev, b = cur;
    if (a.date === b.date) {
      if (!a.timeKnown || !b.timeKnown) return { kind: 'same-day-unknown-time' };
      var m = function (f) { return Number(f.hhmm.slice(0, 2)) * 60 + Number(f.hhmm.slice(3, 5)); };
      if (Math.abs(m(b) - m(a)) < 180) return { kind: 'same-day-close' };
      var tk = transferKind(a, b);
      return tk === 'local' ? { kind: 'same-day-local' } : { kind: 'same-day-transfer', transfer: tk };
    }
    var tk2 = transferKind(a, b);
    if (tk2 === 'unverified' && a.city !== b.city) return { kind: 'transfer-unverified', from: a.cityHe || a.city, to: b.cityHe || b.city, fromCity: a.city, toCity: b.city };
    return null;
  }
  function directionsUrl(fromCity, toCity) {
    return 'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(fromCity) + '&destination=' + encodeURIComponent(toCity);
  }
  function tripText(tes) {
    return tes.map(function (te) {
      var ev = te.ev, s = te.snap;
      if (!ev) return (s ? s.date : '?') + '  ' + (s ? s.title : '?') + '  (' + (s ? (s.cityHe || s.city) : '') + ') [לא מופיע בעדכון האחרון]';
      var when = ev.kind === 'event' ? ev.date : ev.date + ' ' + (ev.timeKnown ? ev.hhmm : '(שעה לא פורסמה)');
      return when + '  ' + ev.title.replace(' – ', ' - ') + '  (' + (ev.cityHe || 'מיקום עדיין לא ידוע') + ', ' + ev.compHe + ', ' + (SPORT_REGISTRY[ev.sportId] || SPORT_REGISTRY.unknown).he + ')';
    }).join('\n');
  }

  return {
    esc: esc, safeUrl: safeUrl, pad: pad, isoOf: isoOf, parseDay: parseDay, addDays: addDays, diffDays: diffDays, weekday: weekday,
    isISODate: isISODate, todayISO: todayISO, eachDay: eachDay, monthEnd: monthEnd,
    HE_COUNTRY: HE_COUNTRY, countryHe: countryHe, destKey: destKey, km: km, hasPos: hasPos, transferKind: transferKind, landmass: landmass,
    SPORT_REGISTRY: SPORT_REGISTRY, sportIdOf: sportIdOf, sportLabelHtml: sportLabelHtml,
    buildCatalog: buildCatalog, normText: normText, buildDestinations: buildDestinations, matchDestination: matchDestination, suggestDestinations: suggestDestinations,
    query: query, countBySport: countBySport, countByDay: countByDay, groupResults: groupResults,
    HE_DAYS: HE_DAYS, HE_DAYS_FULL: HE_DAYS_FULL, HE_MONTHS: HE_MONTHS, fmtDate: fmtDate, fmtDateLong: fmtDateLong, fmtRange: fmtRange,
    eventTimeState: eventTimeState, placeInfo: placeInfo, snapshotOf: snapshotOf,
    tripEvents: tripEvents, snapshotDiff: snapshotDiff, entryDate: entryDate, entryCity: entryCity, tripDates: tripDates, tripStays: tripStays,
    travelLinks: travelLinks, pairNote: pairNote, directionsUrl: directionsUrl, tripText: tripText
  };
});
