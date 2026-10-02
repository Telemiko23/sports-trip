/* ToSport v2 - the Plan tab. Renders the planner's PREVIEW proposals and turns the traveler's choices (pace, lodging,
   lock, exclude, replace, add) into store actions. It owns no engine logic (planner.js) and no trip state (store).
   - text description: parsed on `input` (typing AND paste) for a live "what was understood" line; applied to the fields on
     the button, on Enter, or when the form is submitted with changed text - one action, never keydown-only;
   - a team named in the text is a preference that lives only as long as that text (clearing the text removes it);
   - nothing here changes the trip until "הוסיפו לטיול" / "החליפו את הטיול" is pressed. */
(function () {
  'use strict';
  var TS = window.ToSport, M = TS.model, I = TS.i18n, P = TS.planner, U = TS.ui;
  var t = I.t, tn = I.tn, esc = M.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var PX = 'pl';
  var DAYS = [2, 3, 4, 5, 7, 10, 14];
  var LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

  var api = null, root = null, ps = null;

  function newState() {
    return { built: false, ctxSig: '', text: '', appliedText: '', team: null, maxEvents: null, locks: {}, cards: [], result: null, params: null, replace: null, stale: false, ran: false };
  }

  /* ---------- helpers ---------- */
  function today() { return api.today(); }
  function bdi(s) { return '<bdi dir="auto">' + esc(s) + '</bdi>'; }
  function sportNames(ids) { return ids.map(function (k) { return (M.SPORT_REGISTRY[k] || M.SPORT_REGISTRY.unknown).he; }).join(' ו'); }
  function dayName(iso) { return M.HE_DAYS_FULL[M.weekday(iso)]; }
  function partOf(from, to) {
    var ym = from.slice(0, 7), parts = ['all', 'start', 'mid', 'end', 'start-mid', 'mid-end'];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === 'all') { if (from.slice(8) === '01' || from === today()) { if (to === M.monthEnd(ym)) return 'all'; } continue; }
      var w = P.monthWindow({ month: Number(ym.slice(5, 7)), year: Number(ym.slice(0, 4)), part: parts[i] }, null);
      if (w && w.to === to && (w.from === from || (from === today() && from > w.from))) return parts[i];
    }
    return 'all';
  }

  /* ---------- form ---------- */
  function paceHtml(cur) {
    return '<fieldset class="plan-choice"><legend>' + esc(t('plan.pace.legend')) + '</legend>' + ['single', 'balanced', 'sport'].map(function (k) {
      return '<label class="plan-opt"><input type="radio" name="plPace" value="' + k + '"' + (cur === k ? ' checked' : '') + '><span><strong>' + esc(t('plan.pace.' + k)) + '</strong>' +
        (k === 'balanced' ? ' <span class="hint-inline">' + esc(t('plan.pace.default')) + '</span>' : '') + '<small>' + esc(t('plan.pace.' + k + '.desc')) + '</small></span></label>';
    }).join('') + '</fieldset>';
  }
  function lodgingHtml(cur) {
    return '<fieldset class="plan-choice"><legend>' + esc(t('plan.lodging.legend')) + '</legend>' + ['single', 'multi'].map(function (k) {
      return '<label class="plan-opt"><input type="radio" name="plLodging" value="' + k + '"' + (cur === k ? ' checked' : '') + '><span><strong>' + esc(t('plan.lodging.' + k)) + '</strong>' +
        '<small>' + esc(k === 'single' ? t('plan.lodging.singleNote', { km: P.SINGLE_BASE_KM }) : t('plan.lodging.multiNote')) + '</small></span></label>';
    }).join('') + '</fieldset>';
  }
  function flexExtraHtml(o) {
    var parts = ['all', 'start', 'mid', 'end', 'start-mid', 'mid-end'].map(function (k) { return '<option value="' + k + '"' + (o.part === k ? ' selected' : '') + '>' + esc(t('plan.part.' + k)) + '</option>'; }).join('');
    var sd = '<option value="">' + esc(t('plan.startDay.any')) + '</option>' + M.HE_DAYS_FULL.map(function (n, i) { return '<option value="' + i + '"' + (o.startDay === i ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
    return '<label>' + esc(t('plan.part')) + '<select id="plPart">' + parts + '</select></label><label>' + esc(t('plan.startDay')) + '<select id="plStartDay">' + sd + '</select></label>';
  }
  function extraHtml(st, counts) {
    return '<div class="field plan-text"><label for="plText">' + esc(t('plan.text.label')) + '</label>' +
      '<div class="plan-text-row"><input id="plText" type="text" value="' + esc(ps.text) + '" autocomplete="off" aria-describedby="plTextHint plUnderstood" placeholder="' + esc('סוף שבוע בלונדון באוקטובר עם משחק של ארסנל') + '">' +
      '<button type="button" class="btn" id="plApply">' + esc(t('plan.text.apply')) + '</button></div>' +
      '<p class="hint" id="plTextHint">' + esc(t('plan.text.hint')) + '</p><div id="plUnderstood" class="plan-understood" aria-live="polite"></div></div>' +
      paceHtml(st.prefs.pace) + lodgingHtml(st.prefs.lodging) +
      '<div class="field"><span class="field-label" id="plSportsLbl">' + esc(t('plan.sports.legend')) + '</span><div class="sportchips" id="plSports" role="group" aria-labelledby="plSportsLbl">' + U.sportChipsHtml(counts, st.filters.sports) + '</div>' +
      '<p class="hint">' + esc(t('plan.sports.hint')) + '</p></div>' +
      '<details class="plan-adv"><summary>' + esc(t('plan.adv')) + '</summary><label>' + esc(t('plan.maxEvents')) + '<select id="plMax"><option value="">' + esc(t('plan.maxEvents.auto')) + '</option>' +
      [1, 2, 3, 4, 5, 6, 8, 10].map(function (n) { return '<option value="' + n + '"' + (ps.maxEvents === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></details>' +
      '<p class="field-error" id="plStale" hidden></p>';
  }
  function sportCounts(st) {
    var c = st.context, d = c.dates;
    if (!c.dest) return {};
    return M.countBySport(M.query(api.cat, { dest: c.dest, dates: d ? { from: d.from, to: d.to } : null, radiusKm: c.radiusKm }).events);
  }
  function buildForm() {
    var st = api.store.get(), c = st.context, d = c.dates, mo = api.monthOptions();
    var flex = d && d.mode === 'flexible';
    var month = flex ? d.from.slice(0, 7) : (d ? d.from.slice(0, 7) : mo[0].value);
    if (!mo.some(function (m) { return m.value === month; })) month = mo[0].value;
    var o = { months: mo, month: month, days: d && d.days || 3, mode: flex ? 'flexible' : 'fixed', from: d ? d.from : today(), to: d ? d.to : M.addDays(today(), 2),
      destText: c.dest ? (c.dest.kind === 'country' ? c.dest.countryHe + ' - כל המדינה' : c.dest.cityHe + ' (' + c.dest.countryHe + ')') : '',
      submitLabel: t('plan.go'), showCancel: false, showBrowse: false, radius: false,
      flexExtra: flexExtraHtml({ part: flex ? partOf(d.from, d.to) : 'all', startDay: flex && d.weekdays && d.weekdays.length ? d.weekdays[0] : null }) };
    o.extra = extraHtml(st, sportCounts(st));
    $('#plFormHost', root).innerHTML = U.contextFormHtml(PX, o);
    api.bindContextForm(PX, onSubmit);
    ps.built = true; ps.stale = false; showStale();
    ps.ctxSig = ctxSig(st);
    renderUnderstood(null);
  }
  function ctxSig(st) { return JSON.stringify([st.context.dest, st.context.dates, st.context.radiusKm]); }
  function showStale() { var el = $('#plStale', root); if (el) { el.hidden = !ps.stale; el.textContent = ps.stale ? t('plan.stale') : ''; } }

  /* ---------- free text -> fields ---------- */
  function parseCtx() { return { dests: api.dests, teams: P.teamsFromCatalog(api.cat), today: new Date(today() + 'T12:00:00') }; }
  function understoodLine(p) {
    return p.understood.map(function (u) {
      if (u.k === 'dest') return t('plan.understood.dest', { v: u.label });
      if (u.k === 'month') return t('plan.understood.month', { v: u.label + (u.part && u.part !== 'all' ? ' (' + t('plan.part.' + u.part) + ')' : '') });
      if (u.k === 'days') return u.weekend ? t('plan.understood.weekend') : t('plan.understood.days', { n: u.n });
      if (u.k === 'sports') return t('plan.understood.sports', { v: sportNames(u.ids) });
      if (u.k === 'team') return t('plan.understood.team', { v: u.label });
      return '';
    }).filter(Boolean);
  }
  function renderUnderstood(p, extraNotes) {
    var el = $('#plUnderstood', root); if (!el) return;
    if (!p) { el.innerHTML = ps.team ? teamChip() : ''; return; }
    var parts = understoodLine(p), html = '';
    if (!p.hasText) html = '<p>' + esc(t('plan.text.cleared')) + '</p>';
    else if (!parts.length) html = '<p>' + esc(t('plan.text.nothing')) + '</p>';
    else html = '<p><strong>' + esc(t('plan.text.understood')) + '</strong> ' + parts.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join(' ') + '</p>';
    if (p.team) html += '<p class="hint">' + esc(t('plan.team.note')) + '</p>';
    (extraNotes || []).forEach(function (n) { html += '<p class="hint">' + esc(n) + '</p>'; });
    el.innerHTML = html;
  }
  function teamChip() { return '<p><span class="tag">' + esc(t('plan.understood.team', { v: ps.team.he })) + '</span> <button type="button" class="linkbtn" data-pl="team-clear">' + esc(t('plan.team.remove')) + '</button></p>'; }

  function applyText() {
    var text = ($('#plText', root).value || '').trim(), p = P.parse(text, parseCtx()), notes = [];
    ps.text = text; ps.appliedText = text; ps.team = p.team || null;
    if (!text) { renderUnderstood(p); return p; }
    if (p.city || p.country) api.selectDest(PX, p.city || p.country);
    var flexRadio = $('input[name="plMode"][value="flexible"]', root);
    if (p.month) {
      var ym = p.year + '-' + M.pad(p.month), sel = $('#plMonth', root), has = $$('option', sel).some(function (o) { return o.value === ym; });
      if (has) {
        sel.value = ym; flexRadio.checked = true; flexRadio.dispatchEvent(new Event('change', { bubbles: true }));
        $('#plPart', root).value = p.part;
      }
    }
    if (p.days) {
      var near = DAYS.reduce(function (b, n) { return Math.abs(n - p.days) < Math.abs(b - p.days) ? n : b; }, DAYS[0]);
      $('#plDays', root).value = String(near);
      if (near !== p.days) notes.push(t('plan.text.daysRounded', { n: near }));
      if (!p.month && !$('input[name="plMode"][value="flexible"]', root).checked) notes.push(t('plan.text.daysFlexOnly'));
    }
    $('#plStartDay', root).value = p.weekend ? '5' : $('#plStartDay', root).value;
    if (p.sports.length) { api.store.dispatch({ type: 'SPORTS_SET', sports: p.sports }); }
    renderUnderstood(p, notes);
    api.announce(t('plan.text.applied'));
    return p;
  }

  /* ---------- submit: commit the context, then compute ---------- */
  function onSubmit(res) {
    var txt = ($('#plText', root).value || '').trim();
    if (txt !== ps.appliedText) {                         // pasted/typed and went straight to the button or Enter: apply first, then use the fields
      applyText();
      var again = api.readContextForm(PX); if (!again) return;
      res = { dest: again.dest, dates: again.dates, browse: false, radiusKm: null };
    }
    var st = api.store.get();
    ps.committing = true;
    api.store.dispatch({ type: 'CONTEXT_COMMIT', dest: destState(res.dest), dates: res.dates, browse: false, radiusKm: null });
    ps.committing = false;
    api.track('context_submit', { source: 'plan', dest_kind: res.dest.kind, date_mode: res.dates.mode, first_visit: !st.meta.onboarded });
    ps.stale = false;
    ps.ctxSig = ctxSig(api.store.get()); showStale();
    run(true); focusAfter('#plResultsTitle');
  }
  function destState(d) {
    return d.kind === 'country' ? { kind: 'country', key: d.key, country: d.country, countryHe: d.countryHe }
      : { kind: 'city', key: d.key, city: d.city || d.labelEn, cityHe: d.cityHe || d.labelHe, country: d.country, countryHe: d.countryHe, lat: d.lat, lng: d.lng };
  }

  /* ---------- engine call ---------- */
  function lockedIds(st) {
    var out = {}; Object.keys(ps.locks).forEach(function (k) { if (ps.locks[k]) out[k] = 1; });
    st.trip.entries.forEach(function (e) { if (e.locked) out[e.id] = 1; });
    return Object.keys(out).map(Number);
  }
  function paramsFrom(st) {
    var c = st.context, d = c.dates;
    if (!c.dest || !d) return null;
    var p = { dest: c.dest, radiusKm: c.radiusKm, mode: d.mode === 'flexible' ? 'flexible' : 'fixed', from: d.from, to: d.to, pace: st.prefs.pace, lodging: st.prefs.lodging,
      sports: st.filters.sports, excludedComps: st.filters.excludedComps, excludedWeekdays: st.filters.excludedWeekdays, team: ps.team, maxEvents: ps.maxEvents,
      excluded: st.trip.excluded.slice(), locked: lockedIds(st), fixed: st.trip.entries.map(function (e) { return e.id; }) };
    if (p.mode === 'flexible') { p.days = d.days || 3; p.startWeekdays = d.weekdays && d.weekdays.length ? d.weekdays : null; }
    return p;
  }
  function run(announceResult) {
    var st = api.store.get(), p = paramsFrom(st);
    ps.params = p; ps.replace = null;
    if (!p) { ps.result = null; ps.cards = []; render(); return; }
    var r = P.propose(p, api.cat);
    ps.result = r; ps.ran = true;
    ps.cards = r.mode === 'fixed' ? (r.windows[0] ? r.windows[0].proposals.map(function (pr) { return { win: pr.window, pr: pr }; }) : []) : r.windows.map(function (w) { return { win: w.window, pr: w.best }; });
    renderResults();
    if (announceResult) api.announce(ps.cards.length ? tn('plan.live.results', ps.cards.length) : t('plan.live.none'));
    api.track('proposal_view', { mode: r.mode, pace: p.pace, lodging: p.lodging, results: ps.cards.length, empty: r.empty || '' });
  }

  /* ---------- results ---------- */
  function rangeText(a, b) { return M.fmtRange(a, b); }
  function itemTime(ev) {
    var ts = M.eventTimeState(ev);
    return ts.state === 'known' ? ts.label : ts.state === 'day' ? t('ev.day', { n: ev.dayNo }) : ts.state === 'unpublished' ? t('ev.timeUnpublished') : t('ev.allDay');
  }
  function itemHtml(pr, it, k) {
    var ev = it.ev, cat = api.cat, st = api.store.get();
    var badges = '';
    if (it.inTrip) badges += '<span class="tag tag--ok">' + esc(t('plan.item.inTrip')) + '</span>';
    if (it.locked || ps.locks[ev.id]) badges += '<span class="tag tag--lock">' + U.icon('lock') + esc(t('plan.item.locked')) + '</span>';
    if (it.team) badges += '<span class="tag">' + esc(t('plan.item.team')) + '</span>';
    var locked = !!(it.locked || ps.locks[ev.id]);
    var acts = '<button type="button" class="btn small" data-pl="lock" data-id="' + ev.id + '" aria-pressed="' + locked + '" aria-label="' + esc(t(locked ? 'plan.aria.unlock' : 'plan.aria.lock', { title: ev.title })) + '">' + U.icon('lock') + esc(t(locked ? 'plan.btn.unlock' : 'plan.btn.lock')) + '</button>';
    if (!it.inTrip) {
      acts += '<button type="button" class="btn small" data-pl="replace" data-pk="' + esc(pr.key) + '" data-id="' + ev.id + '" aria-expanded="' + !!(ps.replace && ps.replace.pk === pr.key && ps.replace.id === ev.id) + '" aria-label="' + esc(t('plan.aria.replace', { title: ev.title })) + '">' + esc(t('plan.btn.replace')) + '</button>' +
        '<button type="button" class="btn small" data-pl="exclude" data-id="' + ev.id + '" aria-label="' + esc(t('plan.aria.exclude', { title: ev.title })) + '">' + esc(t('plan.btn.exclude')) + '</button>';
    }
    var li = '<li class="plan-ev' + (it.inTrip ? ' in-trip' : '') + '" data-ev="' + ev.id + '"><div class="plan-time">' + esc(itemTime(ev)) + '</div><div class="plan-ev-main">' +
      '<button type="button" class="title-btn" data-open="' + ev.id + '" aria-haspopup="dialog">' + U.titleHtml(ev) + '</button>' +
      '<div class="ev-meta">' + M.sportLabelHtml(ev.sportId) + U.compTagHtml(ev, cat) + '<span class="ev-place">' + U.placeHtml(ev) + '</span></div>' +
      (badges ? '<div class="plan-badges">' + badges + '</div>' : '') + '</div><div class="plan-actions">' + acts + '</div></li>';
    if (ps.replace && ps.replace.pk === pr.key && ps.replace.id === ev.id) li += altHtml(pr, ev);
    return li;
  }
  function altHtml(pr, ev) {
    var alts = P.alternatives(ps.params, api.cat, pr, ev.id), slot = ev;
    var body = !alts.length ? '<p class="hint">' + esc(t('plan.alt.none')) + '</p>' : '<ul class="plan-alts">' + alts.map(function (a) {
      var e = a.ev, parts = [];
      if (a.sameDate) parts.push(t('plan.alt.sameDate')); else if (a.dateChanged) parts.push(t('plan.alt.dateChange', { from: M.fmtDate(slot.date), to: M.fmtDate(e.date) }));
      var notes = a.notes.map(function (n) { return U.noteHtml(n); }).join('');
      var status = !a.compatible ? '<p class="tstatus warn">' + esc(t('plan.alt.incompatible')) + '</p>' : (notes ? '' : '<p class="hint">' + esc(t('plan.alt.noConflict')) + '</p>');
      return '<li class="plan-alt"><div class="plan-alt-main"><strong>' + U.titleHtml(e) + '</strong><div class="ev-meta">' + M.sportLabelHtml(e.sportId) + '<span class="ev-place">' + U.placeHtml(e) + '</span></div>' +
        '<p class="hint">' + esc(M.fmtDateLong(e.date) + ' · ' + itemTime(e)) + (parts.length ? ' · ' + esc(parts.join(' · ')) : '') + '</p>' + status + (notes ? '<ul class="tnotes">' + notes + '</ul>' : '') + '</div>' +
        '<button type="button" class="btn small" data-pl="swap" data-pk="' + esc(pr.key) + '" data-id="' + ev.id + '" data-to="' + e.id + '" aria-label="' + esc(t('plan.alt.useNamed', { title: e.title })) + '">' + esc(t('plan.alt.use')) + '</button></li>';
    }).join('') + '</ul>';
    return '<li class="plan-alts-wrap" role="group" aria-label="' + esc(t('plan.alt.title', { title: ev.title })) + '"><h5>' + esc(t('plan.alt.title', { title: ev.title })) + '</h5>' + body +
      '<button type="button" class="btn small" data-pl="replace-close">' + esc(t('plan.alt.close')) + '</button></li>';
  }
  function dayRows(pr) {
    var win = pr.window, by = {}, rows = '';
    pr.items.forEach(function (it) { (by[it.ev.date] = by[it.ev.date] || []).push(it); });
    var days = M.eachDay(win.from, win.to), i = 0;
    while (i < days.length) {
      var d = days[i];
      if (by[d]) {
        rows += '<li class="plan-day"><h4 class="plan-date">' + esc(M.fmtDateLong(d)) + '</h4><ul class="plan-evs">' + by[d].map(function (it, k) { return itemHtml(pr, it, k); }).join('') + '</ul></li>';
        i++;
      } else {
        var j = i; while (j + 1 < days.length && !by[days[j + 1]]) j++;
        rows += '<li class="plan-day plan-free"><p>' + esc(j > i ? t('plan.day.freeRange', { range: rangeText(days[i], days[j]) }) : M.fmtDateLong(d) + ' · ' + t('plan.day.free')) + '</p></li>';
        i = j + 1;
      }
    }
    return '<ol class="plan-days">' + rows + '</ol>';
  }
  function labelText(l) {
    if (l.k === 'single-city') return t('plan.label.singleCity');
    if (l.k === 'fewer-moves') return t('plan.label.fewerMoves');
    if (l.k === 'sport-mix') return t('plan.label.sportMix', { sports: sportNames(l.sports) });
    if (l.k === 'team') return t('plan.label.team', { team: l.team });
    return '';
  }
  function cardHtml(c, idx, flexible) {
    var pr = c.pr, st = api.store.get(), win = c.win;
    var newCount = pr.items.filter(function (it) { return !it.inTrip; }).length;
    var labels = (pr.labels || []).map(labelText).filter(Boolean);
    var head = flexible ? t('plan.window', { k: LETTERS[idx], range: rangeText(win.from, win.to) }) : t('plan.proposal', { k: LETTERS[idx] });
    var reason = flexible ? '<p class="plan-reason">' + esc(t('plan.windowReason', { events: tn('plan.events', pr.events.length), sports: sportNames(pr.facts.sports) })) +
      (pr.facts.freeDays ? ' · ' + esc(tn('plan.freeDays', pr.facts.freeDays)) : '') + '</p>' : '<p class="plan-reason">' + esc(tn('plan.events', pr.events.length) + ' · ' + sportNames(pr.facts.sports) + (pr.facts.freeDays ? ' · ' + tn('plan.freeDays', pr.facts.freeDays) : '')) + '</p>';
    var notes = pr.notes.map(function (n) { return U.noteHtml(n); }).join('');
    var foot = '';
    if (flexible) foot += '<button type="button" class="btn primary" data-pl="choose" data-from="' + win.from + '" data-to="' + win.to + '">' + esc(t('plan.btn.choose')) + '</button>';
    else if (newCount) {
      foot += '<button type="button" class="btn primary" data-pl="add" data-pk="' + esc(pr.key) + '">' + esc(st.trip.entries.length ? t('plan.btn.addN', { n: newCount }) : t('plan.btn.add')) + '</button>';
      if (st.trip.entries.length) foot += '<button type="button" class="btn" data-pl="replace-trip" data-pk="' + esc(pr.key) + '">' + esc(t('plan.btn.replaceTrip')) + '</button>';
    } else foot += '<p class="hint">' + esc(t('plan.allInTrip')) + '</p><button type="button" class="btn" data-pl="to-trip">' + esc(t('plan.btn.toTrip')) + '</button>';
    return '<article class="plan-card" data-pk="' + esc(pr.key) + '" aria-labelledby="plc' + idx + '"><header><h3 id="plc' + idx + '">' + esc(head) + '</h3>' +
      '<p class="plan-preview">' + esc(t('plan.preview')) + '</p>' + (labels.length ? '<p class="plan-labels">' + labels.map(function (x) { return '<span class="tag">' + esc(x) + '</span>'; }).join(' ') + '</p>' : '') + reason + '</header>' +
      dayRows(pr) + (notes ? '<ul class="tnotes plan-notes">' + notes + '</ul>' : '') + '<footer class="plan-foot">' + foot + '</footer></article>';
  }
  function conflictsHtml(r) {
    if (!r.conflicts.length) return '';
    var cat = api.cat, title = function (id) { var e = cat.byId[id]; return e ? e.title : String(id); };
    var items = r.conflicts.map(function (c) {
      if (c.kind === 'locked-outside-window') return t('plan.conflict.lockedOutside', { title: title(c.id), date: M.fmtDate(cat.byId[c.id].date) });
      if (c.kind === 'locked-no-window') return t('plan.conflict.lockedNoWindow', { titles: c.ids.map(title).join(', ') });
      if (c.kind === 'locked-and-excluded') return t('plan.conflict.lockedAndExcluded', { title: title(c.id) });
      if (c.kind === 'locked-missing') return t('plan.conflict.lockedMissing');
      return '';
    }).filter(Boolean);
    return items.length ? '<div class="plan-conflicts" role="alert"><h3>' + esc(t('plan.conflict.title')) + '</h3><ul>' + items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' : '';
  }
  function emptyText(r) {
    var key = { 'no-events': 'noEvents', 'beyond-feed': 'beyondFeed', 'range-too-short': 'rangeTooShort', 'no-start-day': 'noStartDay', 'no-compatible': 'noCompatible', 'locked-conflict': 'lockedConflict' }[r.empty];
    return key ? t('plan.empty.' + key, { last: r.coverage && r.coverage.last ? M.fmtDate(r.coverage.last) : '' }) : '';
  }
  function excludedHtml(st) {
    var ex = st.trip.excluded; if (!ex.length) return '';
    return '<details class="plan-excluded"><summary>' + esc(t('plan.excluded.title', { n: ex.length })) + '</summary><ul>' + ex.map(function (id) {
      var e = api.cat.byId[id], title = e ? e.title : String(id);
      return '<li><span>' + bdi(title) + '</span> <button type="button" class="btn small" data-pl="unexclude" data-id="' + id + '" aria-label="' + esc(t('plan.excluded.restoreNamed', { title: title })) + '">' + esc(t('plan.excluded.restore')) + '</button></li>';
    }).join('') + '</ul></details>';
  }
  function renderResults() {
    var host = $('#plResults', root); if (!host) return;
    var st = api.store.get(), p = ps.params, r = ps.result;
    if (!p) { host.innerHTML = '<p class="empty-note">' + esc(t('plan.needDest')) + '</p>'; return; }
    var flexible = p.mode === 'flexible';
    var head = flexible ? t('plan.range.flex', { range: rangeText(p.from, p.to), n: p.days }) + (p.startWeekdays ? ' · ' + t('plan.range.startDay', { day: M.HE_DAYS_FULL[p.startWeekdays[0]] }) : '') : t('plan.range.fixed', { range: rangeText(p.from, p.to) });
    var html = '<h3 id="plResultsTitle" tabindex="-1" class="plan-results-title">' + esc(flexible ? t('plan.windowsTitle') : t('plan.proposalsTitle')) + '</h3><p class="plan-range">' + esc(head) + '</p>' + conflictsHtml(r);
    if (ps.cards.length) {
      html += '<div class="plan-cards">' + ps.cards.map(function (c, i) { return cardHtml(c, i, flexible); }).join('') + '</div>';
      html += '<p class="hint">' + esc(t('plan.travelNote')) + '</p>';
    } else if (r.empty) html += '<p class="empty-note">' + esc(emptyText(r)) + '</p>';
    if (r.coverage && r.coverage.beyond && r.empty !== 'beyond-feed') html += '<p class="hint">' + esc(t('plan.coverage', { date: M.fmtDate(r.coverage.last) })) + '</p>';
    if (r.unverified) html += '<p class="hint">' + esc(tn('plan.unverified', r.unverified)) + '</p>';
    if (r.unlocated) html += '<p class="hint">' + esc(tn('plan.unlocated', r.unlocated)) + '</p>';
    html += excludedHtml(st);
    html += '<p><button type="button" class="btn small" data-pl="regen">' + esc(t('plan.regen')) + '</button></p>';
    host.innerHTML = html;
  }

  /* ---------- actions on proposals ---------- */
  function cardByKey(pk) { for (var i = 0; i < ps.cards.length; i++) if (ps.cards[i].pr.key === pk) return ps.cards[i]; return null; }
  function entriesOf(pr, st) {
    var have = {}; st.trip.entries.forEach(function (e) { have[e.id] = 1; });
    return pr.items.filter(function (it) { return !have[it.ev.id]; }).map(function (it) {
      return { id: it.ev.id, locked: !!(it.locked || ps.locks[it.ev.id]), addedAt: new Date().toISOString(), snap: M.snapshotOf(it.ev) };
    });
  }
  function focusAfter(sel) { var el = $(sel, root); if (el) el.focus(); }
  function onClick(e) {
    var b = e.target.closest('[data-pl]'); if (!b || !root.contains(b)) return;
    var a = b.getAttribute('data-pl'), id = Number(b.getAttribute('data-id')), pk = b.getAttribute('data-pk'), st = api.store.get();
    if (a === 'to-trip') { api.goTab('trip'); return; }
    if (a === 'team-clear') { ps.team = null; renderUnderstood(null); run(false); return; }
    if (a === 'regen') { run(true); focusAfter('#plResultsTitle'); return; }
    if (a === 'lock') {
      var on = !(ps.locks[id] || st.trip.entries.some(function (x) { return x.id === id && x.locked; }));
      ps.locks[id] = on;
      if (st.trip.entries.some(function (x) { return x.id === id; })) api.store.dispatch({ type: 'TRIP_LOCK', id: id, locked: on });
      api.track('lock_toggle', { locked: on, sport: (api.cat.byId[id] || {}).sportId });
      run(false); api.announce(t(on ? 'plan.item.locked' : 'plan.btn.unlock') + ': ' + (api.cat.byId[id] || {}).title);
      focusAfter('[data-pl="lock"][data-id="' + id + '"]'); return;
    }
    if (a === 'exclude') {
      var ev = api.cat.byId[id]; delete ps.locks[id];
      api.store.dispatch({ type: 'TRIP_EXCLUDE', id: id });
      api.track('exclude_event', { sport: ev && ev.sportId });
      run(false); api.announce(t('plan.excluded.done', { title: ev ? ev.title : '' }));
      focusAfter('#plResultsTitle'); return;
    }
    if (a === 'unexclude') { api.store.dispatch({ type: 'TRIP_UNEXCLUDE', id: id }); run(false); return; }
    if (a === 'replace') {
      var open = ps.replace && ps.replace.pk === pk && ps.replace.id === id;
      ps.replace = open ? null : { pk: pk, id: id }; renderResults();
      if (!open) { var w = $('.plan-alts-wrap', root); if (w) { var f = $('button', w); if (f) f.focus(); } } else focusAfter('[data-pl="replace"][data-id="' + id + '"]');
      return;
    }
    if (a === 'replace-close') { var rid = ps.replace && ps.replace.id; ps.replace = null; renderResults(); if (rid) focusAfter('[data-pl="replace"][data-id="' + rid + '"]'); return; }
    if (a === 'swap') {
      var c = cardByKey(pk), to = Number(b.getAttribute('data-to')), toEv = api.cat.byId[to]; if (!c || !toEv) return;
      var evs = c.pr.events.filter(function (x) { return x.id !== id; }).concat([toEv]);
      c.pr = P.rebuild(ps.params, api.cat, c.pr, evs); ps.replace = null; renderResults();
      api.track('proposal_replace', { sport: toEv.sportId });
      api.announce(t('plan.alt.useNamed', { title: toEv.title })); focusAfter('[data-ev="' + to + '"] .title-btn'); return;
    }
    if (a === 'choose') {
      var from = b.getAttribute('data-from'), toD = b.getAttribute('data-to');
      ps.committing = true;
      api.store.dispatch({ type: 'CONTEXT_COMMIT', dest: st.context.dest, dates: { mode: 'fixed', from: from, to: toD }, browse: false, radiusKm: null });
      ps.committing = false;
      api.track('window_choose', { days: M.diffDays(from, toD) + 1 });
      buildForm(); run(false);
      api.announce(t('plan.chosen', { range: rangeText(from, toD) })); api.showToast(t('plan.chosen', { range: rangeText(from, toD) }), { timeout: 8000 });
      focusAfter('#plResultsTitle'); return;
    }
    if (a === 'add') {
      var cd = cardByKey(pk); if (!cd) return;
      var entries = entriesOf(cd.pr, st), first = !st.trip.entries.length;
      api.store.dispatch({ type: 'TRIP_MERGE', entries: entries });
      api.track('proposal_apply', { mode: 'merge', n: entries.length, pace: ps.params.pace }); if (first && entries.length) api.track('first_event_added', { source: 'plan' });
      var msg = tn('plan.added', entries.length); api.announce(msg); api.showToast(msg, { timeout: 6000 });
      run(false); focusAfter('#plResultsTitle'); return;
    }
    if (a === 'replace-trip') {
      var cr = cardByKey(pk); if (!cr) return;
      if (!window.confirm(t('plan.replaceConfirm'))) return;
      var ents = cr.pr.items.map(function (it) { return { id: it.ev.id, locked: !!(it.locked || ps.locks[it.ev.id]), addedAt: new Date().toISOString(), snap: M.snapshotOf(it.ev) }; });
      api.store.dispatch({ type: 'TRIP_REPLACE', trip: { entries: ents, excluded: st.trip.excluded, arrival: null, departure: null, origin: st.trip.origin } });
      api.track('proposal_apply', { mode: 'replace', n: ents.length, pace: ps.params.pace });
      run(false); focusAfter('#plResultsTitle'); return;
    }
  }

  /* ---------- wiring ---------- */
  function onChange(e) {
    var el = e.target;
    if (el.name === 'plPace') { api.store.dispatch({ type: 'PREFS', pace: el.value }); api.track('pace_change', { pace: el.value }); return; }
    if (el.name === 'plLodging') { api.store.dispatch({ type: 'PREFS', lodging: el.value }); api.track('lodging_change', { lodging: el.value }); return; }
    if (el.id === 'plMax') { ps.maxEvents = el.value ? Number(el.value) : null; run(false); return; }
    if (el.id === 'plMonth' || el.id === 'plDays' || el.id === 'plPart' || el.id === 'plStartDay' || el.id === 'plFrom' || el.id === 'plTo' || (el.name === 'plMode')) { ps.stale = true; showStale(); return; }
  }
  function onInput(e) {
    var el = e.target;
    if (el.id === 'plText') {                                      // typing AND paste fire `input`
      var v = el.value.trim();
      if (!v) { ps.team = null; ps.text = ''; ps.appliedText = ''; renderUnderstood(P.parse('', parseCtx())); run(false); return; }
      ps.text = v; renderUnderstood(P.parse(v, parseCtx()));
    } else if (el.id === 'plDest') { ps.stale = true; showStale(); }
  }
  function onKey(e) {
    if (e.key === 'Enter' && e.target.id === 'plText') { e.preventDefault(); $('#plGo', root).click(); }
  }

  function init() {
    root.innerHTML = '<h2>' + esc(t('plan.title')) + '</h2><p class="hint plan-intro">' + esc(t('plan.intro')) + '</p><div id="plFormHost"></div><div id="plResults" class="plan-results" aria-live="polite"></div>';
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKey);
    root.addEventListener('click', function (e) { if (e.target.closest('#plApply')) { applyText(); } });
    api.store.subscribe(function (st) {
      if (st.ui.tab !== 'plan' || !ps.built) return;
      var sig = ctxSig(st);
      if (ps.committing) return;                                   // this view's own commit: the form already shows these values
      if (sig !== ps.ctxSig) { ps.ctxSig = sig; buildForm(); run(false); return; }
      var s2 = JSON.stringify([st.trip, st.prefs, st.filters]);
      if (s2 !== ps.lastSig) { ps.lastSig = s2; refreshChips(st); run(false); }
    });
  }
  function refreshChips(st) {
    var host = $('#plSports', root); if (host) host.innerHTML = U.sportChipsHtml(sportCounts(st), st.filters.sports);
    $$('input[name="plPace"]', root).forEach(function (r) { r.checked = r.value === st.prefs.pace; });
    $$('input[name="plLodging"]', root).forEach(function (r) { r.checked = r.value === st.prefs.lodging; });
  }

  function render(host, a) {
    api = a; root = host;
    if (!ps) { ps = newState(); init(); }
    var st = api.store.get();
    if (!ps.built || ctxSig(st) !== ps.ctxSig) buildForm();
    ps.lastSig = JSON.stringify([st.trip, st.prefs, st.filters]);
    refreshChips(st);
    run(false);
  }

  TS.planView = { render: render };
})();
