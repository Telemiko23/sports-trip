/* ToSport planner v2 - pure, deterministic, no DOM, no network. Runs in the browser (window.ToSport.planner, and the
   legacy window.Planner alias) and in Node tests.

   What this is - and is not:
   - parse(text, ctx)  a RULE-BASED matcher for Hebrew trip phrases (not an LLM). It reports what it understood; anything
     it did not recognise is simply not applied.
   - propose(params, cat)  builds PREVIEW proposals from the real catalog. Nothing here changes the trip.
   - alternatives(...)  eligible replacements for one slot, with the conflicts they would create.

   Product rules this module enforces (see ROADMAP/PRODUCT_NOTES):
   - fixed dates are hard boundaries; flexible dates produce up to three genuinely different windows with actual dates,
     or a truthful "no coverage" result - never an arbitrary substitute range;
   - pace is a *target*, never a requirement that every day has an event;
   - hard constraints (dates, exclusions, locked choices, the location boundary) are separated from soft preferences
     (team, sport mix, competition tier);
   - there is NO travel-time authority here: distance is a straight-line estimate, water/long transfers are not generated
     automatically, and an unknown finish time is uncertainty, not zero duration. */
(function (root, factory) {
  var M = typeof require === 'function' && typeof module === 'object' ? require('./js/model.js') : root.ToSport.model;
  var api = factory(M);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ToSport = root.ToSport || {}; root.ToSport.planner = api; root.Planner = api; }
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  /* ================= parsing (rule-based; reports what it understood) ================= */
  var MONTHS = { 'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12 };
  var NUMS = { 'יומיים': 2, 'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4, 'חמישה': 5, 'חמש': 5, 'שישה': 6, 'שש': 6, 'שבעה': 7, 'שבע': 7, 'שמונה': 8, 'תשעה': 9, 'תשע': 9, 'עשרה': 10, 'עשר': 10 };
  var COUNTRY_ALIASES = { 'בריטניה': 'England', 'הממלכה המאוחדת': 'England', 'ארהב': 'United States', 'אמריקה': 'United States', 'ארצות הברית': 'United States', 'שווייץ': 'Switzerland',
    'הולנד': 'Netherlands', 'דובאי': 'United Arab Emirates', 'אבו דאבי': 'United Arab Emirates', 'איחוד האמירויות': 'United Arab Emirates', 'צ׳כיה': 'Czechia', 'צכיה': 'Czechia' };
  var SPORT_WORDS = [['football', ['כדורגל', 'כדורגלים']], ['f1', ['פורמולה', 'פורמולה 1', 'f1', 'מרוצים', 'מירוצים', 'ספורט מוטורי']], ['tennis', ['טניס']], ['darts', ['דארטס', 'חצים']]];

  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function norm(t) { return String(t == null ? '' : t).toLowerCase().replace(/[֑-ׇ]/g, '').replace(/[׳’`]/g, "'").replace(/[״“”]/g, '"').replace(/\s+/g, ' ').trim(); }
  // a whole word, optionally with one Hebrew prefix letter (ב/ל/מ/ה/ו): "באנגליה" matches "אנגליה"
  function wordRe(w) { return new RegExp('(^|[\\s,.;:!?()\\-"\'])[בלמהו]?' + reEsc(norm(w)) + '(?=$|[\\s,.;:!?()\\-"\'])'); }
  function has(text, w) { return !!norm(w) && wordRe(w).test(text); }

  /* ctx: {today: Date, dests: [destination index from model.buildDestinations], teams: [{he, en}]} */
  function parse(raw, ctx) {
    ctx = ctx || {};
    var t = norm(raw), today = ctx.today || new Date();
    var out = { city: null, country: null, month: null, year: null, part: 'all', days: null, weekend: false, sports: [], team: null, understood: [], hasText: !!t };
    if (!t) return out;
    var dests = ctx.dests || [];

    // destination: the most specific named place wins (longest name first: "New York" before "York"); a country only if no city matched
    var cities = dests.filter(function (d) { return d.kind === 'city'; }).sort(function (a, b) { return b.labelHe.length - a.labelHe.length; });
    for (var i = 0; i < cities.length; i++) if (cities[i].labelHe.length >= 3 && has(t, cities[i].labelHe)) { out.city = cities[i]; break; }
    if (!out.city) {
      var names = [];
      dests.filter(function (d) { return d.kind === 'country'; }).forEach(function (c) { names.push([c.labelHe, c]); });
      Object.keys(COUNTRY_ALIASES).forEach(function (a) { var c = dests.filter(function (d) { return d.kind === 'country' && d.key === COUNTRY_ALIASES[a]; })[0]; if (c) names.push([a, c]); });
      names.sort(function (a, b) { return b[0].length - a[0].length; });
      for (var j = 0; j < names.length; j++) if (has(t, names[j][0])) { out.country = names[j][1]; break; }
    }

    // a team is a SOFT preference layered on the destination. A word that is also a country/city name ("אנגליה") is a place here, never a team.
    var placeWords = {}; dests.forEach(function (d) { placeWords[norm(d.labelHe)] = 1; });
    var teams = (ctx.teams || []).slice().sort(function (a, b) { return b.he.length - a.he.length; });
    for (var ti = 0; ti < teams.length; ti++) {
      if (teams[ti].he.length >= 3 && !placeWords[norm(teams[ti].he)] && has(t, teams[ti].he)) { out.team = teams[ti]; break; }
    }

    // month and part of month ("אמצע-סוף ינואר" = mid AND end: each keyword is checked independently)
    Object.keys(MONTHS).forEach(function (m) { if (!out.month && has(t, m)) out.month = MONTHS[m]; });
    if (!out.month && /החודש הבא/.test(t)) { var nm = today.getMonth() + 2; out.month = nm > 12 ? 1 : nm; }
    if (out.month) out.year = out.month >= today.getMonth() + 1 ? today.getFullYear() : today.getFullYear() + 1;
    var hits = [];
    if (/(^|[\s\-])[בל]?(תחילת|התחלת|ראשית)(?=$|[\s\-])/.test(t)) hits.push('start');
    if (/(^|[\s\-])[בל]?אמצע(?=$|[\s\-])/.test(t)) hits.push('mid');
    if (/(^|[\s\-])[בל]?(סוף|קראת סוף)(?!\s*שבוע)(?=$|[\s\-])/.test(t)) hits.push('end');
    if (hits.length) { var ord = ['start', 'mid', 'end']; hits.sort(function (a, b) { return ord.indexOf(a) - ord.indexOf(b); }); out.part = hits[0] === hits[hits.length - 1] ? hits[0] : hits[0] + '-' + hits[hits.length - 1]; }

    // length
    var monthNames = Object.keys(MONTHS).join('|');
    var m = t.match(/(\d+)\s*(ימים|יום|לילות|לילה)/), wk = t.match(/(\d+)\s*שבועות/);
    if (m) out.days = Math.min(30, Math.max(1, Number(m[1])));
    else if (wk) out.days = Math.min(30, Number(wk[1]) * 7);
    else if (/שבועיים/.test(t)) out.days = 14;
    else if (/שלושה שבועות/.test(t)) out.days = 21;
    else if (new RegExp('(^|\\s)ל?חודש(?=\\s|$)(?!\\s+(הבא|' + monthNames + '))').test(t)) out.days = 30;
    else if (/סופ"?ש|סוף שבוע/.test(t)) { out.days = 3; out.weekend = true; }
    else if (has(t, 'שבוע')) out.days = 7;
    else Object.keys(NUMS).forEach(function (w) { if (!out.days && new RegExp('(^|\\s)' + reEsc(w) + '(\\s+(ימים|לילות))?(\\s|$)').test(t) && (w === 'יומיים' || /ימים|לילות/.test(t))) out.days = NUMS[w]; });

    SPORT_WORDS.forEach(function (c) { if (c[1].some(function (w) { return t.indexOf(w) !== -1; })) out.sports.push(c[0]); });

    // what was understood, in the order the traveler would read it
    if (out.city) out.understood.push({ k: 'dest', label: out.city.label });
    else if (out.country) out.understood.push({ k: 'dest', label: out.country.label });
    if (out.month) out.understood.push({ k: 'month', label: M.HE_MONTHS[out.month - 1], part: out.part });
    if (out.days) out.understood.push({ k: 'days', n: out.days, weekend: out.weekend });
    if (out.sports.length) out.understood.push({ k: 'sports', ids: out.sports });
    if (out.team) out.understood.push({ k: 'team', label: out.team.he });
    return out;
  }

  // {from,to} of the month part the text named, never before `todayIso`; null when no month was understood
  function monthWindow(p, todayIso) {
    if (!p || !p.month) return null;
    var ym = p.year + '-' + (p.month < 10 ? '0' : '') + p.month, last = Number(M.monthEnd(ym).slice(8));
    var R = { start: [1, 10], mid: [11, 20], end: [21, last] }, keys = String(p.part || 'all').split('-');
    var a = R[keys[0]] || [1, last], b = R[keys[keys.length - 1]] || a;
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var from = ym + '-' + pad(a[0]), to = ym + '-' + pad(Math.min(b[1], last));
    if (todayIso && to < todayIso) return null;
    if (todayIso && from < todayIso) from = todayIso;
    return { from: from, to: to };
  }

  /* ================= editorial competition tier (versioned; NOT a quality score) ================= */
  var TIER_VERSION = 1;
  var COMP_TIER = {
    'Champions League': 3, 'Premier League': 3, 'La Liga': 3, 'Bundesliga': 3, 'Serie A': 3, 'Ligue 1': 3,
    'ATP Finals': 3, 'WTA Finals': 3, 'Davis Cup Finals': 3, 'Next Gen ATP Finals': 3, 'PDC Majors': 3,
    'Europa League': 2, 'Conference League': 2, 'Eredivisie': 2, 'Primeira Liga': 2, 'Championship': 2, 'UEFA Nations League': 2,
    'FA Cup': 1, 'Copa del Rey': 1, 'DFB-Pokal': 1, 'Coupe de France': 1, 'Coppa Italia': 1, 'KNVB Beker': 1, 'Puchar Polski': 1, 'Taça de Portugal': 1,
    'Segunda': 1, '2. Bundesliga': 1, 'Serie B': 1, 'Ligue 2': 1, 'Ekstraklasa': 1, 'League One': 1
  };
  function tierOf(ev) { return COMP_TIER[ev.comp] || 0; }
  // The tier only ever compares events of the SAME sport inside the candidate set. A sport whose events all share one
  // tier (typically: tennis/darts/motorsport, which COMP_TIER hardly covers) carries no signal and gets the neutral
  // midpoint - so it is neither buried under nor floated above a ranked football match.
  var TIER_SPAN = 0.6, NEUTRAL = TIER_SPAN / 2;
  function tierBonuses(list) {
    var by = {};
    list.forEach(function (e) { var b = by[e.sportId] || (by[e.sportId] = { min: 9, max: -1 }); var t = tierOf(e); if (t < b.min) b.min = t; if (t > b.max) b.max = t; });
    var out = {};
    list.forEach(function (e) { var b = by[e.sportId]; out[e.id] = b.max > b.min ? (tierOf(e) - b.min) / (b.max - b.min) * TIER_SPAN : NEUTRAL; });
    return out;
  }

  /* ================= constants (documented heuristics, not facts) ================= */
  var SINGLE_BASE_KM = 60;        // "one base": events within a straight-line day-trip of the anchor, never across water
  var SAME_DAY_GAP_MIN = 300;     // two generated events in one day need both start times known and >= 5 h apart
  var PACES = {
    single: { he: 'אירוע אחד שמשדרג את הטיול' },
    balanced: { he: 'שילוב מאוזן' },
    sport: { he: 'טיול סביב ספורט' }
  };
  function targetCount(pace, days, maxEvents) {
    var n = pace === 'single' ? 1 : pace === 'sport' ? days : Math.max(1, Math.round(days / 2));
    return maxEvents ? Math.max(1, Math.min(maxEvents, 12)) : n;
  }

  /* ================= building blocks ================= */
  function locatable(e) { return e.lat != null && e.lng != null && !e.locationProvisional; }
  function minutes(e) { return Number(e.hhmm.slice(0, 2)) * 60 + Number(e.hhmm.slice(3, 5)); }
  function byDt(a, b) { return a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : a.id - b.id; }
  function idKey(list) { return list.map(function (e) { return e.id; }).sort(function (a, b) { return a - b; }).join(','); }
  function cityChanges(sorted) { var n = 0; for (var i = 1; i < sorted.length; i++) if (sorted[i].city !== sorted[i - 1].city) n++; return n; }

  // May `e` join `sel` (events already chosen) without implying an unverified/impossible move?
  function compatible(sel, e, o) {
    for (var i = 0; i < sel.length; i++) {
      var s = sel[i];
      if (s.id === e.id) return false;
      if (s.parentId && s.parentId === e.parentId) return false;              // one day of a tournament is enough for a generated plan
      if (s.date === e.date) {
        if (!o.sameDay || !s.timeKnown || !e.timeKnown || Math.abs(minutes(s) - minutes(e)) < SAME_DAY_GAP_MIN || M.transferKind(s, e) !== 'local') return false;
      } else if (M.transferKind(s, e) === 'unverified' && s.city !== e.city) {
        // different days, different place, and the move cannot be established (water crossing / > 150 km / unknown): never generated automatically
        return false;
      }
    }
    if (o.lodging === 'single' && o.anchor) {
      if (M.km(o.anchor, e) > SINGLE_BASE_KM || M.transferKind(o.anchor, e) === 'unverified' && o.anchor.city !== e.city) return false;
    }
    return true;
  }

  function pick(cands, fixedEvs, target, o) {
    var sel = fixedEvs.slice(), want = Math.max(0, target - fixedEvs.length), added = [];
    var order = cands.slice().sort(function (a, b) { return b._score - a._score || byDt(a, b); });
    var seenSport = {}; sel.forEach(function (e) { seenSport[e.sportId] = 1; });
    var guard = 0;
    while (added.length < want && guard++ < 50) {
      var best = null, bs = -1;
      for (var i = 0; i < order.length; i++) {
        var e = order[i];
        if (sel.some(function (s) { return s.id === e.id; })) continue;
        if (!compatible(sel, e, o)) continue;
        var sc = e._score + (o.diversity && !seenSport[e.sportId] ? 0.5 : 0);
        if (sc > bs + 1e-9) { bs = sc; best = e; }
      }
      if (!best) break;
      sel.push(best); added.push(best); seenSport[best.sportId] = 1;
    }
    return { events: sel.sort(byDt), added: added };
  }

  /* ---------- candidates for a window ---------- */
  function teamMatcher(team) {
    if (!team) return null;
    var names = (team.names || [team.he, team.en]).filter(Boolean).map(norm);
    return function (e) { return [e.home, e.away, e.homeHe, e.awayHe].some(function (n) { return n && names.indexOf(norm(n)) !== -1; }); };
  }

  function candidatesFor(cat, p, win, ctxMemo) {
    var q = M.query(cat, { dest: p.dest, dates: { from: win.from, to: win.to }, radiusKm: p.radiusKm, sports: p.sports, excludedComps: p.excludedComps, excludedWeekdays: p.excludedWeekdays });
    var excl = {}; (p.excluded || []).forEach(function (id) { excl[id] = 1; });
    var must = {}; (p.locked || []).concat(p.fixed || []).forEach(function (id) { must[id] = 1; });
    var skipped = 0, unverified = 0, list = [];
    q.events.forEach(function (e) {
      if (excl[e.id] && !must[e.id]) return;
      if (must[e.id]) return;                                                  // seeded separately
      if (!locatable(e)) { skipped++; return; }                                // unlocated / provisional: discoverable in search, never auto-routed
      // a city destination is the base: an event we cannot establish a transfer to (water crossing, > 150 km straight-line) is not auto-proposed
      if (p.dest && p.dest.kind === 'city' && M.transferKind(p.dest, e) === 'unverified') { unverified++; return; }
      list.push(e);
    });
    return { list: list, unlocated: skipped, unverified: unverified, noPos: q.noPos };
  }

  function scoreAll(list, p) {
    var tb = tierBonuses(list), isTeam = teamMatcher(p.team);
    list.forEach(function (e) { e._score = 1 + tb[e.id] + (isTeam && isTeam(e) ? 3 : 0) + (e.timeKnown ? 0.05 : 0); e._team = !!(isTeam && isTeam(e)); });
  }

  /* ---------- notes: only what affects a decision ---------- */
  function notesFor(events) {
    var out = [];
    for (var i = 1; i < events.length; i++) { var n = M.pairNote(events[i - 1], events[i]); if (n) { n.a = events[i - 1].id; n.b = events[i].id; out.push(n); } }
    events.forEach(function (e) { if (!locatable(e)) out.push({ kind: 'location-unknown', a: e.id }); });
    return out;
  }

  function labelsFor(sorted, all, p) {
    var out = [], sports = {}, comps = {};
    sorted.forEach(function (e) { sports[e.sportId] = 1; comps[e.compId] = 1; });
    var changes = cityChanges(sorted), others = all.filter(function (x) { return x.key !== idKey(sorted); });
    var otherMax = others.reduce(function (m, x) { return Math.max(m, x.facts.cityChanges); }, -1);
    if (sorted.length > 1 && changes === 0 && others.length && otherMax > 0) out.push({ k: 'single-city' });
    else if (sorted.length > 1 && others.length && changes < otherMax) out.push({ k: 'fewer-moves' });
    var sk = Object.keys(sports);
    if (sk.length > 1) out.push({ k: 'sport-mix', sports: sk });
    if (p.team && sorted.some(function (e) { return e._team; })) out.push({ k: 'team', team: p.team.he });
    return out;
  }

  function proposalFrom(events, p, win, fixedIds, lockedIds, tag) {
    var sorted = events.slice().sort(byDt), dates = {};
    sorted.forEach(function (e) { dates[e.date] = 1; });
    var days = M.eachDay(win.from, win.to), free = days.filter(function (d) { return !dates[d]; });
    var fx = {}; (fixedIds || []).forEach(function (id) { fx[id] = 1; });
    var lk = {}; (lockedIds || []).forEach(function (id) { lk[id] = 1; });
    return {
      key: idKey(sorted), tag: tag, window: { from: win.from, to: win.to },
      events: sorted,
      items: sorted.map(function (e) { return { id: e.id, ev: e, locked: !!lk[e.id], inTrip: !!fx[e.id], team: !!e._team }; }),
      score: sorted.reduce(function (s, e) { return s + (e._score || 1); }, 0),
      facts: { cityChanges: cityChanges(sorted), cities: uniq(sorted.map(function (e) { return e.city; })), sports: uniq(sorted.map(function (e) { return e.sportId; })), freeDays: free.length, days: days.length },
      freeDays: free, notes: notesFor(sorted), labels: []
    };
  }
  function uniq(a) { var s = {}, o = []; a.forEach(function (x) { if (!s[x]) { s[x] = 1; o.push(x); } }); return o; }

  /* ---------- proposals for ONE concrete window ---------- */
  function buildForWindow(cat, p, win) {
    var cs = candidatesFor(cat, p, win), days = M.diffDays(win.from, win.to) + 1;
    var inWin = function (e) { return e && e.date >= win.from && e.date <= win.to; };
    var fixedEvs = uniq((p.fixed || []).concat(p.locked || [])).map(function (id) { return cat.byId[id]; }).filter(inWin);
    scoreAll(cs.list.concat(fixedEvs), p);
    var target = targetCount(p.pace, days, p.maxEvents), out = [], seen = {};
    var push = function (events, tag) {
      var pr = proposalFrom(events, p, win, p.fixed, p.locked, tag);
      if (!pr.events.length || seen[pr.key]) return;
      seen[pr.key] = 1; out.push(pr);
    };
    var anchors = [null];
    if (p.lodging === 'single') {
      // try the base city of the best few candidates (a country destination has several possible bases)
      var cityBest = {}, order = cs.list.slice().sort(function (a, b) { return b._score - a._score || byDt(a, b); });
      order.forEach(function (e) { if (!cityBest[e.city]) cityBest[e.city] = e; });
      anchors = Object.keys(cityBest).map(function (c) { return cityBest[c]; }).slice(0, 3);
      if (fixedEvs.length && locatable(fixedEvs[0])) anchors = [fixedEvs[0]];       // the trip already has a base
      if (!anchors.length) anchors = [null];
    }
    if (p.pace === 'single') {
      var oneSel = pick(cs.list, fixedEvs, 0, {}).events;
      if (fixedEvs.length >= 1) { push(oneSel, 'keep'); }
      else {
        cs.list.slice().sort(function (a, b) { return b._score - a._score || byDt(a, b); }).filter(function (e) { return compatible(oneSel, e, { lodging: p.lodging }); })
          .slice(0, 3).forEach(function (e) { push(oneSel.concat([e]), 'single'); });
      }
    } else {
      anchors.forEach(function (a, i) {
        var o = { lodging: p.lodging, anchor: a, sameDay: p.pace === 'sport' };
        push(pick(cs.list, fixedEvs, target, o).events, i === 0 ? 'best' : 'base');
        if (i === 0) {
          var multiSport = uniq(cs.list.map(function (e) { return e.sportId; })).length > 1;
          if (multiSport) push(pick(cs.list, fixedEvs, target, { lodging: p.lodging, anchor: a, sameDay: o.sameDay, diversity: true }).events, 'mix');
          if (p.lodging === 'multi') {                                            // a calmer alternative: stay in one place
            var base = a || (out[0] && out[0].events[0]);
            if (base) push(pick(cs.list, fixedEvs, target, { lodging: 'single', anchor: base, sameDay: o.sameDay }).events, 'calm');
          }
        }
      });
    }
    // still fewer than three genuinely different proposals: re-plan without each of the best proposal's own highest-ranked new events
    if (p.pace !== 'single' && out.length && out.length < 3) {
      var best = out[0], fx = {}; fixedEvs.forEach(function (e) { fx[e.id] = 1; });
      var lead = best.events.filter(function (e) { return !fx[e.id]; }).sort(function (a, b) { return b._score - a._score; }).slice(0, 2);
      lead.forEach(function (drop) {
        if (out.length >= 3) return;
        var rest = cs.list.filter(function (e) { return e.id !== drop.id; });
        push(pick(rest, fixedEvs, target, { lodging: p.lodging, anchor: anchors[0], sameDay: p.pace === 'sport' }).events, 'alt');
      });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    out.slice(0, 3).forEach(function (pr, i, arr) { pr.labels = labelsFor(pr.events, arr, p); });
    return { proposals: out.slice(0, 3), unlocated: cs.unlocated, unverified: cs.unverified, candidates: cs.list.length, target: target, days: days, fixedCount: fixedEvs.length };
  }

  /* ================= entry point ================= */
  /* p: {dest, radiusKm, mode:'fixed'|'flexible', from, to, days, startWeekdays:[0..6]|null, pace, lodging:'single'|'multi',
         sports:[ids]|null, team:{he,en}|null, maxEvents, excluded:[ids], locked:[ids], fixed:[ids] (already in the trip),
         excludedComps, excludedWeekdays} */
  function propose(p, cat) {
    p = Object.assign({ mode: 'fixed', pace: 'balanced', lodging: 'single', radiusKm: 150, excluded: [], locked: [], fixed: [] }, p);
    var res = { mode: p.mode, pace: p.pace, windows: [], proposals: [], conflicts: [], coverage: { first: cat.first, last: cat.last }, empty: null, unlocated: 0, unverified: 0, considered: 0 };
    var lockedEvs = (p.locked || []).map(function (id) { return { id: id, ev: cat.byId[id] || null }; });
    (p.locked || []).forEach(function (id) { if ((p.excluded || []).indexOf(id) !== -1) res.conflicts.push({ kind: 'locked-and-excluded', id: id }); });
    lockedEvs.forEach(function (x) { if (!x.ev) res.conflicts.push({ kind: 'locked-missing', id: x.id }); });
    var lockedKnown = lockedEvs.filter(function (x) { return x.ev; }).map(function (x) { return x.ev; });

    if (p.mode === 'flexible') {
      var n = Math.max(1, Math.min(30, p.days || 3)), lastStart = M.addDays(p.to, -(n - 1));
      if (p.from > lastStart) { res.empty = 'range-too-short'; return res; }
      var starts = M.eachDay(p.from, lastStart).filter(function (s) { return !p.startWeekdays || !p.startWeekdays.length || p.startWeekdays.indexOf(M.weekday(s)) !== -1; });
      if (!starts.length) { res.empty = 'no-start-day'; return res; }
      var wins = starts.map(function (s) { return { from: s, to: M.addDays(s, n - 1) }; });
      var withLocked = wins.filter(function (w) { return lockedKnown.every(function (e) { return e.date >= w.from && e.date <= w.to; }); });
      if (lockedKnown.length && !withLocked.length) { res.conflicts.push({ kind: 'locked-no-window', ids: lockedKnown.map(function (e) { return e.id; }) }); res.empty = 'locked-conflict'; return res; }
      var rows = [];
      withLocked.forEach(function (w) {
        var b = buildForWindow(cat, p, w); res.considered += b.candidates; res.unlocated = Math.max(res.unlocated, b.unlocated); res.unverified = Math.max(res.unverified, b.unverified);
        if (b.proposals.length) rows.push({ window: w, best: b.proposals[0], proposals: b.proposals, score: b.proposals[0].score, target: b.target });
      });
      rows.sort(function (a, b) { return b.score - a.score || (a.window.from < b.window.from ? -1 : 1); });
      var chosen = [], keys = {};
      rows.forEach(function (r) {
        if (chosen.length >= 3 || keys[r.best.key]) return;
        var overlapsMuch = chosen.some(function (c) { return Math.abs(M.diffDays(c.window.from, r.window.from)) < Math.ceil(n / 2); });
        if (overlapsMuch) return;
        keys[r.best.key] = 1; chosen.push(r);
      });
      res.windows = chosen;
      res.proposals = chosen.map(function (r) { return r.best; });
      if (!chosen.length) res.empty = cat.last && p.from > cat.last ? 'beyond-feed' : 'no-events';
      res.coverage.beyond = !!(cat.last && p.to > cat.last);
      return res;
    }

    // fixed dates: the window IS the request. Locked/fixed events outside it are reported, not silently dropped or widened.
    var win = { from: p.from, to: p.to };
    lockedKnown.forEach(function (e) { if (e.date < win.from || e.date > win.to) res.conflicts.push({ kind: 'locked-outside-window', id: e.id }); });
    var b = buildForWindow(cat, p, win);
    res.proposals = b.proposals; res.unlocated = b.unlocated; res.unverified = b.unverified; res.considered = b.candidates; res.target = b.target;
    res.windows = [{ window: win, best: b.proposals[0] || null, proposals: b.proposals, target: b.target }];
    if (!b.proposals.length) res.empty = cat.last && win.from > cat.last ? 'beyond-feed' : b.candidates ? 'no-compatible' : 'no-events';
    res.coverage.beyond = !!(cat.last && win.to > cat.last);
    return res;
  }

  /* ================= replace one slot ================= */
  /* p: the same params used for propose(); proposal: one of its proposals; slotId: the event to replace.
     Returns eligible alternatives (same window, not excluded, compatible with the REST of the proposal) and, for each,
     the date change and the conflicts it would introduce - so the traveler sees them before replacing. */
  function alternatives(p, cat, proposal, slotId) {
    var win = proposal.window, rest = proposal.events.filter(function (e) { return e.id !== slotId; });
    var cs = candidatesFor(cat, Object.assign({}, p, { excluded: (p.excluded || []).concat([slotId]) }), win);
    var slot = cat.byId[slotId];
    scoreAll(cs.list.concat(rest), p);
    var o = { lodging: p.lodging, anchor: p.lodging === 'single' && rest.length ? rest[0] : null, sameDay: p.pace === 'sport' };
    var out = [];
    cs.list.forEach(function (e) {
      if (rest.some(function (r) { return r.id === e.id; })) return;
      var ok = compatible(rest, e, o);
      var after = rest.concat([e]).sort(byDt), notes = notesFor(after).filter(function (n) { return n.a === e.id || n.b === e.id; });
      out.push({ ev: e, compatible: ok, sameDate: !!slot && slot.date === e.date, notes: notes, dateChanged: !!slot && slot.date !== e.date, score: e._score });
    });
    out.sort(function (a, b) { return (b.compatible - a.compatible) || (b.sameDate - a.sameDate) || (b.score - a.score) || byDt(a.ev, b.ev); });
    return out.slice(0, 8);
  }

  // a proposal after the traveler swapped one slot: same window, recomputed facts/notes (still a preview)
  function rebuild(p, cat, proposal, events) {
    scoreAll(events, p);
    var pr = proposalFrom(events, p, proposal.window, p.fixed, p.locked, 'custom');
    pr.labels = labelsFor(pr.events, [{ key: pr.key, facts: pr.facts }], p);
    return pr;
  }

  // the clubs/teams the feed actually contains (Hebrew + English names), longest Hebrew name first - the parser's team vocabulary
  function teamsFromCatalog(cat) {
    var seen = {}, out = [];
    cat.events.forEach(function (e) {
      if (e.kind !== 'match') return;
      [[e.homeHe, e.home], [e.awayHe, e.away]].forEach(function (p) { if (p[0] && !seen[p[0]]) { seen[p[0]] = 1; out.push({ he: p[0], en: p[1] || null, names: [p[0], p[1]].filter(Boolean) }); } });
    });
    return out;
  }

  return { rebuild: rebuild, teamsFromCatalog: teamsFromCatalog, parse: parse, monthWindow: monthWindow, propose: propose, alternatives: alternatives, tierBonuses: tierBonuses, tierOf: tierOf, targetCount: targetCount,
    PACES: PACES, TIER_VERSION: TIER_VERSION, COMP_TIER: COMP_TIER, SINGLE_BASE_KM: SINGLE_BASE_KM, SAME_DAY_GAP_MIN: SAME_DAY_GAP_MIN };
});
