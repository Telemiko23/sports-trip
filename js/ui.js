/* ToSport v2 - HTML builders (pure string functions: no DOM, no storage). One event presentation is shared by the list,
   the map panel, proposals, the itinerary and the details dialog; density is a parameter, meaning is not.
   Every dynamic value goes through esc()/safeImg()/M.safeUrl() before it reaches innerHTML. */
(function (root, factory) {
  var api = factory(typeof require === 'function' && typeof module === 'object' ? require('./model.js') : root.ToSport.model,
    typeof require === 'function' && typeof module === 'object' ? require('./i18n.js') : root.ToSport.i18n);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ToSport = root.ToSport || {}; root.ToSport.ui = api; }
})(typeof self !== 'undefined' ? self : this, function (M, I) {
  'use strict';
  var esc = M.esc;
  function t(k, p) { return I.t(k, p); }
  function tn(k, n, p) { return I.tn(k, n, p); }

  var ICO = {
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>',
    plan: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    trip: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    filter: '<path d="M4 6h16M4 12h16M4 18h11"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    map: '<path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5zM9 4v14M15 6.5v14"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(name) { return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICO[name] + '</svg>'; }
  // images come from our own folders or the football API's media host only
  function safeImg(u) {
    if (typeof u !== 'string') return null;
    if (/^(logos|comp_logos|flags)\/[\w.\-]+$/.test(u)) return u;
    if (/^https:\/\/media\.api-sports\.io\/[\w\/.\-]+$/.test(u)) return u;
    return null;
  }
  function bdi(s) { return '<bdi dir="auto">' + esc(s) + '</bdi>'; }

  /* ---------- navigation (ONE element: top tabs on desktop, bottom bar on mobile - CSS decides) ---------- */
  function navHtml(active, tripCount) {
    return '<div class="tabbar" role="tablist" aria-label="' + esc(t('nav.label')) + '">' + ['search', 'plan', 'trip'].map(function (k) {
      var on = active === k;
      return '<button type="button" role="tab" class="tab" id="tab-' + k + '" data-tab="' + k + '" aria-selected="' + on + '" aria-controls="view-' + k + '" tabindex="' + (on ? 0 : -1) + '">' +
        icon(k) + '<span class="tab-label">' + esc(t('nav.' + k)) + '</span>' +
        (k === 'trip' ? '<b class="tab-badge" data-trip-count' + (tripCount ? '' : ' hidden') + ' aria-label="' + esc(tn('nav.tripCount', tripCount)) + '">' + tripCount + '</b>' : '') + '</button>';
    }).join('') + '</div>';
  }

  /* ---------- the destination/dates form (first visit and in-place editing share it) ---------- */
  function contextFormHtml(p, o) {
    o = o || {};
    var fixed = o.mode !== 'flexible';
    var months = (o.months || []).map(function (m) { return '<option value="' + esc(m.value) + '"' + (m.value === o.month ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('');
    var durations = [2, 3, 4, 5, 7, 10, 14].map(function (n) { return '<option value="' + n + '"' + (n === (o.days || 3) ? ' selected' : '') + '>' + esc(t('form.durationDays', { n: n })) + '</option>'; }).join('');
    return '<form id="' + p + 'Form" class="ctx-form" novalidate>' +
      '<div class="field"><label for="' + p + 'Dest">' + esc(t('form.dest')) + '</label>' +
      '<div class="combo-wrap"><input id="' + p + 'Dest" type="text" value="' + esc(o.destText || '') + '" placeholder="' + esc(t('form.destPlaceholder')) + '" aria-describedby="' + p + 'DestHint ' + p + 'DestErr"></div>' +
      '<p class="hint" id="' + p + 'DestHint">' + esc(o.destHint || t('form.destHint')) + '</p>' +
      '<p class="field-error" id="' + p + 'DestErr" role="alert" hidden></p></div>' +
      '<fieldset class="dates"><legend>' + esc(t('form.dates')) + '</legend>' +
      '<div class="seg" role="radiogroup" aria-label="' + esc(t('form.dates')) + '">' +
      '<label class="segopt"><input type="radio" name="' + p + 'Mode" value="fixed"' + (fixed ? ' checked' : '') + '><span>' + esc(t('form.fixed')) + '</span></label>' +
      '<label class="segopt"><input type="radio" name="' + p + 'Mode" value="flexible"' + (fixed ? '' : ' checked') + '><span>' + esc(t('form.flexible')) + '</span></label></div>' +
      '<div class="row2" id="' + p + 'Fixed"' + (fixed ? '' : ' hidden') + '>' +
      '<label>' + esc(t('form.from')) + '<input id="' + p + 'From" type="date" value="' + esc(o.from || '') + '"></label>' +
      '<label>' + esc(t('form.to')) + '<input id="' + p + 'To" type="date" value="' + esc(o.to || '') + '"></label></div>' +
      '<div class="row2" id="' + p + 'Flex"' + (fixed ? ' hidden' : '') + '>' +
      '<label>' + esc(t('form.month')) + '<select id="' + p + 'Month">' + months + '</select></label>' +
      '<label>' + esc(t('form.duration')) + '<select id="' + p + 'Days">' + durations + '</select></label>' +
      '<p class="hint span-all">' + esc(t('form.flexNote')) + '</p></div>' +
      '<p class="field-error" id="' + p + 'DatesErr" role="alert" hidden></p></fieldset>' +
      (o.radius ? '<div class="field"><label for="' + p + 'Radius">' + esc(t('form.radius')) + ': <output id="' + p + 'RadiusOut">' + esc(t('form.radiusKm', { n: o.radiusKm || 150 })) + '</output></label>' +
        '<input id="' + p + 'Radius" type="range" min="10" max="800" step="10" value="' + (o.radiusKm || 150) + '"></div>' : '') +
      '<div class="form-actions"><button type="submit" class="btn primary" id="' + p + 'Go">' + esc(o.submitLabel || t('form.go')) + '</button>' +
      (o.showBrowse ? '<button type="button" class="linkbtn" id="' + p + 'Browse">' + esc(t('ob.browse')) + '</button>' : '') +
      (o.showCancel ? '<button type="button" class="btn" id="' + p + 'Cancel">' + esc(t('form.cancel')) + '</button>' : '') + '</div></form>';
  }
  function onboardingHtml(o) {
    return '<div class="onboarding-card"><h2 id="obTitle">' + esc(t('ob.title')) + '</h2><p>' + esc(t('ob.sub')) + '</p>' +
      contextFormHtml('ob', Object.assign({ showBrowse: true }, o || {})) + '</div>';
  }

  /* ---------- search screen ---------- */
  function searchSkeleton() {
    return '<div id="retBanner"></div><div id="ctxBar" class="ctxbar"></div>' +
      '<div class="toolbar"><div id="sportChips" class="sportchips" role="group" aria-label="' + esc(t('sports.label')) + '"></div>' +
      '<div class="toolbar-actions"><button type="button" class="btn small" id="filterBtn" aria-haspopup="dialog">' + icon('filter') + '<span id="filterBtnText">' + esc(t('filter.button')) + '</span></button>' +
      '<div class="seg viewsw" role="group" aria-label="' + esc(t('view.label')) + '">' +
      '<button type="button" class="segbtn" data-mode="list" aria-pressed="true">' + icon('list') + esc(t('view.list')) + '</button>' +
      '<button type="button" class="segbtn" data-mode="map" aria-pressed="false">' + icon('map') + esc(t('view.map')) + '</button></div></div></div>' +
      '<div id="filterChips" class="fchips"></div><div id="dayBar" class="daybar"></div>' +
      '<p id="summary" class="summary" aria-live="polite"></p><div id="notices"></div><div id="list"></div>' +
      '<div id="mapWrap" hidden><p class="hint" id="mapHint">' + esc(t('map.hint')) + '</p><div id="map" role="region" aria-label="' + esc(t('view.map')) + '"></div><div id="mapPanel" class="map-panel" aria-live="polite"></div></div>';
  }
  function destLabel(ctx) {
    var d = ctx.dest;
    if (!d) return t('ctx.destNone');
    return d.kind === 'country' ? t('ctx.destCountry', { name: d.countryHe || d.country }) : t('ctx.destCity', { name: d.cityHe || d.city });
  }
  function ctxBarHtml(ctx) {
    var flexBtn = ctx.dates && ctx.dates.mode === 'flexible' ? '<button type="button" class="btn small primary" data-act="go-plan">' + esc(t('ctx.flexPick')) + '</button>' : '';
    var d = ctx.dest, dates = ctx.dates, scope;
    if (!d) scope = t('ctx.scopeNone');
    else if (d.kind === 'country') scope = t('ctx.scopeCountry');
    else scope = t('ctx.scope', { n: ctx.radiusKm });
    var when = !dates ? '' : dates.mode === 'flexible'
      ? t('ctx.flex', { range: M.fmtRange(dates.from, dates.to), n: dates.days }) : M.fmtRange(dates.from, dates.to);
    return '<div class="ctx-summary" role="group" aria-label="' + esc(t('ctx.label')) + '">' +
      '<span class="ctx-dest">' + icon('trip') + bdi(destLabel(ctx)) + '</span>' +
      (when ? '<span class="ctx-dates">' + bdi(when) + '</span>' : '') + '<span class="ctx-scope">' + esc(scope) + '</span></div>' +
      flexBtn + '<button type="button" class="btn small" id="ctxEdit" aria-haspopup="dialog">' + esc(t('ctx.edit')) + '</button>';
  }
  function retBannerHtml(o) {
    if (!o) return '';
    var parts = '<div class="banner" role="region" aria-label="' + esc(t('ret.welcome')) + '"><div><strong>' + esc(t('ret.welcome')) + '</strong>' +
      (o.tripCount ? ' · ' + esc(tn('ret.trip', o.tripCount)) : '') + (o.pastRange ? '<p>' + esc(t('ret.pastDates', { range: o.pastRange })) + '</p>' : '') + '</div><div class="banner-actions">';
    if (o.tripCount) parts += '<button type="button" class="btn small primary" data-act="continue-trip">' + esc(t('ret.continue')) + '</button>';
    parts += '<button type="button" class="btn small" data-act="' + (o.pastRange ? 'pick-dates' : 'new-search') + '">' + esc(o.pastRange ? t('ret.pickDates') : t('ret.new')) + '</button>' +
      '<button type="button" class="linkbtn" data-act="dismiss-banner">' + esc(t('ret.dismiss')) + '</button></div></div>';
    return parts;
  }
  function sportChipsHtml(counts, selected) {
    var ids = Object.keys(M.SPORT_REGISTRY).filter(function (k) { return k !== 'unknown' && (counts[k] || (selected && selected.indexOf(k) !== -1)); })
      .sort(function (a, b) { return M.SPORT_REGISTRY[a].order - M.SPORT_REGISTRY[b].order; });
    if (counts.unknown) ids.push('unknown');
    var all = !selected || !selected.length;
    return '<button type="button" class="chipbtn" data-sport="all" aria-pressed="' + all + '">' + esc(t('sports.all')) + '</button>' + ids.map(function (k) {
      var on = !all && selected.indexOf(k) !== -1;
      return '<button type="button" class="chipbtn" data-sport="' + k + '" aria-pressed="' + on + '">' + esc(M.SPORT_REGISTRY[k].he) + (counts[k] != null ? ' <span class="n">' + counts[k] + '</span>' : '') + '</button>';
    }).join('');
  }
  function activeFilterCount(f) { return Object.keys(f.excludedComps || {}).length + Object.keys(f.excludedWeekdays || {}).length; }
  function filterChipsHtml(f) {
    var nc = Object.keys(f.excludedComps || {}).length, nd = Object.keys(f.excludedWeekdays || {}).length;
    if (!nc && !nd) return '';
    var chip = function (key, text) { return '<span class="fchip"><span>' + esc(text) + '</span><button type="button" data-unfilter="' + key + '" aria-label="' + esc(t('fchip.remove') + ': ' + text) + '">' + icon('x') + '</button></span>'; };
    return (nc ? chip('comps', t('fchip.comps', { n: nc })) : '') + (nd ? chip('days', t('fchip.days', { n: nd })) : '') +
      '<button type="button" class="linkbtn" data-act="reset-filters" title="' + esc(t('filters.resetScope')) + '">' + esc(t('filters.reset')) + '</button>';
  }
  function dayBarHtml(from, to, counts, selected) {
    if (!from || !to) return '';
    var days = M.eachDay(from, to);
    if (days.length < 2) return '';
    var allBtn = '<button type="button" class="daybtn daybtn--all" data-day="all" aria-pressed="' + (selected === 'all') + '">' + esc(t('days.all')) + '</button>';
    if (days.length > 10) {
      return '<label class="dayselect"><span>' + esc(t('days.select')) + '</span><select id="daySelect" aria-label="' + esc(t('days.label')) + '"><option value="all"' + (selected === 'all' ? ' selected' : '') + '>' + esc(t('days.all')) + '</option>' +
        days.map(function (d) { return '<option value="' + d + '"' + (selected === d ? ' selected' : '') + '>' + esc(M.fmtDateLong(d) + ' (' + (counts[d] || 0) + ')') + '</option>'; }).join('') + '</select></label>';
    }
    return '<div class="dayrow" role="group" aria-label="' + esc(t('days.label')) + '">' + allBtn + days.map(function (d) {
      var dt = M.parseDay(d), n = counts[d] || 0;
      return '<button type="button" class="daybtn' + (n ? '' : ' daybtn--zero') + '" data-day="' + d + '" aria-pressed="' + (selected === d) + '" aria-label="' + esc(M.fmtDateLong(d) + ' · ' + tn('days.count', n)) + '">' +
        '<span class="wd">' + esc(M.HE_DAYS[dt.getDay()]) + '</span><b>' + dt.getDate() + '</b><small>' + n + '</small></button>';
    }).join('') + '</div>';
  }
  function summaryText(list) {
    if (!list.length) return '';
    var days = {}, groups = {}, groupDays = 0;
    list.forEach(function (f) { days[f.date] = 1; if (f.parentId) { groups[f.parentId] = (groups[f.parentId] || 0) + 1; } });
    Object.keys(groups).forEach(function (k) { if (groups[k] >= 3) groupDays += groups[k]; else delete groups[k]; });
    var nd = Object.keys(days).length, g = Object.keys(groups).length;
    return g ? t('results.summaryGroups', { n: list.length, d: nd, m: groupDays, g: g }) : t('results.summary', { n: list.length, d: nd });
  }

  /* ---------- the event (one presentation, several densities) ---------- */
  function titleHtml(ev) {
    if (ev.kind === 'match') {
      var h = safeImg(ev.homeLogo), a = safeImg(ev.awayLogo);
      return '<bdi dir="rtl">' + (h ? '<img class="crest" src="' + esc(h) + '" alt="" loading="lazy">' : '') + esc(ev.homeHe) + ' – ' + esc(ev.awayHe) + (a ? '<img class="crest" src="' + esc(a) + '" alt="" loading="lazy">' : '') + '</bdi>';
    }
    return (ev.flag ? '<img class="flag" src="flags/' + ev.flag + '.svg" alt="" loading="lazy">' : '') + '<bdi dir="rtl">' + esc(ev.title) + '</bdi>';
  }
  function plainTitle(ev) { return ev.title; }
  function compTagHtml(ev, cat) {
    var c = cat && cat.compById && cat.compById[ev.compId], logo = c && safeImg(c.logo);
    return '<span class="tag">' + (logo ? '<img src="' + esc(logo) + '" alt="" loading="lazy">' : '') + bdi(ev.compHe) + '</span>';
  }
  function placeHtml(ev) {
    var p = M.placeInfo(ev), city = p.cityHe ? bdi(p.cityHe) : '';
    var core;
    if (p.venue) core = (city ? city + ' · ' : '') + (p.venueUrl ? '<a class="venue-link" target="_blank" rel="noopener noreferrer" href="' + esc(p.venueUrl) + '">' + bdi(p.venue) + '</a>' : bdi(p.venue));
    else core = (city ? city + ' · ' : '') + '<span class="unknown">' + esc(t('ev.placeUnknown')) + '</span>';
    if (p.provisional) core += ' <span class="prov">(' + esc(t('ev.provisional')) + ')</span>';
    return core;
  }
  function timeBlock(ev, withDate) {
    var ts = M.eventTimeState(ev), date = withDate ? '<span class="ev-date">' + esc(M.fmtDate(ev.date)) + '</span>' : '';
    if (ts.state === 'known') return '<div class="ev-time">' + date + esc(ts.label) + '</div>';
    if (ts.state === 'day') return '<div class="ev-time ev-time--text">' + date + esc(t('ev.day', { n: ev.dayNo })) + '</div>';
    if (ts.state === 'unpublished') return '<div class="ev-time ev-time--text">' + date + esc(t('ev.timeUnpublished')) + '</div>';
    return '<div class="ev-time ev-time--text">' + date + esc(M.fmtRange(ev.date, ev.endDate)) + '</div>';
  }
  function addBtn(ev, picked) {
    var title = plainTitle(ev);
    return '<button type="button" class="add" data-add="' + ev.id + '" data-title="' + esc(title) + '" aria-pressed="' + !!picked + '" aria-label="' + esc((picked ? t('ev.added') : t('ev.add')) + ': ' + title) + '">' + esc(picked ? t('ev.added') : t('ev.add')) + '</button>';
  }
  function eventCardHtml(ev, o) {
    o = o || {};
    return '<li class="ev' + (o.picked ? ' picked' : '') + (o.compact ? ' ev--compact' : '') + '" data-ev="' + ev.id + '">' + timeBlock(ev, o.withDate) +
      '<div class="ev-main"><h4 class="ev-title"><button type="button" class="title-btn" data-open="' + ev.id + '" aria-haspopup="dialog">' + titleHtml(ev) + '</button></h4>' +
      '<div class="ev-meta">' + M.sportLabelHtml(ev.sportId) + compTagHtml(ev, o.cat) + '<span class="ev-place">' + placeHtml(ev) + '</span></div>' +
      (o.extra ? o.extra : '') + '</div><div class="ev-actions">' + addBtn(ev, o.picked) + '</div></li>';
  }
  function groupCardHtml(g, o) {
    var first = g.days[0], last = g.days[g.days.length - 1];
    return '<li class="ev ev-group" data-parent="' + g.parentId + '"><div class="ev-main"><h4 class="ev-title"><span class="title-text">' + titleHtml({ kind: 'event', title: first.parentTitle, flag: first.flag }) + '</span></h4>' +
      '<div class="ev-meta">' + M.sportLabelHtml(first.sportId) + compTagHtml(first, o.cat) + '<span class="ev-place">' + placeHtml(first) + '</span></div>' +
      '<p class="ev-sub">' + esc(M.fmtRange(first.date, last.date)) + ' · ' + esc(tn('ev.groupDays', g.days.length)) + '</p>' +
      '<details class="group-days"><summary>' + esc(t('ev.pickDay')) + '</summary><ul class="group-list">' + g.days.map(function (d) {
        var picked = o.picked && o.picked[d.id];
        return '<li data-ev="' + d.id + '"><span class="gd-label">' + esc(M.fmtDateLong(d.date)) + (d.sessions && d.sessions.length ? ' · ' + esc(t('ev.sessions')) : '') + '</span>' +
          '<button type="button" class="linkbtn" data-open="' + d.id + '" aria-haspopup="dialog">' + esc(t('ev.details')) + '</button>' + addBtn(d, picked) + '</li>';
      }).join('') + '</ul></details></div></li>';
  }
  function resultsHtml(days, o) {
    return days.map(function (d) {
      return '<section class="day" data-date="' + d.date + '"><h3>' + esc(M.fmtDateLong(d.date)) + '</h3><ul class="evlist">' + d.items.map(function (it) {
        return it.type === 'group' ? groupCardHtml(it, o) : eventCardHtml(it.ev, { picked: o.picked && o.picked[it.ev.id], cat: o.cat });
      }).join('') + '</ul></section>';
    }).join('');
  }
  function emptyHtml(o) {
    var acts = [];
    if (o.canExtend) acts.push('<button type="button" class="btn small" data-act="extend-dates">' + esc(t('empty.extendDates')) + '</button>');
    if (o.growTo) acts.push('<button type="button" class="btn small" data-act="grow-radius" data-km="' + o.growTo + '">' + esc(t('empty.growRadius', { n: o.growTo })) + '</button>');
    if (o.sportsActive) acts.push('<button type="button" class="btn small" data-act="all-sports">' + esc(t('empty.allSports')) + '</button>');
    if (o.filtersActive) acts.push('<button type="button" class="btn small" data-act="reset-filters">' + esc(t('empty.clearFilters')) + '</button>');
    return '<div class="empty"><h3>' + esc(o.dayOnly ? t('empty.noDay') : t('empty.title')) + '</h3>' + (o.dayOnly ? '' : '<p>' + esc(t('empty.note')) + '</p>') +
      (acts.length ? '<div class="empty-actions">' + acts.join('') + '</div>' : '') + '</div>';
  }

  /* ---------- event details dialog ---------- */
  function eventDialogHtml(ev, o) {
    o = o || {};
    var ts = M.eventTimeState(ev), p = M.placeInfo(ev), rows = '';
    if (ev.sessions && ev.sessions.length) {
      rows = '<section aria-labelledby="evSess"><h3 id="evSess">' + esc(t('ev.sessions')) + '</h3>' + ev.sessions.map(function (s) {
        return '<div class="drow' + (s.main ? ' main' : '') + '"><span class="dser">' + esc(s.series) + '</span><span class="dname">' + esc(s.name) + '</span><span class="dtime"><bdi dir="ltr">' + esc(s.start ? (s.end ? s.start + ' - ' + s.end : s.start) : '') + '</bdi></span></div>';
      }).join('') + (ev.sessionsNote ? '<p class="hint">' + esc(ev.sessionsNote) + '</p>' : '') + '</section>';
    } else if (ev.kind === 'event') rows = '<section><p class="hint">' + esc(t('ev.sessionsNone')) + '</p></section>';
    var timeLine = ts.state === 'known' ? esc(M.fmtDateLong(ev.date)) + ' · ' + esc(ts.label) : esc(M.fmtDateLong(ev.date)) + (ts.state === 'unpublished' ? ' · ' + esc(t('ev.timeUnpublished')) : '');
    var where = placeHtml(ev);
    if (p.status === 'approximate') where += '<p class="hint">' + esc(t('ev.approxMap')) + '</p>';
    if (p.provisional && p.locations && p.locations.length) {
      where += '<p class="hint">' + esc(t('ev.locationsKnown', { src: p.locations[0].src || '' })) + '</p><ul class="locs">' +
        p.locations.map(function (l) { return '<li>' + bdi((l.city || '') + (l.country ? ' (' + M.countryHe(l.country) + ')' : '')) + '</li>'; }).join('') + '</ul>';
    }
    var official = ev.officialUrl ? '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + esc(ev.officialUrl) + '">' + esc(t('ev.official')) + '</a>' : '';
    return '<div class="dlg-head"><div><p class="dlg-kicker">' + M.sportLabelHtml(ev.sportId) + ' · ' + bdi(ev.compHe) + (ev.round ? ' · ' + esc(t('ev.round', { r: ev.round })) : '') + '</p>' +
      '<h2 id="evTitle">' + titleHtml(ev) + '</h2></div><button type="button" class="dialog-close" data-close aria-label="' + esc(t('ev.close')) + '">' + icon('x') + '</button></div>' +
      '<section aria-labelledby="evWhen"><h3 id="evWhen">' + esc(t('ev.when')) + '</h3><p>' + timeLine + '</p><p class="hint">' + esc(ts.state === 'known' || ts.state === 'unpublished' ? t('ev.timeNote') : t('ev.dateOnly')) + '</p></section>' +
      '<section aria-labelledby="evWhere"><h3 id="evWhere">' + esc(t('ev.where')) + '</h3><p>' + where + '</p></section>' + rows +
      '<section aria-labelledby="evTix"><h3 id="evTix">' + esc(t('ev.tickets')) + '</h3>' + (o.ticketsHtml || '<p class="hint">' + esc(t('ev.ticketsNone')) + '</p>') + '</section>' +
      '<div class="dlg-actions">' + addBtn(ev, o.picked) + official + '</div>';
  }

  /* ---------- advanced filters dialog (a real draft: nothing here touches the applied state) ---------- */
  function filterDialogHtml(draft, cat, previewN) {
    var bySport = {};
    cat.comps.forEach(function (c) { (bySport[c.sportId] = bySport[c.sportId] || []).push(c); });
    var wd = [0, 1, 2, 3, 4, 5, 6].map(function (d) {
      return '<label class="chip"><input type="checkbox" data-wd="' + d + '"' + (draft.excludedWeekdays[d] ? '' : ' checked') + '><span>' + esc(M.HE_DAYS[d]) + '</span></label>';
    }).join('');
    var sports = Object.keys(bySport).sort(function (a, b) { return (M.SPORT_REGISTRY[a] || M.SPORT_REGISTRY.unknown).order - (M.SPORT_REGISTRY[b] || M.SPORT_REGISTRY.unknown).order; });
    var comps = sports.map(function (sid) {
      var list = bySport[sid], on = list.filter(function (c) { return !draft.excludedComps[c.id]; }).length;
      var body;
      if (sid === 'football') {
        var byC = {}, order = [];
        list.forEach(function (c) { if (!byC[c.country]) { byC[c.country] = []; order.push(c.country); } byC[c.country].push(c); });
        body = order.map(function (ct) { return '<div class="fd-country"><span>' + esc(M.countryHe(ct)) + '</span></div>' + compRows(byC[ct], draft); }).join('');
      } else body = compRows(list, draft);
      return '<details class="fd-sport"><summary>' + esc((M.SPORT_REGISTRY[sid] || M.SPORT_REGISTRY.unknown).he) + ' <span class="n">(' + on + '/' + list.length + ')</span></summary>' +
        '<div class="fd-tools"><button type="button" class="linkbtn" data-fd-sport="' + sid + '" data-on="1">' + esc(t('fd.all')) + '</button><button type="button" class="linkbtn" data-fd-sport="' + sid + '" data-on="0">' + esc(t('fd.none')) + '</button></div>' + body + '</details>';
    }).join('');
    return '<div class="dlg-head"><h2 id="fdTitle">' + esc(t('fd.title')) + '</h2><button type="button" class="dialog-close" data-close aria-label="' + esc(t('fd.close')) + '">' + icon('x') + '</button></div>' +
      '<div class="fd-body"><div class="field"><label for="fdRadius">' + esc(t('fd.radius')) + ': <output id="fdRadiusOut">' + esc(t('form.radiusKm', { n: draft.radiusKm })) + '</output></label>' +
      '<input id="fdRadius" type="range" min="10" max="800" step="10" value="' + draft.radiusKm + '"></div>' +
      '<fieldset><legend>' + esc(t('fd.weekdays')) + '</legend><div class="chips">' + wd + '</div><p class="hint">' + esc(t('fd.weekdaysHint')) + '</p></fieldset>' +
      '<fieldset><legend>' + esc(t('fd.comps')) + '</legend><p class="hint">' + esc(t('fd.compsHint')) + '</p>' + comps + '</fieldset></div>' +
      '<div class="dlg-actions sticky"><button type="button" class="btn" data-fd="cancel">' + esc(t('fd.cancel')) + '</button>' +
      '<button type="button" class="btn" data-fd="reset" title="' + esc(t('filters.resetScope')) + '">' + esc(t('filters.reset')) + '</button>' +
      '<button type="button" class="btn primary" data-fd="apply" id="fdApply">' + esc(t('fd.apply', { n: previewN })) + '</button></div>';
  }
  function compRows(list, draft) {
    return list.map(function (c) {
      var logo = safeImg(c.logo);
      return '<label class="comp"><input type="checkbox" data-comp="' + c.id + '"' + (draft.excludedComps[c.id] ? '' : ' checked') + '>' + (logo ? '<img class="comp-logo" src="' + esc(logo) + '" alt="" loading="lazy">' : '') + bdi(c.labelHe || c.label) + '</label>';
    }).join('');
  }

  /* ---------- map panel ---------- */
  function mapPanelHtml(g, o) {
    if (!g) return '<p class="panel-empty">' + esc(t('map.hint')) + '</p>';
    var rows = g.list.slice().sort(function (a, b) { return a.dt < b.dt ? -1 : 1; });
    return '<div class="panel-head"><div><h3>' + bdi(g.venue || g.cityHe) + '</h3><p>' + (g.venue ? bdi(g.cityHe) + ' · ' : '') + esc(tn('map.panelCount', rows.length)) + (g.approx ? ' · ' + esc(t('map.pinApprox')) : '') + '</p></div>' +
      '<button type="button" class="panel-close" data-act="map-close" aria-label="' + esc(t('map.close')) + '">' + icon('x') + '</button></div>' +
      '<div class="panel-tools"><button type="button" class="btn small" data-act="search-here">' + esc(t('map.searchHere')) + '</button></div>' +
      '<ul class="evlist" aria-label="' + esc(t('map.list')) + '">' + rows.map(function (f) { return eventCardHtml(f, { picked: o.picked && o.picked[f.id], withDate: true, cat: o.cat }); }).join('') + '</ul>';
  }

  /* ---------- my trip ---------- */
  function noteHtml(n) {
    if (!n) return '';
    var txt;
    if (n.kind === 'same-day-unknown-time') txt = t('note.sameDayUnknown');
    else if (n.kind === 'same-day-close') txt = t('note.sameDayClose');
    else if (n.kind === 'same-day-transfer') txt = t('note.sameDayTransfer');
    else if (n.kind === 'transfer-unverified') txt = t('note.transferUnverified', { from: n.from, to: n.to }) + ' <a href="' + esc(M.directionsUrl(n.fromCity || n.from, n.toCity || n.to)) + '" target="_blank" rel="noopener noreferrer">' + esc(t('note.directions')) + '</a>';
    else return '';
    return '<li class="tnote" role="note">' + (n.kind === 'transfer-unverified' ? txt : esc(txt)) + '</li>';
  }
  function tripEntryHtml(te, o) {
    var ev = te.ev, e = te.entry, s = te.snap, id = e.id;
    if (!ev) {
      return '<li class="tentry tentry--missing" data-ev="' + id + '"><div class="tentry-main"><p class="tentry-title-plain">' + bdi(s ? s.title : String(id)) + '</p>' +
        '<p class="tstatus warn">' + esc(t('trip.missing')) + '</p><p class="hint">' + esc(t('trip.missingNote')) + '</p>' +
        (s ? '<p class="hint">' + bdi((s.date || '') + ' · ' + (s.cityHe || s.city || '')) + '</p>' : '') + '</div>' +
        '<div class="tentry-actions"><button type="button" class="btn small" data-remove="' + id + '" aria-label="' + esc(t('trip.removeNamed', { title: s ? s.title : id })) + '">' + esc(t('trip.remove')) + '</button></div></li>';
    }
    var changed = te.changed ? '<p class="tstatus warn">' + esc(t('trip.changed')) + '</p><p class="hint">' + esc(t('trip.was', { v: snapText(s) })) + '<br>' + esc(t('trip.now', { v: snapText(M.snapshotOf(ev)) })) + '</p>' +
      '<button type="button" class="btn small" data-ack="' + id + '">' + esc(t('trip.ack')) + '</button>' : '';
    var ts = M.eventTimeState(ev);
    var time = ts.state === 'known' ? ts.label : ts.state === 'day' ? t('ev.day', { n: ev.dayNo }) : ts.state === 'unpublished' ? t('ev.timeUnpublished') : M.fmtRange(ev.date, ev.endDate);
    return '<li class="tentry' + (e.locked ? ' locked' : '') + '" data-ev="' + id + '"><div class="tentry-time">' + esc(time) + '</div><div class="tentry-main">' +
      '<button type="button" class="title-btn" data-open="' + id + '" aria-haspopup="dialog">' + titleHtml(ev) + '</button>' +
      '<div class="ev-meta">' + M.sportLabelHtml(ev.sportId) + compTagHtml(ev, o.cat) + '<span class="ev-place">' + placeHtml(ev) + '</span></div>' + changed + '</div>' +
      '<div class="tentry-actions"><button type="button" class="btn small" data-lock="' + id + '" aria-pressed="' + !!e.locked + '">' + icon('lock') + esc(e.locked ? t('trip.unlock') : t('trip.lock')) + '</button>' +
      '<button type="button" class="btn small danger" data-remove="' + id + '" aria-label="' + esc(t('trip.removeNamed', { title: ev.title })) + '">' + esc(t('trip.remove')) + '</button></div></li>';
  }
  function snapText(s) { return s ? [s.date, s.dt && s.dt.slice(11, 16) !== '00:00' ? s.dt.slice(11, 16) : '', s.venue || '', s.cityHe || s.city || ''].filter(Boolean).join(' · ') : ''; }

  function tripHtml(d, o) {
    // d: {tes, dates, stays, links, days:[{date, entries:[te], notes:[note]}], outsideCount, destText, eventDays}
    if (!d.tes.length) {
      return '<h2>' + esc(t('trip.title')) + '</h2><div class="empty"><h3>' + esc(t('trip.empty')) + '</h3><p>' + esc(t('trip.emptyHint')) + '</p><div class="empty-actions">' +
        '<button type="button" class="btn primary" data-act="go-search">' + esc(t('trip.goSearch')) + '</button><button type="button" class="btn" data-act="import-trip">' + esc(t('actions.import')) + '</button></div></div>';
    }
    var dt = d.dates, srcKey = 'trip.datesSource.' + dt.source;
    var counts = d.eventDays === 1 && d.tes.length === 1 ? t('trip.countsOne', { nights: dt.nights }) : t('trip.counts', { n: d.tes.length, d: d.eventDays, nights: dt.nights });
    var html = '<h2>' + esc(t('trip.title')) + '</h2><div class="tsummary"><p class="tcounts"><strong>' + esc(counts) + '</strong>' + (d.destText ? ' · ' + bdi(d.destText) : '') + '</p>' +
      '<div class="row2 tdates"><label>' + esc(t('trip.arrival')) + '<input id="tArr" type="date" value="' + esc(dt.arrival || '') + '"></label><label>' + esc(t('trip.departure')) + '<input id="tDep" type="date" value="' + esc(dt.departure || '') + '"></label></div>' +
      '<p class="hint">' + esc(t(srcKey)) + (dt.source === 'explicit' ? ' <button type="button" class="linkbtn" data-act="dates-auto">' + esc(t('trip.datesAuto')) + '</button>' : '') + '</p>' +
      (dt.outside && dt.outside.length ? '<p class="tstatus warn">' + esc(t('trip.outside', { n: dt.outside.length })) + '</p>' : '') + '</div>';
    var decisions = d.tes.filter(function (te) { return !te.ev || te.changed; });
    if (decisions.length) html += '<section class="tdecisions" aria-labelledby="tDec"><h3 id="tDec">' + esc(t('trip.decisions')) + ' (' + decisions.length + ')</h3><p class="hint">' + esc(t('trip.missingNote')) + '</p></section>';
    html += '<ol class="tdays">' + d.days.map(function (day, i) {
      var body = day.entries.length ? '<ul class="tlist">' + day.entries.map(function (te, k) { return (k > 0 ? noteHtml(M.pairNote(day.entries[k - 1].ev, te.ev)) : '') + tripEntryHtml(te, o); }).join('') + '</ul>'
        : '<div class="tfree"><strong>' + esc(t('trip.free')) + '</strong><p class="hint">' + esc(t('trip.freeNote')) + '</p><button type="button" class="linkbtn" data-searchday="' + day.date + '">' + esc(t('trip.searchDay')) + '</button></div>';
      return '<li class="tday" data-date="' + day.date + '">' + (day.noteBefore ? '<ul class="tlist">' + noteHtml(day.noteBefore) + '</ul>' : '') + '<h3>' + esc(M.fmtDateLong(day.date)) + '</h3>' + body + '</li>';
    }).join('') + '</ol>';
    html += '<section class="travel" aria-labelledby="tTravel"><h3 id="tTravel">' + esc(t('travel.title')) + '</h3>' +
      '<div class="field"><label for="origin">' + esc(t('travel.origin')) + '</label><div class="combo-wrap"><input id="origin" type="text" value="' + esc(o.origin) + '"></div></div><div class="tools">' +
      d.links.flights.map(function (f) {
        var label = f.kind === 'return' ? t('travel.flightReturn') : f.kind === 'oneway-out' ? t('travel.flightOut', { city: f.city }) : t('travel.flightBack', { city: f.city });
        return '<a class="btn primary" target="_blank" rel="noopener noreferrer" data-link="flight" href="' + esc(f.url) + '">' + bdi(label) + '</a>';
      }).join('') + d.links.hotels.map(function (h) {
        return '<a class="btn" target="_blank" rel="noopener noreferrer" data-link="hotel" href="' + esc(h.url) + '">' + esc(t('travel.hotel', { city: h.city })) + '<small class="btn-sub">' + esc(t('travel.hotelDates', { a: M.fmtDate(h.checkin), b: M.fmtDate(h.checkout), n: h.nights })) + '</small></a>';
      }).join('') + '</div>' + d.links.notes.map(function (n) { return '<p class="hint">' + esc(t('travel.noNights', { city: n.city })) + '</p>'; }).join('') +
      '<p class="hint">' + esc(t('travel.note')) + '</p></section>';
    html += '<div class="tactions"><button type="button" class="btn" id="copyTrip">' + esc(t('actions.copy')) + '</button><button type="button" class="btn" id="exportTrip">' + esc(t('actions.export')) + '</button>' +
      '<button type="button" class="btn" data-act="import-trip">' + esc(t('actions.import')) + '</button><button type="button" class="btn danger" id="clearTrip">' + esc(t('actions.clear')) + '</button></div>';
    return html;
  }
  function peekHtml(tes, o) {
    if (!tes.length) return '';
    var shown = tes.slice(0, 6);
    return '<h2 class="peek-title">' + esc(t('peek.title')) + ' <span class="n">(' + tes.length + ')</span></h2><ul class="peek-list">' + shown.map(function (te) {
      var ev = te.ev, s = te.snap;
      return '<li>' + '<span class="peek-date">' + esc(M.fmtDate(ev ? ev.date : (s && s.date) || '')) + '</span>' + bdi(ev ? ev.title : (s ? s.title : '')) + '</li>';
    }).join('') + '</ul>' + (tes.length > shown.length ? '<p class="hint">' + esc(t('peek.more', { n: tes.length - shown.length })) + '</p>' : '');
  }

  return {
    icon: icon, safeImg: safeImg, navHtml: navHtml, contextFormHtml: contextFormHtml, onboardingHtml: onboardingHtml,
    searchSkeleton: searchSkeleton, destLabel: destLabel, ctxBarHtml: ctxBarHtml, retBannerHtml: retBannerHtml, sportChipsHtml: sportChipsHtml,
    activeFilterCount: activeFilterCount, filterChipsHtml: filterChipsHtml, dayBarHtml: dayBarHtml, summaryText: summaryText,
    titleHtml: titleHtml, compTagHtml: compTagHtml, placeHtml: placeHtml, addBtn: addBtn, eventCardHtml: eventCardHtml, groupCardHtml: groupCardHtml,
    resultsHtml: resultsHtml, emptyHtml: emptyHtml, eventDialogHtml: eventDialogHtml, filterDialogHtml: filterDialogHtml, mapPanelHtml: mapPanelHtml,
    noteHtml: noteHtml, tripEntryHtml: tripEntryHtml, tripHtml: tripHtml, peekHtml: peekHtml
  };
});
