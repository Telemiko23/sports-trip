/* ToSport v2 - controller. Wires the pure layers (model, store, ui) to the DOM: one store owns every transition; this file
   only reads state, renders regions, and turns DOM events into actions. Search/trip/plan share ONE context and ONE trip. */
(function () {
  'use strict';
  var TS = window.ToSport, M = TS.model, S = TS.store, I = TS.i18n, U = TS.ui, combo = TS.combo;
  var t = I.t, tn = I.tn, esc = M.esc;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var BRAND = window.BRAND || { name: 'ToSport', version: '' };
  var UI_VERSION = '2';
  var DATA = window.TRIP_DATA;
  var main = $('#main');
  if (!DATA || !Array.isArray(DATA.fixtures)) { main.innerHTML = '<p class="empty">' + esc(t('app.loadError')) + '</p>'; return; }
  document.title = BRAND.name;

  var cat = M.buildCatalog(DATA), dests = M.buildDestinations(cat);
  var AIRPORTS = window.AIRPORTS_DATA || [];
  var originCity = {}; AIRPORTS.forEach(function (a) { originCity[a.l] = a.c; });
  var airportItems = AIRPORTS.map(function (a) { return { label: a.l, sub: a.grp ? '🌐' : a.c, search: String(a.s || '').toLowerCase() }; });
  function resolveOrigin(text) { var x = String(text || '').trim(); return originCity[x] || x; }
  function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function isMobile() { return !!(window.matchMedia && window.matchMedia('(max-width:760px)').matches); }
  function today() { return M.todayISO(); }

  /* ---------- analytics (non-sensitive, structured; never raw text or whole trips) ---------- */
  function track(name, params) {
    try {
      var p = params || {}; p.ui_version = UI_VERSION;
      if (typeof gtag === 'function' && !window.TOSPORT_ANALYTICS_OFF) gtag('event', name, p);
      if (window.console && console.debug) console.debug('[analytics]', name, p);
    } catch (e) { }
  }

  /* ---------- storage + store ---------- */
  var storage = (function () {
    try { var s = window.localStorage; s.setItem('__tosport_probe', '1'); s.removeItem('__tosport_probe'); return s; }
    catch (e) { return { getItem: function () { throw new Error('unavailable'); }, setItem: function () { throw new Error('unavailable'); } }; }
  })();
  var loaded = S.load(storage, cat);
  var store = S.createStore(loaded.state);
  var bootReport = loaded.report;
  var retDismissed = false;

  /* ---------- derived context ---------- */
  function effectiveCtx() {
    var st = store.get(), c = st.context, f = st.filters;
    var dates = c.dates || { mode: 'fixed', from: today(), to: M.addDays(today(), 30) };
    return { dest: c.dest, dates: dates, range: { from: dates.from, to: dates.to }, radiusKm: c.radiusKm, sports: f.sports, excludedComps: f.excludedComps, excludedWeekdays: f.excludedWeekdays };
  }
  function runQuery(ctx, sports) {
    return M.query(cat, { dest: ctx.dest, dates: ctx.range, radiusKm: ctx.radiusKm, sports: sports === undefined ? ctx.sports : sports, excludedComps: ctx.excludedComps, excludedWeekdays: ctx.excludedWeekdays });
  }
  function pickedMap() { var m = {}; store.get().trip.entries.forEach(function (e) { m[e.id] = true; }); return m; }

  /* ---------- live region + toasts ---------- */
  var liveTimer = null;
  function announce(text) {
    var el = $('#live'); if (!el) return;
    clearTimeout(liveTimer); el.textContent = '';
    liveTimer = setTimeout(function () { el.textContent = text; }, 60);
  }
  function showToast(text, o) {
    o = o || {};
    var box = $('#toasts'), el = document.createElement('div'); el.className = 'toast';
    el.innerHTML = '<span class="toast-text"></span>' + (o.actionLabel ? '<button type="button" class="toast-act"></button>' : '') + '<button type="button" class="toast-x" aria-label="' + esc(t('toast.close')) + '">' + U.icon('x') + '</button>';
    $('.toast-text', el).textContent = text;
    var done = false;
    function close(byAction) { if (done) return; done = true; clearTimeout(tm); if (el.parentNode) el.parentNode.removeChild(el); if (o.onClose) o.onClose(byAction); }
    if (o.actionLabel) { var b = $('.toast-act', el); b.textContent = o.actionLabel; b.addEventListener('click', function () { if (o.onAction) o.onAction(); close(true); }); }
    $('.toast-x', el).addEventListener('click', function () { close(false); });
    var tm = setTimeout(function () { close(false); }, o.timeout || 8000);
    box.appendChild(el);
    return close;
  }

  /* ---------- static chrome ---------- */
  function renderNav() {
    var st = store.get(), n = st.trip.entries.length;
    var nav = $('#mainNav');
    if (!nav.firstChild) nav.innerHTML = U.navHtml(st.ui.tab, n);
    $$('.tab', nav).forEach(function (b) { var on = b.getAttribute('data-tab') === st.ui.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
    var badge = $('[data-trip-count]', nav);
    if (badge) { badge.textContent = n; badge.hidden = !n; badge.setAttribute('aria-label', tn('nav.tripCount', n)); }
  }
  function renderFooter() {
    var upd = DATA.generated ? new Date(DATA.generated).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    var stale = DATA.generated && (Date.now() - Date.parse(DATA.generated)) / 86400000 > 2;
    $('#credits').innerHTML = t('footer.data') + '<div class="credits-row"><button type="button" class="linkbtn" id="legalBtn" aria-haspopup="dialog">' + esc(t('legal.link')) + '</button>' +
      '<span class="version">' + (upd ? '<span' + (stale ? ' class="stale"' : '') + '>' + esc(t('footer.updated', { when: upd })) + '</span> · ' : '') + esc(t('footer.version', { v: BRAND.version })) + '</span></div>';
  }
  $('#skipLink').textContent = t('skip');

  /* ---------- history: Back closes the open dialog, or returns to the previous tab - and never exits mid-flow ---------- */
  var suppressPop = false, poppedByHistory = false;
  function pushHist(state) { try { history.pushState(state, '', location.pathname + location.search + (state.tab ? '#' + state.tab : '')); } catch (e) { } }
  try { history.replaceState({ tab: store.get().ui.tab }, '', location.href); } catch (e) { }
  window.addEventListener('popstate', function (e) {
    if (suppressPop) { suppressPop = false; return; }
    var open = $('dialog[open]');
    if (open) { poppedByHistory = true; open.close(); return; }
    var st = e.state;
    if (st && st.tab && st.tab !== store.get().ui.tab) store.dispatch({ type: 'VIEW', tab: st.tab });
  });

  /* ---------- dialogs ---------- */
  function openDialog(dlg, opener) {
    dlg.__opener = opener || document.activeElement;
    dlg.showModal();
    pushHist({ tab: store.get().ui.tab, dlg: dlg.id });
  }
  $$('dialog').forEach(function (dlg) {
    dlg.addEventListener('close', function () {
      var fromHistory = poppedByHistory; poppedByHistory = false;
      if (!fromHistory && history.state && history.state.dlg === dlg.id) { suppressPop = true; try { history.back(); } catch (e) { suppressPop = false; } }
      var op = dlg.__opener; dlg.__opener = null;
      if (op && document.contains(op) && typeof op.focus === 'function') op.focus();
      else if (op && op.getAttribute && op.getAttribute('data-ev')) { var again = $('[data-open="' + op.getAttribute('data-ev') + '"]'); if (again) again.focus(); }
    });
    // a click on the backdrop (outside the dialog box) closes it
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  });

  /* ---------- destination/date form (first visit and in-place editing) ---------- */
  var forms = {};   // prefix -> {selected}
  function monthOptions() {
    var out = [], d = new Date(); d = new Date(d.getFullYear(), d.getMonth(), 1);
    for (var i = 0; i < 9; i++) {
      out.push({ value: d.getFullYear() + '-' + M.pad(d.getMonth() + 1), label: M.HE_MONTHS[d.getMonth()] + ' ' + d.getFullYear() });
      d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    }
    return out;
  }
  function planMonthOptions() {
    var out = [], d = new Date(); d = new Date(d.getFullYear(), d.getMonth(), 1);
    for (var i = 0; i < 12; i++) { out.push({ value: d.getFullYear() + '-' + M.pad(d.getMonth() + 1), label: M.HE_MONTHS[d.getMonth()] + ' ' + d.getFullYear() }); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
    return out;
  }
  function selectDest(prefix, d) {
    var input = $('#' + prefix + 'Dest'), fs = forms[prefix]; if (!input || !fs) return;
    fs.selected = d; input.value = d.label; setErr(prefix + 'DestErr', ''); input.removeAttribute('aria-invalid');
    var hint = $('#' + prefix + 'DestHint'); if (hint) hint.textContent = destHintFor(d);
  }
  function destItems(q) {
    return M.suggestDestinations(dests, q, 8).map(function (d) { return { label: d.label, sub: d.kind === 'country' ? '' : '', value: d }; });
  }
  function setErr(id, msg) { var el = $('#' + id); if (!el) return; el.hidden = !msg; el.textContent = msg || ''; }
  function destHintFor(d) {
    return d.kind === 'country' ? t('form.destResolvedCountry', { name: d.countryHe }) : t('form.destResolvedCity', { name: d.labelHe, country: d.countryHe });
  }
  function bindContextForm(prefix, onSubmit) {
    var form = $('#' + prefix + 'Form'), input = $('#' + prefix + 'Dest'); if (!form || !input) return;
    var fs = forms[prefix] = { selected: null };
    var curCtx = store.get().context;
    if (curCtx.dest && input.value) { var m = M.matchDestination(dests, input.value); if (m.status === 'resolved') fs.selected = m.dest; }
    function applyResolved(d) { fs.selected = d; setErr(prefix + 'DestErr', ''); input.removeAttribute('aria-invalid'); $('#' + prefix + 'DestHint').textContent = destHintFor(d); }
    combo(input, {
      items: destItems, emptyText: t('form.noResults'), announce: function (txt) { announce(txt); }, countWord: '',
      onSelect: function (it) { applyResolved(it.value); },
      onInput: function (text) {
        if (fs.selected && fs.selected.label !== text) fs.selected = null;
        setErr(prefix + 'DestErr', ''); input.removeAttribute('aria-invalid');
        $('#' + prefix + 'DestHint').textContent = t('form.destHint');
      }
    });
    $$('input[name="' + prefix + 'Mode"]', form).forEach(function (r) {
      r.addEventListener('change', function () { var fx = this.value === 'fixed'; $('#' + prefix + 'Fixed').hidden = !fx; $('#' + prefix + 'Flex').hidden = fx; });
    });
    var rad = $('#' + prefix + 'Radius');
    if (rad) rad.addEventListener('input', function () { $('#' + prefix + 'RadiusOut').textContent = t('form.radiusKm', { n: rad.value }); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var res = readContextForm(prefix); if (!res) return;
      onSubmit(res);
    });
    var br = $('#' + prefix + 'Browse');
    if (br) br.addEventListener('click', function () {
      var dres = readDates(prefix); if (!dres.ok) { if (dres.msg) { setErr(prefix + 'DatesErr', dres.msg); } return; }
      onSubmit({ dest: null, dates: dres.dates, browse: true, radiusKm: null });
    });
    var cn = $('#' + prefix + 'Cancel'); if (cn) cn.addEventListener('click', function () { $('#ctxDialog').close(); });
  }
  function readDates(prefix) {
    var mode = ($('input[name="' + prefix + 'Mode"]:checked') || {}).value || 'fixed';
    setErr(prefix + 'DatesErr', '');
    if (mode === 'flexible') {
      var ym = $('#' + prefix + 'Month').value, n = Number($('#' + prefix + 'Days').value) || 3;
      var from = ym + '-01', to = M.monthEnd(ym);
      var partEl = $('#' + prefix + 'Part'), sdEl = $('#' + prefix + 'StartDay');
      if (partEl && partEl.value && partEl.value !== 'all') {
        var w = TS.planner.monthWindow({ month: Number(ym.slice(5, 7)), year: Number(ym.slice(0, 4)), part: partEl.value }, null);
        if (w) { from = w.from; to = w.to; }
      }
      if (to < today()) { setErr(prefix + 'DatesErr', t('form.datesPast')); return { ok: false }; }
      if (from < today()) from = today();
      return { ok: true, dates: { mode: 'flexible', from: from, to: to, days: n, weekdays: sdEl && sdEl.value !== '' ? [Number(sdEl.value)] : null } };
    }
    var f = $('#' + prefix + 'From').value, to2 = $('#' + prefix + 'To').value;
    if (!M.isISODate(f) || !M.isISODate(to2)) { setErr(prefix + 'DatesErr', t('form.datesMissing')); return { ok: false, msg: t('form.datesMissing') }; }
    if (to2 < f) { setErr(prefix + 'DatesErr', t('form.datesOrder')); return { ok: false, msg: t('form.datesOrder') }; }
    if (to2 < today()) { setErr(prefix + 'DatesErr', t('form.datesPast')); return { ok: false, msg: t('form.datesPast') }; }
    return { ok: true, dates: { mode: 'fixed', from: f, to: to2 } };
  }
  function readContextForm(prefix) {
    var input = $('#' + prefix + 'Dest'), text = input.value.trim(), fs = forms[prefix] || {}, dest = null;
    if (!text) { failDest(prefix, t('form.destRequired')); return null; }
    if (fs.selected && fs.selected.label === text) dest = fs.selected;
    else {
      var m = M.matchDestination(dests, text);
      if (m.status === 'resolved') dest = m.dest;
      else { failDest(prefix, m.status === 'ambiguous' ? t('form.destAmbiguous') : m.status === 'unresolved' ? t('form.destUnresolved') : t('form.destUnknown')); return null; }
    }
    var dres = readDates(prefix); if (!dres.ok) return null;
    var rad = $('#' + prefix + 'Radius');
    return { dest: dest, dates: dres.dates, browse: false, radiusKm: rad ? Number(rad.value) : null };
  }
  function failDest(prefix, msg) { var input = $('#' + prefix + 'Dest'); setErr(prefix + 'DestErr', msg); input.setAttribute('aria-invalid', 'true'); input.focus(); }
  function destToState(d) {
    if (!d) return null;
    return d.kind === 'country' ? { kind: 'country', key: d.key, country: d.country, countryHe: d.countryHe }
      : { kind: 'city', key: d.key, city: d.city || d.labelEn, cityHe: d.cityHe || d.labelHe, country: d.country, countryHe: d.countryHe, lat: d.lat, lng: d.lng };
  }
  function commitContext(res, source) {
    var wasFirst = !store.get().meta.onboarded;
    store.dispatch({ type: 'CONTEXT_COMMIT', dest: destToState(res.dest), dates: res.dates, browse: !!res.browse, radiusKm: res.radiusKm });
    track('context_submit', { source: source, dest_kind: res.dest ? res.dest.kind : 'none', date_mode: res.dates.mode, first_visit: wasFirst });
    retDismissed = true;
    goTab(res.dates.mode === 'flexible' ? 'plan' : 'search');
  }

  /* ---------- onboarding ---------- */
  function showOnboarding(prefill) {
    var el = $('#onboarding'), st = store.get();
    el.innerHTML = U.onboardingHtml(Object.assign({ mode: 'fixed', from: today(), to: M.addDays(today(), 2), months: monthOptions(), month: monthOptions()[0].value, days: 3, destText: '' }, prefill || {}));
    el.hidden = false; $('#app').hidden = true; $('#mainNav').hidden = true; document.body.classList.add('onboarding-active');
    bindContextForm('ob', function (res) { hideOnboarding(); showPanels(); renderPeek(); commitContext(res, 'onboarding'); $('#main').focus(); });
    $('#obDest').focus();
  }
  function hideOnboarding() { $('#onboarding').hidden = true; $('#app').hidden = false; $('#mainNav').hidden = false; document.body.classList.remove('onboarding-active'); }

  /* ---------- search ---------- */
  var searchLimit = 60, lastListCount = 0, lastResult = null;
  function renderSearchSkeletonOnce() { var v = $('#view-search'); if (!v.firstChild) v.innerHTML = U.searchSkeleton(); }
  function retBannerInfo() {
    if (retDismissed) return null;
    var st = store.get();
    if (!st.meta.onboarded) return null;
    var n = st.trip.entries.length, past = st.context.dates && st.context.dates.to < today() ? M.fmtRange(st.context.dates.from, st.context.dates.to) : null;
    if (!n && !past) return null;
    return { tripCount: n, pastRange: past };
  }
  function renderSearch() {
    renderSearchSkeletonOnce();
    var st = store.get(), ctx = effectiveCtx(), ui = st.ui, picked = pickedMap();
    var qBase = runQuery(ctx, null), res = ctx.sports ? runQuery(ctx, ctx.sports) : qBase;
    lastResult = res;
    $('#retBanner').innerHTML = U.retBannerHtml(retBannerInfo());
    $('#ctxBar').innerHTML = U.ctxBarHtml({ dest: ctx.dest, dates: ctx.dates, radiusKm: ctx.radiusKm });
    $('#sportChips').innerHTML = U.sportChipsHtml(M.countBySport(qBase.events), ctx.sports);
    var nF = U.activeFilterCount(st.filters);
    $('#filterBtnText').textContent = nF ? t('filter.buttonCount', { n: nF }) : t('filter.button');
    $('#filterChips').innerHTML = U.filterChipsHtml(st.filters);
    $('#dayBar').innerHTML = U.dayBarHtml(ctx.range.from, ctx.range.to, M.countByDay(res.events), ui.day);
    $$('.viewsw .segbtn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === ui.mode)); });
    var list = ui.day === 'all' ? res.events : res.events.filter(function (e) { return e.date === ui.day; });
    $('#summary').textContent = U.summaryText(list);
    var notices = '';
    if (qBase.noPos && ctx.dest && ctx.dest.kind === 'city') notices += '<p class="notice">' + esc(t('results.noPos', { n: qBase.noPos })) + '</p>';
    if (cat.last && ctx.range.to > cat.last) notices += '<p class="notice">' + esc(t('results.coverage', { date: M.fmtDate(cat.last) })) + '</p>';
    $('#notices').innerHTML = notices;
    var listEl = $('#list');
    if (!list.length) {
      var canGrow = ctx.dest && ctx.dest.kind === 'city' ? Math.min(800, ctx.radiusKm * 2) : 0;
      listEl.innerHTML = U.emptyHtml({ canExtend: ui.day === 'all' && ctx.dates.mode === 'fixed', growTo: canGrow > ctx.radiusKm ? canGrow : 0, sportsActive: !!ctx.sports, filtersActive: nF > 0, dayOnly: ui.day !== 'all' });
    } else {
      var days = M.groupResults(list), shown = [], count = 0, total = 0;
      days.forEach(function (d) { total += d.items.length; });
      for (var i = 0; i < days.length && count < searchLimit; i++) { shown.push(days[i]); count += days[i].items.length; }
      lastListCount = count;
      listEl.innerHTML = U.resultsHtml(shown, { picked: picked, cat: cat, ticketChip: ticketChip }) +
        (count < total ? '<div class="more"><button type="button" class="btn" data-act="more">' + esc(tn('more.show', total - count)) + '</button></div>' : '');
    }
    announce(t('results.announce', { n: list.length }));
    $('#list').hidden = ui.mode === 'map'; $('#mapWrap').hidden = ui.mode !== 'map';
    if (ui.mode === 'map') renderMap(list);
  }

  /* ---------- map (Leaflet is loaded lazily; the list keeps working if it fails) ---------- */
  var mapState = { map: null, layer: null, circle: null, groups: {}, pins: {}, loading: null, key: null };
  var LEAFLET = { css: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css', cssSri: 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H',
    js: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js', jsSri: 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH' };
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (mapState.loading) return mapState.loading;
    mapState.loading = new Promise(function (resolve, reject) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LEAFLET.css; l.integrity = LEAFLET.cssSri; l.crossOrigin = 'anonymous'; document.head.appendChild(l);
      var s = document.createElement('script'); s.src = LEAFLET.js; s.integrity = LEAFLET.jsSri; s.crossOrigin = 'anonymous';
      s.onload = function () { resolve(); }; s.onerror = function () { mapState.loading = null; reject(new Error('leaflet')); };
      document.head.appendChild(s);
    });
    return mapState.loading;
  }
  function renderMap(list) {
    var panel = $('#mapPanel');
    if (!mapState.map) {
      panel.innerHTML = '<p class="panel-empty">' + esc(t('map.loading')) + '</p>';
      loadLeaflet().then(function () {
        if (!window.L) throw new Error('leaflet');
        mapState.map = L.map('map', { scrollWheelZoom: true }).setView([48, 12], 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' }).addTo(mapState.map);
        mapState.layer = L.layerGroup().addTo(mapState.map);
        drawPins(currentList());
      }).catch(function () { panel.innerHTML = '<p class="panel-empty">' + esc(t('map.failed')) + '</p>'; });
      return;
    }
    drawPins(list);
  }
  function currentList() {
    var st = store.get(); if (!lastResult) return [];
    return st.ui.day === 'all' ? lastResult.events : lastResult.events.filter(function (e) { return e.date === st.ui.day; });
  }
  function drawPins(list) {
    if (!mapState.map) return;
    var ctx = effectiveCtx();
    var key = JSON.stringify([ctx.dest, ctx.range, ctx.radiusKm, ctx.sports, ctx.excludedComps, ctx.excludedWeekdays, store.get().ui.day]);
    var changed = key !== mapState.key; mapState.key = key;
    mapState.layer.clearLayers(); if (mapState.circle) { mapState.map.removeLayer(mapState.circle); mapState.circle = null; }
    mapState.groups = {}; mapState.pins = {};
    list.forEach(function (f) {
      var precise = f.venueLat != null && f.venueLng != null, lat = precise ? f.venueLat : f.lat, lng = precise ? f.venueLng : f.lng;
      if (lat == null || lng == null) return;
      var k = lat + ',' + lng + (precise ? '' : '~');
      var g = mapState.groups[k] || (mapState.groups[k] = { cityHe: f.cityHe, city: f.city, venue: precise ? f.venue : null, lat: lat, lng: lng, approx: !precise, list: [], cityLat: f.lat, cityLng: f.lng, country: f.destKey });
      g.list.push(f);
    });
    var keys = Object.keys(mapState.groups);
    keys.forEach(function (k) {
      var g = mapState.groups[k];
      var icon = L.divIcon({ className: '', html: '<div class="map-pin' + (g.approx ? ' approx' : '') + '"><span>' + g.list.length + '</span></div>', iconSize: [30, 30], iconAnchor: [15, 28] });
      mapState.pins[k] = L.marker([g.lat, g.lng], { icon: icon, title: (g.venue || g.cityHe) + (g.approx ? ' - ' + t('map.pinApprox') : ''), keyboard: true }).on('click', function () { selectPin(k); }).addTo(mapState.layer);
      // pins are real keyboard targets: Enter/Space opens the same panel as a click (does not rely on Leaflet's key handling)
      var pinEl = mapState.pins[k].getElement();
      if (pinEl) pinEl.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); selectPin(k); } });
    });
    if (ctx.dest && ctx.dest.kind === 'city') {
      mapState.circle = L.circle([ctx.dest.lat, ctx.dest.lng], { radius: ctx.radiusKm * 1000, color: '#2454E6', weight: 2, fillOpacity: .08, interactive: false }).addTo(mapState.map);
      if (changed) mapState.map.fitBounds(mapState.circle.getBounds(), { padding: [20, 20] });
    } else if (keys.length && changed) mapState.map.fitBounds(keys.map(function (k) { return [mapState.groups[k].lat, mapState.groups[k].lng]; }), { padding: [30, 30], maxZoom: 6 });
    var sel = store.get().ui.pin;
    if (sel && !mapState.groups[sel]) store.dispatch({ type: 'VIEW', pin: null });
    renderMapPanel();
    setTimeout(function () { if (mapState.map) mapState.map.invalidateSize(); }, 50);
  }
  function renderMapPanel() {
    var sel = store.get().ui.pin, g = sel && mapState.groups[sel];
    $('#mapPanel').innerHTML = U.mapPanelHtml(g || null, { picked: pickedMap(), cat: cat, ticketChip: ticketChip });
    $$('.map-pin', $('#map')).forEach(function (p) { p.classList.remove('sel'); });
    if (sel && mapState.pins[sel]) { var el = mapState.pins[sel].getElement(); var pin = el && el.querySelector('.map-pin'); if (pin) pin.classList.add('sel'); }
  }
  function selectPin(k) {
    store.dispatch({ type: 'VIEW', pin: k });          // inspect only: it does NOT change the destination, dates or radius
    renderMapPanel();
    var g = mapState.groups[k];
    if (g) track('map_marker_click', { city: g.cityHe, match_count: g.list.length, precise: !g.approx });
    var pn = $('#mapPanel'); if (pn && pn.scrollIntoView) pn.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }
  function searchHere() {
    var sel = store.get().ui.pin, g = sel && mapState.groups[sel]; if (!g) return;
    var f = g.list[0], ctx = effectiveCtx();
    var dest = { kind: 'city', key: f.city + '|' + f.destKey, city: f.city, cityHe: f.cityHe, country: f.destKey, countryHe: M.countryHe(f.destKey), lat: f.lat, lng: f.lng };
    store.dispatch({ type: 'CONTEXT_COMMIT', dest: dest, dates: ctx.dates, browse: false, radiusKm: ctx.radiusKm });
    track('search_here', { source: 'map' });
  }

  /* ---------- event details ---------- */
  function ticketsHtmlFor(ev) { try { return TS.tickets && TS.tickets.detailHtml ? TS.tickets.detailHtml(ev) : null; } catch (e) { return null; } }
  function ticketChip(ev) { try { return TS.tickets && TS.tickets.chipHtml ? TS.tickets.chipHtml(ev) : ''; } catch (e) { return ''; } }
  function openEvent(id, opener) {
    var ev = cat.byId[id]; if (!ev) return;
    var dlg = $('#evDialog');
    dlg.innerHTML = U.eventDialogHtml(ev, { picked: !!pickedMap()[id], ticketsHtml: ticketsHtmlFor(ev) });
    dlg.setAttribute('data-ev', id);
    openDialog(dlg, opener);
    track('event_details_open', { sport: ev.sportId, title: ev.title, comp: ev.comp, source: 'list' });
  }

  /* ---------- replace one trip entry: alternatives with their consequences, shown before anything changes ---------- */
  function openReplace(id, opener) {
    var st = store.get(), d = tripDerived(), ev = cat.byId[id]; if (!ev) return;
    var evs = d.tes.filter(function (te) { return te.ev; }).map(function (te) { return te.ev; });
    var first = evs[0].date, last = evs[evs.length - 1].date, dt = d.dates;
    var from = dt.arrival && dt.arrival < first ? dt.arrival : first, to = dt.departure && dt.departure > last ? dt.departure : last;
    var dest = st.context.dest || (M.hasPos(ev) ? { kind: 'city', key: ev.city, city: ev.city, cityHe: ev.cityHe, country: ev.country, countryHe: M.countryHe(ev.country), lat: ev.lat, lng: ev.lng } : null);
    var locked = st.trip.entries.filter(function (e) { return e.locked; }).map(function (e) { return e.id; });
    var p = { dest: dest, radiusKm: st.context.radiusKm, mode: 'fixed', from: from, to: to, pace: st.prefs.pace, lodging: st.prefs.lodging, sports: st.filters.sports,
      excludedComps: st.filters.excludedComps, excludedWeekdays: st.filters.excludedWeekdays, excluded: st.trip.excluded.slice(), locked: locked, fixed: st.trip.entries.map(function (e) { return e.id; }) };
    var alts = TS.planner.alternatives(p, cat, { window: { from: from, to: to }, events: evs }, id);
    var dlg = $('#repDialog');
    dlg.innerHTML = '<div class="dlg-head"><h2 id="repTitle">' + esc(t('plan.alt.title', { title: ev.title })) + '</h2><button type="button" class="dialog-close" data-close aria-label="' + esc(t('dialog.close')) + '">' + U.icon('x') + '</button></div>' +
      '<div class="dlg-body">' + TS.planView.altListHtml(alts, ev, function (e) { return 'data-swap-to="' + e.id + '" data-swap-from="' + id + '"'; }) + '</div>';
    openDialog(dlg, opener);
  }
  $('#repDialog').addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) { $('#repDialog').close(); return; }
    var b = e.target.closest('[data-swap-to]'); if (!b) return;
    var from = Number(b.getAttribute('data-swap-from')), to = Number(b.getAttribute('data-swap-to')), nev = cat.byId[to]; if (!nev) return;
    store.dispatch({ type: 'TRIP_SWAP', id: from, to: to, snap: M.snapshotOf(nev), at: new Date().toISOString() });
    track('trip_replace', { sport: nev.sportId });
    announce(t('trip.swapped') + ': ' + nev.title);
    $('#repDialog').close();
  });

  /* ---------- advanced filters (a genuine draft) ---------- */
  function openFilters(opener) {
    store.dispatch({ type: 'DRAFT_OPEN' });
    var dlg = $('#fdDialog'); renderFilterDialog();
    openDialog(dlg, opener); track('filters_sheet_open', {});
  }
  function draftPreviewCount() {
    var st = store.get(), d = st.ui.draft, ctx = effectiveCtx();
    if (!d) return 0;
    return M.query(cat, { dest: ctx.dest, dates: ctx.range, radiusKm: d.radiusKm, sports: ctx.sports, excludedComps: d.excludedComps, excludedWeekdays: d.excludedWeekdays }).events.length;
  }
  function renderFilterDialog() { var d = store.get().ui.draft; if (!d) return; $('#fdDialog').innerHTML = U.filterDialogHtml(d, cat, draftPreviewCount()); }
  function refreshDraftUI() {
    var d = store.get().ui.draft; if (!d) return;
    var n = draftPreviewCount(); var b = $('#fdApply'); if (b) b.textContent = t('fd.apply', { n: n });
    $('#fdRadiusOut').textContent = t('form.radiusKm', { n: d.radiusKm });
    $$('.fd-sport').forEach(function (det) {
      var boxes = $$('input[data-comp]', det), on = boxes.filter(function (x) { return x.checked; }).length, n2 = det.querySelector('summary .n'); if (n2) n2.textContent = '(' + on + '/' + boxes.length + ')';
    });
  }
  function readDraftFromDom() {
    var ec = {}, ew = {};
    $$('#fdDialog input[data-comp]').forEach(function (i) { if (!i.checked) ec[i.getAttribute('data-comp')] = true; });
    $$('#fdDialog input[data-wd]').forEach(function (i) { if (!i.checked) ew[i.getAttribute('data-wd')] = true; });
    store.dispatch({ type: 'DRAFT_SET', excludedComps: ec, excludedWeekdays: ew, radiusKm: Number($('#fdRadius').value) });
    refreshDraftUI();
  }
  $('#fdDialog').addEventListener('input', function (e) { if (e.target.matches('input[data-comp],input[data-wd],#fdRadius')) readDraftFromDom(); });
  $('#fdDialog').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-close') || b.getAttribute('data-fd') === 'cancel') { $('#fdDialog').close(); return; }
    var sp = b.getAttribute('data-fd-sport');
    if (sp) { var on = b.getAttribute('data-on') === '1'; var det = b.closest('.fd-sport'); $$('input[data-comp]', det).forEach(function (i) { i.checked = on; }); readDraftFromDom(); return; }
    if (b.getAttribute('data-fd') === 'reset') {
      $$('#fdDialog input[data-comp],#fdDialog input[data-wd]').forEach(function (i) { i.checked = true; }); readDraftFromDom(); return;
    }
    if (b.getAttribute('data-fd') === 'apply') { store.dispatch({ type: 'DRAFT_APPLY' }); track('filters_apply', {}); $('#fdDialog').close(); }
  });
  $('#fdDialog').addEventListener('close', function () { if (store.get().ui.draft) store.dispatch({ type: 'DRAFT_CANCEL' }); });

  /* ---------- context editing ---------- */
  function openContextDialog(opener, fresh) {
    var st = store.get(), c = st.context, dlg = $('#ctxDialog');
    var d = c.dates, mo = monthOptions();
    var values = fresh ? { mode: 'fixed', from: today(), to: M.addDays(today(), 2), destText: '' }
      : { mode: d && d.mode === 'flexible' ? 'flexible' : 'fixed', from: d ? d.from : today(), to: d ? d.to : M.addDays(today(), 2), days: d && d.days || 3, month: d && d.mode === 'flexible' ? d.from.slice(0, 7) : mo[0].value,
          destText: c.dest ? (c.dest.kind === 'country' ? c.dest.countryHe + ' - כל המדינה' : (c.dest.cityHe + ' (' + c.dest.countryHe + ')')) : '' };
    dlg.innerHTML = '<div class="dlg-head"><h2 id="ctxTitle">' + esc(fresh ? t('form.newSearch') : t('form.editTitle')) + '</h2><button type="button" class="dialog-close" data-close aria-label="' + esc(t('dialog.close')) + '">' + U.icon('x') + '</button></div>' +
      U.contextFormHtml('cx', Object.assign({ months: mo, month: mo[0].value, days: 3, radius: true, radiusKm: c.radiusKm, submitLabel: t('form.save'), showCancel: true, showBrowse: false }, values));
    openDialog(dlg, opener);
    bindContextForm('cx', function (res) { dlg.close(); commitContext(res, fresh ? 'new-search' : 'edit'); });
  }
  $('#ctxDialog').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) $('#ctxDialog').close(); });
  $('#evDialog').addEventListener('click', function (e) { if (e.target.closest('[data-close]')) $('#evDialog').close(); });

  /* ---------- trip ---------- */
  function sourceOf(el) {
    if (el.closest('#mapPanel')) return 'map'; if (el.closest('#view-trip')) return 'trip'; if (el.closest('#view-plan')) return 'plan'; if (el.closest('#evDialog')) return 'detail'; return 'list';
  }
  function toggleTrip(id, source) {
    var ev = cat.byId[id]; var st = store.get(), has = st.trip.entries.some(function (e) { return e.id === id; });
    var title = ev ? ev.title : String(id);
    if (has) {
      store.dispatch({ type: 'TRIP_REMOVE', id: id }); announce(t('live.removed', { title: title }));
      if (ev) track('remove_from_trip', { sport: ev.sportId, comp: ev.comp, country: ev.country, city: ev.city, source: source });
    } else {
      var first = !st.trip.entries.length;
      store.dispatch({ type: 'TRIP_ADD', id: id, snap: ev ? M.snapshotOf(ev) : null, at: new Date().toISOString() }); announce(t('live.added', { title: title }));
      if (ev) track('add_to_trip', { sport: ev.sportId, comp: ev.comp, country: ev.country, city: ev.city, source: source });
      if (first) track('first_event_added', { source: source });
    }
  }
  function patchPicked(ids) {
    var picked = pickedMap();
    ids.forEach(function (id) {
      $$('[data-add="' + id + '"]').forEach(function (b) {
        var on = !!picked[id], title = b.getAttribute('data-title') || '';
        b.setAttribute('aria-pressed', String(on)); b.textContent = on ? t('ev.added') : t('ev.add'); b.setAttribute('aria-label', (on ? t('ev.added') : t('ev.add')) + ': ' + title);
      });
      $$('.ev[data-ev="' + id + '"]').forEach(function (li) { li.classList.toggle('picked', !!picked[id]); });
    });
  }
  function tripDerived() {
    var st = store.get(), tes = M.tripEvents(st.trip, cat);
    var ctxDates = st.context.dates && st.context.dates.mode === 'fixed' ? st.context.dates : null;
    var dates = M.tripDates(st.trip, tes, ctxDates), stays = M.tripStays(tes, dates);
    var links = M.travelLinks(stays, dates, resolveOrigin(st.trip.origin));
    var dated = tes.filter(function (te) { return M.entryDate(te); });
    var days = [], eventDays = {};
    dated.forEach(function (te) { eventDays[M.entryDate(te)] = 1; });
    if (dated.length) {
      var firstEntry = M.entryDate(dated[0]), lastEntry = M.entryDate(dated[dated.length - 1]);
      var from = dates.arrival && dates.arrival < firstEntry ? dates.arrival : firstEntry;
      var to = dates.source === 'derived' ? lastEntry : (dates.departure && dates.departure > lastEntry ? dates.departure : lastEntry);
      var prevEv = null;
      M.eachDay(from, to).forEach(function (d) {
        var es = dated.filter(function (te) { return M.entryDate(te) === d; });
        var day = { date: d, entries: es, noteBefore: null };
        if (es.length && prevEv && es[0].ev) day.noteBefore = M.pairNote(prevEv, es[0].ev);
        days.push(day);
        var withEv = es.filter(function (te) { return te.ev; }); if (withEv.length) prevEv = withEv[withEv.length - 1].ev;
      });
    }
    var cities = []; stays.forEach(function (s) { if (cities.indexOf(s.cityHe || s.city) === -1) cities.push(s.cityHe || s.city); });
    var undated = tes.filter(function (te) { return !M.entryDate(te); });
    return { tes: tes, undated: undated, dates: dates, stays: stays, links: links, days: days, eventDays: Object.keys(eventDays).length, destText: cities.slice(0, 3).join(' · ') + (cities.length > 3 ? '…' : '') };
  }
  function renderTripView() {
    var v = $('#view-trip'), st = store.get(), d = tripDerived();
    var focusSel = null, ae = document.activeElement;
    if (ae && v.contains(ae)) { ['data-lock', 'data-open', 'data-ack', 'data-replace'].forEach(function (a) { if (ae.hasAttribute(a)) focusSel = '[' + a + '="' + ae.getAttribute(a) + '"]'; }); if (ae.id) focusSel = '#' + ae.id; }
    v.innerHTML = U.tripHtml(d, { origin: st.trip.origin, cat: cat, ticketChip: ticketChip });
    var o = $('#origin');
    if (o) combo(o, {
      items: function (q) { var ql = q.toLowerCase(); return airportItems.filter(function (a) { return a.search.indexOf(ql) !== -1 || a.label.toLowerCase().indexOf(ql) !== -1; }).slice(0, 40); }, emptyText: t('form.noResults'),
      onSelect: function (it) { store.dispatch({ type: 'TRIP_ORIGIN', origin: it.label }); track('origin_airport_selected', { airport: it.label }); }
    });
    if (o) o.addEventListener('change', function () { var val = o.value.trim() || S.DEFAULT_ORIGIN; if (val !== store.get().trip.origin) store.dispatch({ type: 'TRIP_ORIGIN', origin: val }); });
    if (focusSel) { var f = $(focusSel, v); if (f) f.focus(); }
  }
  function renderPeek() {
    var st = store.get(), peek = $('#tripPeek'), tes = M.tripEvents(st.trip, cat);
    peek.innerHTML = U.peekHtml(tes, {}); peek.setAttribute('aria-label', t('peek.title'));
    peek.hidden = !tes.length;
    updatePeekLayout();
  }
  // the side summary only exists while searching and only once something is chosen - no empty sidebar
  function updatePeekLayout() { $('#app').classList.toggle('has-peek', !$('#tripPeek').hidden && store.get().ui.tab === 'search'); }
  function exportTrip() {
    var doc = S.exportDoc(store.get(), BRAND.version), blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'), d = new Date();
    a.href = URL.createObjectURL(blob); a.download = 'tosport-trip-' + M.isoOf(d).replace(/-/g, '') + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    track('export_trip', { trip_size: doc.trip.entries.length }); showToast(t('import.exported'));
  }
  var pendingImport = null;
  function handleImportFile(file) {
    if (!file) return;
    if (file.size > S.LIMITS.maxImportBytes) { showToast(t('import.error.too-large')); return; }
    file.text().then(function (text) {
      var res = S.parseImport(text);
      if (!res.ok) { showToast(t('import.error.' + res.error) || t('import.error.not-json')); return; }
      pendingImport = res.doc;
      if (!store.get().trip.entries.length) { applyImport('replace'); return; }
      var dlg = $('#impDialog'), n = res.doc.trip.entries.length;
      dlg.innerHTML = '<div class="dlg-head"><h2 id="impTitle">' + esc(t('import.title')) + '</h2><button type="button" class="dialog-close" data-close aria-label="' + esc(t('dialog.close')) + '">' + U.icon('x') + '</button></div>' +
        '<p>' + esc(tn('import.summary', n)) + '</p><div class="dlg-actions"><button type="button" class="btn primary" data-imp="merge">' + esc(t('import.merge')) + '</button><button type="button" class="btn" data-imp="replace">' + esc(t('import.replace')) + '</button><button type="button" class="btn" data-imp="cancel">' + esc(t('import.cancel')) + '</button></div>';
      openDialog(dlg);
    }, function () { showToast(t('import.error.not-text')); });
  }
  function applyImport(mode) {
    if (!pendingImport) return;
    store.dispatch({ type: 'IMPORT_APPLY', doc: pendingImport, mode: mode }); track('import_trip', { mode: mode, trip_size: pendingImport.trip.entries.length });
    pendingImport = null; showToast(t('import.done')); $('#importFile').value = '';
  }
  $('#impDialog').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-close') || b.getAttribute('data-imp') === 'cancel') { pendingImport = null; $('#impDialog').close(); return; }
    var m = b.getAttribute('data-imp'); if (m) { applyImport(m); $('#impDialog').close(); }
  });
  $('#importFile').addEventListener('change', function (e) { handleImportFile(e.target.files && e.target.files[0]); });

  /* ---------- tabs ---------- */
  function showPanels() {
    var tab = store.get().ui.tab;
    ['search', 'plan', 'trip'].forEach(function (k) { $('#view-' + k).hidden = k !== tab; });
    renderNav();
    $('#tripPeek').classList.toggle('on-search', tab === 'search');
    updatePeekLayout();
  }
  function goTab(tab) {
    if (store.get().ui.tab === tab) return;
    store.dispatch({ type: 'VIEW', tab: tab });
    pushHist({ tab: tab });
    if (isMobile()) window.scrollTo({ top: 0, behavior: 'auto' });
    track('tab_change', { tab: tab });
  }
  $('#mainNav').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) goTab(b.getAttribute('data-tab')); });
  $('#mainNav').addEventListener('keydown', function (e) {
    var tabs = $$('.tab', $('#mainNav')), i = tabs.indexOf(document.activeElement); if (i < 0) return;
    var rtl = document.documentElement.dir === 'rtl', next = null;
    if (e.key === 'ArrowLeft') next = rtl ? i + 1 : i - 1; else if (e.key === 'ArrowRight') next = rtl ? i - 1 : i + 1; else if (e.key === 'Home') next = 0; else if (e.key === 'End') next = tabs.length - 1;
    if (next == null) return;
    e.preventDefault(); next = (next + tabs.length) % tabs.length; tabs[next].focus(); goTab(tabs[next].getAttribute('data-tab'));
  });

  /* ---------- plan (placeholder until the planner slice) ---------- */
  function renderPlan() { var v = $('#view-plan'); if (TS.planView && TS.planView.render) TS.planView.render(v, api); }

  /* ---------- delegated actions ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target : null; if (!el) return;
    var b;
    if ((b = el.closest('[data-add]'))) { toggleTrip(Number(b.getAttribute('data-add')), sourceOf(b)); return; }
    if ((b = el.closest('[data-open]'))) { openEvent(Number(b.getAttribute('data-open')), b); return; }
    if ((b = el.closest('[data-replace]'))) { openReplace(Number(b.getAttribute('data-replace')), b); return; }
    if ((b = el.closest('[data-remove]'))) { var id = Number(b.getAttribute('data-remove')); var ev = cat.byId[id]; store.dispatch({ type: 'TRIP_REMOVE', id: id }); announce(t('live.removed', { title: ev ? ev.title : '' })); return; }
    if ((b = el.closest('[data-lock]'))) { var lid = Number(b.getAttribute('data-lock')); var cur = store.get().trip.entries.filter(function (x) { return x.id === lid; })[0]; store.dispatch({ type: 'TRIP_LOCK', id: lid, locked: !(cur && cur.locked) }); track('lock_event', { locked: !(cur && cur.locked) }); return; }
    if ((b = el.closest('[data-ack]'))) { var aid = Number(b.getAttribute('data-ack')); var aev = cat.byId[aid]; if (aev) store.dispatch({ type: 'TRIP_ACK', id: aid, snap: M.snapshotOf(aev) }); return; }
    if ((b = el.closest('[data-day]'))) { store.dispatch({ type: 'VIEW', day: b.getAttribute('data-day') }); return; }
    if ((b = el.closest('[data-sport]'))) { toggleSport(b.getAttribute('data-sport')); return; }
    if ((b = el.closest('[data-unfilter]'))) { var k = b.getAttribute('data-unfilter'), f = store.get().filters; store.dispatch({ type: 'FILTERS_SET', filters: { sports: f.sports, excludedComps: k === 'comps' ? {} : f.excludedComps, excludedWeekdays: k === 'days' ? {} : f.excludedWeekdays } }); return; }
    if ((b = el.closest('[data-mode]'))) { store.dispatch({ type: 'VIEW', mode: b.getAttribute('data-mode') }); track('view_toggle', { view: b.getAttribute('data-mode') }); return; }
    if ((b = el.closest('[data-searchday]'))) { var day = b.getAttribute('data-searchday'); store.dispatch({ type: 'VIEW', tab: 'search', day: day }); pushHist({ tab: 'search' }); return; }
    if ((b = el.closest('[data-link]'))) {
      var lk = b.getAttribute('data-link');
      if (lk === 'ticket' || lk === 'official-tickets') { var tev = cat.byId[Number($('#evDialog').getAttribute('data-ev'))]; track('ticket_link_click', { kind: lk, provider: b.getAttribute('data-tix-provider') || 'official', ticket_state: b.getAttribute('data-tix-state') || 'official', scope: b.getAttribute('data-tix-scope') || '', sport: tev ? tev.sportId : '' }); }
      else track(lk === 'flight' ? 'flight_link_click' : 'hotel_link_click', {});
      return;
    }
    if ((b = el.closest('[data-act]'))) { handleAct(b.getAttribute('data-act'), b); return; }
    if (el.closest('#filterBtn')) { openFilters(el.closest('#filterBtn')); return; }
    if (el.closest('#ctxEdit')) { openContextDialog(el.closest('#ctxEdit'), false); return; }
    if (el.closest('#legalBtn')) { var ld = $('#legalDialog'); ld.innerHTML = '<div class="dlg-head"><h2 id="legalTitle">' + esc(t('legal.title')) + '</h2><button type="button" class="dialog-close" data-close aria-label="' + esc(t('dialog.close')) + '">' + U.icon('x') + '</button></div>' + ['p1', 'p2', 'p3', 'p4', 'p5'].map(function (p) { return '<p>' + esc(t('legal.' + p)) + '</p>'; }).join(''); openDialog(ld, el.closest('#legalBtn')); return; }
    if (el.closest('#legalDialog [data-close]')) { $('#legalDialog').close(); return; }
    if (el.closest('#copyTrip')) { copyTrip(el.closest('#copyTrip')); return; }
    if (el.closest('#exportTrip')) { exportTrip(); return; }
    if (el.closest('#clearTrip')) { if (window.confirm(t('actions.clearConfirm'))) { track('clear_trip', { trip_size: store.get().trip.entries.length }); store.dispatch({ type: 'TRIP_CLEAR' }); } return; }
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'daySelect') { store.dispatch({ type: 'VIEW', day: el.value }); return; }
    if (el.id === 'tArr' || el.id === 'tDep') {
      var arr = $('#tArr').value || null, dep = $('#tDep').value || null; var d = tripDerived().dates;
      store.dispatch({ type: 'TRIP_DATES', arrival: arr || d.arrival, departure: dep || d.departure }); return;
    }
  });
  function toggleSport(id) {
    var f = store.get().filters, cur = f.sports ? f.sports.slice() : [];
    if (id === 'all') { store.dispatch({ type: 'SPORTS_SET', sports: null }); track('sports_filter', { sports: 'all' }); return; }
    var i = cur.indexOf(id); if (i === -1) cur.push(id); else cur.splice(i, 1);
    store.dispatch({ type: 'SPORTS_SET', sports: cur.length ? cur : null }); track('sports_filter', { sports: cur.join(',') });
  }
  function copyTrip(btn) {
    var txt = M.tripText(M.tripEvents(store.get().trip, cat)); track('copy_trip', { trip_size: store.get().trip.entries.length });
    var done = function () { btn.textContent = t('actions.copied'); setTimeout(function () { btn.textContent = t('actions.copy'); }, 2500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); }); else { fallbackCopy(txt); done(); }
  }
  function fallbackCopy(txt) { var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) { } document.body.removeChild(ta); }
  function handleAct(act, el) {
    var ctx = effectiveCtx();
    switch (act) {
      case 'more': { var before = $$('#list .title-btn, #list .group-days summary').length; searchLimit += 60; renderSearch(); var after = $$('#list .title-btn, #list .group-days summary'); if (after[before]) after[before].focus(); break; }
      case 'extend-dates': { var d = ctx.dates; store.dispatch({ type: 'CONTEXT_COMMIT', dest: store.get().context.dest, dates: { mode: 'fixed', from: d.from, to: M.addDays(d.to, 7) }, browse: store.get().context.browse, radiusKm: ctx.radiusKm }); break; }
      case 'grow-radius': store.dispatch({ type: 'CONTEXT_RADIUS', km: Number(el.getAttribute('data-km')) }); break;
      case 'all-sports': store.dispatch({ type: 'SPORTS_SET', sports: null }); break;
      case 'reset-filters': store.dispatch({ type: 'FILTERS_RESET' }); track('filters_reset', {}); break;
      case 'map-close': store.dispatch({ type: 'VIEW', pin: null }); renderMapPanel(); break;
      case 'search-here': searchHere(); break;
      case 'go-search': goTab('search'); break;
      case 'go-plan': goTab('plan'); break;
      case 'import-trip': $('#importFile').click(); break;
      case 'dates-auto': store.dispatch({ type: 'TRIP_DATES', arrival: null, departure: null }); break;
      case 'continue-trip': retDismissed = true; goTab('trip'); renderSearch(); break;
      case 'new-search': retDismissed = true; openContextDialog(el, true); break;
      case 'pick-dates': retDismissed = true; openContextDialog(el, false); break;
      case 'dismiss-banner': retDismissed = true; renderSearch(); break;
      default: break;
    }
  }
  /* ---------- state -> view ---------- */
  var sig = {};
  function sigOf(st) {
    return { ctx: JSON.stringify([st.context, st.filters]), view: JSON.stringify([st.ui.tab, st.ui.mode, st.ui.day]), pin: String(st.ui.pin), trip: JSON.stringify(st.trip), prefs: JSON.stringify(st.prefs), meta: JSON.stringify(st.meta), undo: st.ui.undo ? st.ui.undo.kind + ':' + (st.ui.undo.entry ? st.ui.undo.entry.id : '') : '' };
  }
  function persist(st) { if (!S.save(storage, st) && store.get().ui.storageOk !== false) { /* storage became unavailable mid-session */ } }
  var undoClose = null, undoSeq = 0;
  function onState(st) {
    var s = sigOf(st), prev = sig; sig = s;
    var tabChanged = !!prev.view && JSON.parse(s.view)[0] !== JSON.parse(prev.view)[0];
    if (s.ctx !== prev.ctx || s.view !== prev.view) { if (!$('#app').hidden) { searchLimit = 60; renderSearch(); } }
    if (s.pin !== prev.pin && st.ui.mode === 'map') renderMapPanel();
    if (s.trip !== prev.trip) {
      var oldIds = {}, newIds = {}; try { JSON.parse(prev.trip || '{"entries":[]}').entries.forEach(function (e) { oldIds[e.id] = 1; }); } catch (e) { }
      st.trip.entries.forEach(function (e) { newIds[e.id] = 1; });
      var changedIds = Object.keys(oldIds).concat(Object.keys(newIds)).filter(function (k) { return !!oldIds[k] !== !!newIds[k]; }).map(Number);
      patchPicked(changedIds); renderNav(); renderPeek();
      if (st.ui.tab === 'trip' || $('#view-trip').firstChild) renderTripView();
      if (mapState.map) renderMapPanel();
      var dlg = $('#evDialog'); if (dlg.open) { var id = Number(dlg.getAttribute('data-ev')); if (id) patchPicked([id]); }
    }
    if (s.view !== prev.view) {
      showPanels();
      if (st.ui.tab === 'trip') renderTripView();
      if (st.ui.tab === 'plan') renderPlan();
      if (tabChanged && st.ui.tab === 'search' && st.ui.mode === 'map' && mapState.map) setTimeout(function () { mapState.map.invalidateSize(); }, 50);
    }
    if (s.undo !== prev.undo && st.ui.undo) {
      if (undoClose) undoClose(true);
      var u = st.ui.undo, my = ++undoSeq;
      undoClose = showToast(u.kind === 'clear' ? t('trip.cleared') : u.kind === 'replace' ? t('trip.replaced') : u.kind === 'swap' ? t('trip.swapped') : t('trip.removed'), { actionLabel: t('trip.undo'), timeout: 9000,
        onAction: function () { store.dispatch({ type: 'TRIP_UNDO' }); },
        onClose: function (byAction) { if (!byAction && my === undoSeq && store.get().ui.undo) store.dispatch({ type: 'UNDO_DISMISS' }); } });
    }
    if (s.ctx !== prev.ctx || s.trip !== prev.trip || s.prefs !== prev.prefs || s.meta !== prev.meta) persist(st);
  }
  store.subscribe(onState);

  /* ---------- boot ---------- */
  function boot() {
    renderFooter();
    var st = store.get();
    sig = sigOf(st);
    var hash = (location.hash || '').replace('#', '');
    if (['search', 'plan', 'trip'].indexOf(hash) !== -1 && st.meta.onboarded) store.dispatch({ type: 'VIEW', tab: hash });
    st = store.get();
    renderNav();
    var needOnboarding = !st.context.dest && !st.context.browse && !st.meta.onboarded;
    if (!st.ui.storageOk) showToast(t('storage.off'), { timeout: 12000 });
    var storageIssues = bootReport.issues && bootReport.issues.some(function (x) { return /malformed|bad-id|not-array/.test(x); });
    if (storageIssues) showToast(t('storage.issues'), { timeout: 12000 });
    else if (bootReport.migrated) showToast(t('storage.migrated'), { timeout: 12000 });
    if (needOnboarding) { showOnboarding(); }
    else {
      hideOnboarding(); showPanels(); renderSearch(); renderPeek();
      if (st.ui.tab === 'trip') renderTripView();
      if (st.ui.tab === 'plan') renderPlan();
    }
    S.save(storage, store.get());
    store.dispatch({ type: 'META', lastVisit: today() });
  }
  /* ---------- ticket enrichment: lazy, optional, can never break the rest ---------- */
  var tixTimer = null;
  function rerenderTickets() {
    if (!$('#app').hidden) renderSearch();
    if (store.get().ui.tab === 'trip') renderTripView();
    var dlg = $('#evDialog'); if (dlg.open) { var id = Number(dlg.getAttribute('data-ev')); var ev = cat.byId[id]; if (ev) { var sec = $('#evTixBody', dlg); if (sec) sec.innerHTML = ticketsHtmlFor(ev) || '<p class="hint">' + esc(t('ev.ticketsNone')) + '</p>'; } }
    scheduleTixTick();
  }
  function scheduleTixTick() {
    clearTimeout(tixTimer);
    if (!TS.tickets) return;
    var next = TS.tickets.nextExpiry(Date.now());
    if (next != null) tixTimer = setTimeout(rerenderTickets, Math.min(Math.max(next - Date.now() + 1000, 1000), 2147000000));
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && TS.tickets && TS.tickets.status().hasData) rerenderTickets(); });
  function loadTickets() {
    if (!TS.tickets || window.TOSPORT_TICKETS_OFF) return;
    TS.tickets.load('tickets/offers.json').then(function (doc) {
      if (doc) { track('ticket_data_state', { state: 'loaded', priced: !!doc.priceDisplay }); rerenderTickets(); }
      else track('ticket_data_state', { state: TS.tickets.status().failed ? 'unavailable' : 'none' });
    });
  }
  var api = { bindContextForm: bindContextForm, readContextForm: readContextForm, selectDest: selectDest, monthOptions: planMonthOptions, setErr: setErr, openDialog: openDialog, store: store, cat: cat, model: M, ui: U, announce: announce, showToast: showToast, track: track, goTab: goTab, effectiveCtx: effectiveCtx, runQuery: runQuery, today: today, openEvent: openEvent, toggleTrip: toggleTrip, tripDerived: tripDerived, dests: dests, resolveOrigin: resolveOrigin };
  window.ToSport.app = api;
  boot();
  (window.requestIdleCallback || function (f) { setTimeout(f, 800); })(loadTickets);
})();
