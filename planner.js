// ToSport smart planner - pure logic, no DOM (so it can be unit-tested later, see ROADMAP: Playwright).
//
//   Planner.parse(text, ctx)   free Hebrew text -> {country, city, month, part, days, cats}   (rule-based, NOT an LLM)
//   Planner.plan(params, items) -> best trip windows: at most one event a day, sane travel between days
//
// The goal is "try hard to have an event every day" (not every day is possible): each event day is worth
// points, hopping costs points, and a hop is only allowed if the travel time actually fits between the end
// of the previous event and the start of the next one (no "Sunday night in X, Monday morning 150 km away").
(function () {
  'use strict';

  var MONTHS = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8,
    'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 };
  var NUMS = { 'יומיים': 2, 'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4, 'חמישה': 5, 'חמש': 5, 'שישה': 6, 'שש': 6,
    'שבעה': 7, 'שבע': 7, 'שמונה': 8, 'תשעה': 9, 'תשע': 9, 'עשרה': 10, 'עשר': 10 };
  var COUNTRY_ALIASES = { 'בריטניה': 'England', 'הממלכה המאוחדת': 'England', 'ארהב': 'United States', 'אמריקה': 'United States',
    'ארצות הברית': 'United States', 'שווייץ': 'Switzerland', 'הולנד': 'Netherlands', 'דובאי': 'United Arab Emirates',
    'אבו דאבי': 'United Arab Emirates', 'איחוד האמירויות': 'United Arab Emirates', 'צ׳כיה': 'Czechia', 'צכיה': 'Czechia' };
  var CATS = [['football', ['כדורגל', 'כדורגלים']], ['motorsport', ['פורמולה', 'פורמולה 1', 'f1', 'מרוצים', 'מירוצים', 'ספורט מוטורי']],
    ['tennis', ['טניס']], ['darts', ['דארטס', 'חצים']]];

  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function norm(t) { return String(t).toLowerCase().replace(/[׳’`]/g, "'").replace(/[״“”]/g, '"').replace(/\s+/g, ' ').trim(); }
  // a whole word, optionally with one Hebrew prefix letter (ב/ל/מ/ה/ו): "באנגליה" matches "אנגליה"
  function wordRe(w) { return new RegExp('(^|[\\s,.;:!?()\\-"\'])[בלמהו]?' + esc(norm(w)) + '(?=$|[\\s,.;:!?()\\-"\'])'); }
  function has(text, w) { return wordRe(w).test(text); }

  function parse(raw, ctx) {
    var t = norm(raw), out = { country: null, city: null, month: null, year: null, part: 'all', days: null, cats: [], assumed: [] };
    var today = ctx.today || new Date();

    // city first (more specific than a country), longest name first so "New York" beats "York"
    var cities = (ctx.cities || []).slice().sort(function (a, b) { return b.he.length - a.he.length; });
    for (var i = 0; i < cities.length; i++) if (cities[i].he.length >= 3 && has(t, cities[i].he)) { out.city = cities[i]; break; }
    // country: names from the data (Hebrew label) + a few aliases
    var names = [];
    (ctx.countries || []).forEach(function (c) { names.push([c.he, c.key]); });
    Object.keys(COUNTRY_ALIASES).forEach(function (a) { names.push([a, COUNTRY_ALIASES[a]]); });
    names.sort(function (a, b) { return b[0].length - a[0].length; });
    for (var j = 0; j < names.length; j++) if (has(t, names[j][0])) { out.country = names[j][1]; break; }
    if (out.city && !out.country) out.country = null;

    // month (+ part of month)
    Object.keys(MONTHS).forEach(function (m) { if (!out.month && has(t, m)) out.month = MONTHS[m]; });
    if (!out.month && /החודש הבא/.test(t)) out.month = (today.getMonth() + 1) % 12 + 1;
    if (out.month) out.year = out.month >= today.getMonth() + 1 ? today.getFullYear() : today.getFullYear() + 1;
    if (/(^|\s)[בל]?(תחילת|התחלת|ראשית)(\s|$)/.test(t)) out.part = 'start';
    else if (/(^|\s)[בל]?אמצע(\s|$)/.test(t)) out.part = 'mid';
    else if (/(^|\s)[בל]?(סוף|קראת סוף)(?!\s*שבוע)(\s|$)/.test(t)) out.part = 'end';

    // length
    var m = t.match(/(\d+)\s*(ימים|יום|לילות|לילה)/);
    var wk = t.match(/(\d+)\s*שבועות/);
    var monthNames = Object.keys(MONTHS).join('|');
    if (m) out.days = Math.min(30, Math.max(1, Number(m[1])));
    else if (wk) out.days = Math.min(30, Number(wk[1]) * 7);
    else if (/שבועיים/.test(t)) out.days = 14;
    else if (/שלושה שבועות/.test(t)) out.days = 21;
    else if (new RegExp('(^|\\s)ל?חודש(?=\\s|$)(?!\\s+(הבא|' + monthNames + '))').test(t)) out.days = 30;
    else if (/סופ"?ש|סוף שבוע/.test(t)) out.days = 3;
    else if (has(t, 'שבוע')) out.days = 7;
    else {
      Object.keys(NUMS).forEach(function (w) { if (!out.days && new RegExp('(^|\\s)' + esc(w) + '(\\s+(ימים|לילות))?(\\s|$)').test(t) && (w === 'יומיים' || /ימים|לילות/.test(t))) out.days = NUMS[w]; });
    }

    // sports
    CATS.forEach(function (c) { if (c[1].some(function (w) { return t.indexOf(w) !== -1; })) out.cats.push(c[0]); });
    return out;
  }

  // ---------- planning ----------
  function dayNum(iso) { var p = iso.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function isoOf(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  function dist(a, b) {
    var R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  // hours since day-0 midnight when the event starts / ends. Unknown times get a cautious guess.
  function startH(x) { return x.di * 24 + (x.kick != null ? x.kick : 12); }
  function endH(x) { return x.di * 24 + (x.kick != null ? x.kick + 2.5 : 20); }

  // Longest transfer we suggest at all: by road/rail in a day. Farther means a flight, which we don't plan.
  var LAND_KM = 700;

  // cost of going from event a to a later-day event b, or null if it is not sensible.
  // A transfer longer than the per-day limit is only allowed with free day(s) in between (a travel day).
  function hop(a, b, maxHop) {
    var d = dist(a, b), gap = b.di - a.di;
    // one free day = a travel day (up to ~450 km by road/rail); two or more free days reach the land limit
    var limit = gap === 1 ? maxHop : gap === 2 ? Math.max(maxHop * 2, 450) : LAND_KM;
    if (d > Math.min(limit, LAND_KM)) return null;
    var need = d < 15 ? 0.5 : d / 70 + 1.5;               // travel hours incl. a buffer
    if (startH(b) - endH(a) < need) return null;
    // no long trip straight after an evening event into a morning one
    if (gap === 1 && d > 60 && (endH(a) % 24) >= 20 && (startH(b) % 24) <= 14) return null;
    return { km: d, cost: d / 10 + (d > 15 ? 5 : 0) };
  }

  function solve(list, s, D, maxHop) {
    list.sort(function (a, b) { return a.di - b.di || (a.kick == null ? 12 : a.kick) - (b.kick == null ? 12 : b.kick); });
    var n = list.length, best = [], prev = [], hopKm = [];
    for (var i = 0; i < n; i++) {
      var val = 100 + (list[i].kick != null ? 3 : 0);
      best[i] = val; prev[i] = -1; hopKm[i] = 0;
      for (var j = 0; j < i; j++) {
        if (list[j].di >= list[i].di) continue;
        var h = hop(list[j], list[i], maxHop);
        if (!h) continue;
        if (best[j] - h.cost + val > best[i]) { best[i] = best[j] - h.cost + val; prev[i] = j; hopKm[i] = h.km; }
      }
    }
    var top = -1;
    for (var k = 0; k < n; k++) if (top < 0 || best[k] > best[top]) top = k;
    var chosen = {}, kmTotal = 0, covered = 0;
    for (var c = top; c >= 0; c = prev[c]) { chosen[list[c].di] = list[c].id; covered++; kmTotal += hopKm[c]; }
    var days = [];
    for (var d = 0; d < D; d++) days.push({ date: isoOf(s + d), id: chosen[s + d] || null });
    return { start: isoOf(s), end: isoOf(s + D - 1), days: days, covered: covered, km: Math.round(kmTotal), score: top < 0 ? 0 : best[top] };
  }

  // params: {from, to (ISO, the window the user asked for), days, maxHop}; items: [{id, day (ISO), kick (hours|null), lat, lng}]
  function plan(p, items) {
    var rs = dayNum(p.from), re = dayNum(p.to), D = p.days;
    var last = Math.max(rs, re - D + 1);          // window shorter than the trip: start at its beginning
    var pool = items.map(function (x) { return { id: x.id, di: dayNum(x.day), kick: x.kick, lat: x.lat, lng: x.lng }; });
    var opts = [];
    for (var s = rs; s <= last; s++) {
      var inWin = pool.filter(function (x) { return x.di >= s && x.di <= s + D - 1; });
      if (inWin.length) opts.push(solve(inWin, s, D, p.maxHop));
    }
    opts.sort(function (a, b) { return b.score - a.score || (a.start < b.start ? -1 : 1); });
    // alternatives that are just the same trip shifted by a day are not useful: keep distinct event sets
    var seen = {}, out = [];
    opts.forEach(function (o) {
      var key = o.days.map(function (d) { return d.id; }).join(',');
      if (!seen[key] && out.length < 3) { seen[key] = 1; out.push(o); }
    });
    return { options: out, considered: pool.length };
  }

  window.Planner = { parse: parse, plan: plan };
})();
