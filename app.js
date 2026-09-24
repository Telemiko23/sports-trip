(function () {
  var BRAND = window.BRAND || { name: 'מסלול משחקים', version: '' };
  var APP_VERSION = BRAND.version;
  (function () {
    var parts = String(BRAND.name).split(' ');
    var h1 = document.getElementById('brandName');
    h1.textContent = parts[0] + (parts.length > 1 ? ' ' : '');
    if (parts.length > 1) { var b = document.createElement('b'); b.textContent = parts.slice(1).join(' '); h1.appendChild(b); }
    document.title = BRAND.name;
  })();
  var DATA = window.TRIP_DATA;
  var app = document.getElementById('app');
  if (!DATA || !Array.isArray(DATA.fixtures)) {
    app.innerHTML = '<p class="empty">לא נמצא קובץ הנתונים fixtures.js. הרץ קודם את build_fixtures.py בתיקייה הזו, ואז פתח מחדש את הדף.</p>';
    return;
  }
  var $ = function (s) { return document.querySelector(s); };
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
    'Formula 1': '🏎️ פורמולה 1', Tennis: '🎾 טניס', Darts: '🎯 דארטס',
    Singapore: 'סינגפור', China: 'סין', Japan: 'יפן', Malaysia: 'מלזיה', 'United States': 'ארצות הברית', Mexico: 'מקסיקו',
    Brazil: 'ברזיל', Qatar: 'קטאר', 'United Arab Emirates': 'איחוד האמירויות', Australia: 'אוסטרליה', 'United Kingdom': 'הממלכה המאוחדת'
  };
  var COUNTRY_COLOR = {
    England: '#2F6FBD', Spain: '#C0392B', Germany: '#6B6B6B', France: '#7A4FBF', Netherlands: '#D9782D', Italy: '#1E9E8C', Poland: '#B23A6B',
    Portugal: '#2E8B57', Europe: '#8C6420',
    f1: '#D42A2A', tennis: '#7BA428', darts: '#C2185B', 'Formula 1': '#D42A2A', Tennis: '#7BA428', Darts: '#C2185B'
  };
  var HE_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  var HE_DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  // A multi-day event (a Grand Prix weekend, a tournament) is shown as one item per day - each
  // day can be added to a trip on its own, and carries that day's session schedule if we have one.
  // ids stay unique: day n of event E is E*100+n (event ids are all >= 1e9, football ids far smaller).
  function expandDays(rows) {
    var out = [];
    rows.forEach(function (r) {
      var s = r.dt.slice(0, 10), e = r.date_to || s, isEv = r.sport && r.sport !== 'football';
      if (!isEv) { out.push(r); return; }
      var total = Math.round((parseDay(e) - parseDay(s)) / 86400000) + 1, n = 0;
      for (var d = s; d <= e; d = addDays(d, 1)) {
        n++;
        var c = {}; for (var k in r) c[k] = r[k];
        c.sessions = r.sessions ? (r.sessions[d] || null) : null;
        if (total > 1) {
          c.id = r.id * 100 + n; c.dt = d + 'T00:00'; c.date_to = d; c.day_no = n; c.day_total = total;
          c.title = (r.title || '') + ' - Day ' + n; c.title_he = (r.title_he || r.title) + ' - יום ' + n;
        }
        out.push(c);
      }
    });
    return out;
  }
  var fixtures = expandDays(DATA.fixtures).sort(function (a, b) { return a.dt < b.dt ? -1 : a.dt > b.dt ? 1 : 0; });
  var byId = {};
  fixtures.forEach(function (f) { byId[f.id] = f; });
  var comps = (DATA.competitions && DATA.competitions.length) ? DATA.competitions : (function () {
    var seen = {}, out = [];
    fixtures.forEach(function (f) { if (!seen[f.comp_id]) { seen[f.comp_id] = 1; out.push({ id: f.comp_id, label: f.comp, country: f.country }); } });
    return out;
  })();
  var compLogoById = {};
  comps.forEach(function (c) { if (c.logo) compLogoById[c.id] = c.logo; });

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // analytics events - never throws (an ad-blocker or offline gtag must not break the site)
  function track(name, params) {
    try {
      if (typeof gtag === 'function') gtag('event', name, params || {});
      if (window.console && console.debug) console.debug('[analytics]', name, params || {});
    } catch (e) { }
  }
  function fixtureTrackParams(f) {
    var days = Math.round((parseDay(f.dt.slice(0, 10)) - parseDay(isoLocal(new Date()))) / 86400000);
    return { sport: f.sport || 'football', comp: f.comp, country: f.country || '', city: f.city || '', days_until_match: days };
  }
  // delegated on document since venue links render inside #list, #trip and map popups alike
  document.addEventListener('click', function (e) {
    var v = e.target.closest ? e.target.closest('a.venue-link') : null;
    if (v) { track('venue_maps_click', { venue: v.textContent }); return; }
    var fl = e.target.closest ? e.target.closest('.tools a.btn.primary') : null;
    if (fl) { track('flight_link_click', {}); return; }
    var hl = e.target.closest ? e.target.closest('.tools a.btn:not(.primary)') : null;
    if (hl) { track('hotel_link_click', { city: hl.textContent.replace('חיפוש לינה: ', '') }); }
  });
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoLocal(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(s, n) { var d = parseDay(s); d.setDate(d.getDate() + n); return isoLocal(d); }
  function dayOf(f) { return f.dt.slice(0, 10); }
  // non-football events (F1, tennis) span several days and have no kickoff time or two teams
  function endDay(f) { return f.date_to || dayOf(f); }
  function isEvent(f) { return !!f.sport && f.sport !== 'football'; }
  function titleHe(f) { return isEvent(f) ? (f.title_he || f.title) : (f.home_he || f.home) + ' – ' + (f.away_he || f.away); }
  function colorOf(f) { return COUNTRY_COLOR[isEvent(f) ? f.sport : f.country] || '#999'; }
  function shortRange(f) {
    var a = parseDay(dayOf(f)), b = parseDay(endDay(f));
    var fa = a.getDate() + '/' + (a.getMonth() + 1), fb = b.getDate() + '/' + (b.getMonth() + 1);
    return fa === fb ? fa : fa + '–' + fb;
  }
  // date ranges are digits + punctuation only, so force LTR or the RTL page flips "21/9–27/9" visually
  function rangeHtml(f) { return f.day_no ? 'יום ' + f.day_no : '<bdi dir="ltr">' + esc(shortRange(f)) + '</bdi>'; }
  // "פירוט" opens the day's session schedule - only rendered when we actually have one
  function detailBtn(f) { return f.sessions && f.sessions.length ? ' <button type="button" class="detail-btn" data-detail="' + f.id + '">פירוט</button>' : ''; }
  function longRange(f) {
    return dayOf(f) === endDay(f) ? fmtLong(dayOf(f)) : parseDay(dayOf(f)).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' }) + ' – ' + parseDay(endDay(f)).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
  }
  function weekday(s) { return parseDay(s).getDay(); }
  function minutes(f) { return f.status === 'TBD' ? null : Number(f.dt.slice(11, 13)) * 60 + Number(f.dt.slice(14, 16)); }
  function km(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }
  function hasPos(f) { return f.lat != null && f.lng != null; }
  function venueMapsUrl(f) {
    if (!f.venue) return null;
    if (f.venue_lat != null && f.venue_lng != null) return 'https://www.google.com/maps/search/?api=1&query=' + f.venue_lat + ',' + f.venue_lng;
    if (f.city) return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(f.venue + ', ' + f.city);
    return null;
  }
  function venueHtml(f) {
    if (!f.venue) return '';
    var url = venueMapsUrl(f);
    return url ? '<a class="venue-link" target="_blank" rel="noopener" href="' + esc(url) + '"><bdi dir="rtl">' + esc(f.venue) + '</bdi></a>' : '<bdi dir="rtl">' + esc(f.venue) + '</bdi>';
  }
  function fmtLong(s) { return parseDay(s).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }); }

  // ---------- custom combobox (styled dropdown, replaces native <datalist>) ----------
  // items: [{label, sub, search, ...anything else onSelect needs}]
  function combobox(input, menu, items, opts) {
    var filtered = [], activeIdx = -1;
    function highlight(text, q) {
      var i = text.toLowerCase().indexOf(q.toLowerCase());
      if (i === -1) return esc(text);
      return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
    }
    function close() { menu.classList.remove('open'); menu.innerHTML = ''; activeIdx = -1; }
    function updateActive() {
      Array.prototype.forEach.call(menu.children, function (el, i) { el.classList.toggle('active', i === activeIdx); });
      if (menu.children[activeIdx]) menu.children[activeIdx].scrollIntoView({ block: 'nearest' });
    }
    function render(list, q) {
      filtered = list;
      if (!list.length) { menu.innerHTML = '<div class="combo-empty">אין תוצאות</div>'; menu.classList.add('open'); return; }
      menu.innerHTML = list.slice(0, 60).map(function (it, i) {
        return '<div class="combo-opt" data-i="' + i + '"><bdi dir="rtl">' + highlight(it.label, q) + '</bdi>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</div>';
      }).join('');
      menu.classList.add('open');
      activeIdx = -1;
    }
    function choose(it) { input.value = it.label; close(); opts.onSelect(it); }
    input.addEventListener('input', function () {
      var q = input.value.trim();
      if (!q) { close(); opts.onInput && opts.onInput(''); return; }
      var ql = q.toLowerCase();
      render(items.filter(function (it) { return it.search.indexOf(ql) !== -1; }), q);
      opts.onInput && opts.onInput(q);
    });
    input.addEventListener('focus', function () { if (input.value.trim()) input.dispatchEvent(new Event('input')); });
    input.addEventListener('keydown', function (e) {
      if (!menu.classList.contains('open') || !filtered.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, filtered.length - 1); updateActive(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); updateActive(); }
      else if (e.key === 'Enter') { if (activeIdx >= 0) { e.preventDefault(); choose(filtered[activeIdx]); } }
      else if (e.key === 'Escape') { close(); }
    });
    menu.addEventListener('mousedown', function (e) {
      var row = e.target.closest('.combo-opt');
      if (!row) return;
      e.preventDefault();
      choose(filtered[Number(row.getAttribute('data-i'))]);
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
  }

  // ---------- state ----------
  var today = new Date();
  var S = {
    base: null, radius: 150,
    from: isoLocal(today), to: addDays(isoLocal(today), 45),
    days: {0: 1, 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1},
    comps: {},
    trip: [], origin: 'Ben Gurion International Airport – Tel Aviv, ישראל (TLV)',
    view: 'list'
  };
  comps.forEach(function (c) { S.comps[c.id] = true; });
  try {
    var saved = JSON.parse(localStorage.getItem('tripIds_v1') || '[]');
    S.trip = saved.filter(function (id) { return byId[id]; });
  } catch (e) { /* no storage: fine */ }
  function saveTrip() { try { localStorage.setItem('tripIds_v1', JSON.stringify(S.trip)); } catch (e) { } }

  // ---------- cities for the base-city box ----------
  function cityHe(f) { return f.city_he || f.city; }
  var cityMap = {};
  fixtures.forEach(function (f) {
    if (f.city && hasPos(f)) {
      var lblCountry = f.country === 'United Kingdom' ? 'England' : f.country; // so an event in London merges with football's London
      var label = cityHe(f) + ' (' + (HE_COUNTRY[lblCountry] || lblCountry) + ')';
      if (!cityMap[label]) cityMap[label] = { city: f.city, cityHe: cityHe(f), lat: f.lat, lng: f.lng };
    }
  });
  var cityLabels = Object.keys(cityMap).sort();
  var cityItems = cityLabels.map(function (l) { return { label: l, search: l.toLowerCase(), place: cityMap[l] }; });
  function findBase(text) {
    var t = text.trim();
    if (!t) return null;
    var exact = cityLabels.filter(function (l) { return l === t || cityMap[l].cityHe === t; });
    if (exact.length) return cityMap[exact[0]];
    var starts = cityLabels.filter(function (l) { return cityMap[l].cityHe.indexOf(t) === 0; });
    return starts.length ? cityMap[starts[0]] : null;
  }

  // ---------- flight-origin autocomplete: real airports (OurAirports data, filtered to
  // scheduled-service large/medium/small airports with an IATA code) ----------
  var AIRPORTS = window.AIRPORTS_DATA || [];
  var originMap = {};
  AIRPORTS.forEach(function (a) { originMap[a.l] = a.c; });
  var airportItems = AIRPORTS.map(function (a) { return { label: a.l, sub: a.grp ? '🌐' : a.c, search: a.s }; });
  function resolveOrigin(text) {
    var t = text.trim();
    return originMap[t] || t;
  }

  // ---------- filter UI ----------
  if (window.matchMedia && window.matchMedia('(max-width:760px)').matches) $('#compsBox').removeAttribute('open');
  $('#from').value = S.from; $('#to').value = S.to;
  $('#days').innerHTML = HE_DAYS.map(function (d, i) {
    return '<label class="chip" title="יום ' + HE_DAYS_FULL[i] + '"><input type="checkbox" data-day="' + i + '" checked><span>' + d + '</span></label>';
  }).join('');
  var byCountry = {}, order = [];
  comps.forEach(function (c) { if (!byCountry[c.country]) { byCountry[c.country] = []; order.push(c.country); } byCountry[c.country].push(c); });
  function compRows(ct) {
    return byCountry[ct].map(function (c) {
      return '<label class="comp"><input type="checkbox" data-comp="' + c.id + '" checked>' + (c.logo ? '<img class="comp-logo" src="' + esc(c.logo) + '" alt="" loading="lazy">' : (c.emoji ? '<span class="comp-logo" aria-hidden="true">' + esc(c.emoji) + '</span>' : '')) + '<bdi dir="rtl">' + esc(c.label_he || c.label) + '</bdi></label>';
    }).join('');
  }
  function groupHead(ct, cls) {
    return '<div class="' + cls + '"><span><i class="dot" style="background:' + (COUNTRY_COLOR[ct] || '#999') + '"></i>' + esc(HE_COUNTRY[ct] || ct) + '</span><button type="button" class="linkbtn" data-ctry="' + esc(ct) + '">הכל / כלום</button></div>';
  }
  // two levels: a sport, then (football only) its countries - other sports are a single group
  var footballGroups = order.filter(function (ct) { return !byCountry[ct][0].sport; });
  $('#comps').innerHTML =
    '<div class="sport-head"><span>⚽ כדורגל</span><button type="button" class="linkbtn" data-sport="football">הכל / כלום</button></div>' +
    '<div class="sub">' + footballGroups.map(function (ct) { return groupHead(ct, 'ctry') + compRows(ct); }).join('') + '</div>' +
    order.filter(function (ct) { return byCountry[ct][0].sport; }).map(function (ct) { return groupHead(ct, 'sport-head') + compRows(ct); }).join('');

  function setBase(place, typedText) {
    S.base = place;
    $('#baseHint').textContent = !typedText.trim()
      ? 'בלי עיר בסיס מוצגים משחקים מכל היעדים.'
      : (place ? 'המרחק מחושב מהעיר ' + place.cityHe + '.' : 'העיר לא נמצאה ברשימה. בחר עיר מההצעות.');
    update();
  }
  combobox($('#base'), $('#baseMenu'), cityItems, {
    onSelect: function (it) { setBase(it.place, it.label); track('base_city_set', { city: it.place ? it.place.city : it.label }); },
    onInput: function (text) { setBase(findBase(text), text); }
  });
  $('#radius').addEventListener('input', function (e) { S.radius = Number(e.target.value); $('#radiusOut').textContent = S.radius; update(); });
  $('#radius').addEventListener('change', function (e) { track('radius_change', { radius_km: Number(e.target.value) }); });
  $('#from').addEventListener('change', function (e) { S.from = e.target.value; update(); track('date_range_change', { field: 'from', value: S.from }); });
  $('#to').addEventListener('change', function (e) { S.to = e.target.value; update(); track('date_range_change', { field: 'to', value: S.to }); });
  $('#days').addEventListener('change', function (e) { var d = e.target.getAttribute('data-day'); if (d != null) { S.days[d] = e.target.checked ? 1 : 0; update(); } });
  $('#comps').addEventListener('change', function (e) {
    var id = e.target.getAttribute('data-comp');
    if (id == null) return;
    S.comps[id] = e.target.checked;
    update();
    var c = comps.filter(function (x) { return String(x.id) === id; })[0];
    track('competition_toggle', { comp: c ? c.label : id, checked: e.target.checked });
  });
  $('#comps').addEventListener('click', function (e) {
    var ct = e.target.getAttribute('data-ctry'), sp = e.target.getAttribute('data-sport');
    if (!ct && !sp) return;
    var list = sp ? comps.filter(function (c) { return !c.sport; }) : byCountry[ct];
    if (sp) ct = sp;
    var allOn = list.every(function (c) { return S.comps[c.id]; });
    list.forEach(function (c) { S.comps[c.id] = !allOn; });
    document.querySelectorAll('#comps input[data-comp]').forEach(function (i) { i.checked = !!S.comps[i.getAttribute('data-comp')]; });
    update();
    track('competition_country_toggle', { country: ct, checked: !allOn });
  });
  $('#allComps').addEventListener('click', function () {
    var allOn = comps.every(function (c) { return S.comps[c.id]; });
    comps.forEach(function (c) { S.comps[c.id] = !allOn; });
    document.querySelectorAll('#comps input[data-comp]').forEach(function (i) { i.checked = !!S.comps[i.getAttribute('data-comp')]; });
    update();
    track('competition_all_toggle', { checked: !allOn });
  });

  // ---------- results ----------
  function filtered() {
    var hiddenNoPos = 0;
    var out = fixtures.filter(function (f) {
      var d = dayOf(f), e = endDay(f);
      // a multi-day event counts if any of its days falls in the window and on a wanted weekday
      if (S.from && e < S.from) return false;
      if (S.to && d > S.to) return false;
      var wanted = false;
      for (var x = d; x <= e && !wanted; x = addDays(x, 1)) wanted = !!S.days[weekday(x)] && (!S.from || x >= S.from) && (!S.to || x <= S.to);
      if (!wanted) return false;
      if (!S.comps[f.comp_id]) return false;
      if (S.base) {
        if (!hasPos(f)) { hiddenNoPos++; return false; }
        if (km(S.base, f) > S.radius) return false;
      }
      return true;
    });
    return { list: out, hiddenNoPos: hiddenNoPos };
  }

  function renderResults() {
    var r = filtered(), list = r.list, html = '', lastDay = '';
    var days = {};
    list.forEach(function (f) { days[dayOf(f)] = 1; });
    var nDays = Object.keys(days).length;
    $('#summary').innerHTML = list.length ? '<strong>' + list.length + '</strong> משחקים ב-<strong>' + nDays + '</strong> ימים' : '';
    if (!list.length) {
      $('#list').innerHTML = '<p class="empty">לא נמצאו משחקים. הגדל את הרדיוס, הרחב את טווח התאריכים או סמן עוד תחרויות.</p>';
      return;
    }
    if (r.hiddenNoPos) html += '<p class="notice">' + r.hiddenNoPos + ' משחקים בלי מיקום מזוהה לא נכללים בסינון לפי מרחק.</p>';
    var open = false;
    list.forEach(function (f) {
      var d = dayOf(f);
      if (d !== lastDay) {
        if (open) html += '</ul></section>';
        html += '<section class="day"><h3>' + esc(fmtLong(d)) + '</h3><ul class="matches">';
        open = true; lastDay = d;
      }
      var picked = S.trip.indexOf(f.id) !== -1;
      var time = isEvent(f) ? '<div class="kick tbd">' + rangeHtml(f) + '</div>'
        : f.status === 'TBD' ? '<div class="kick tbd">שעה לא מאושרת</div>' : '<div class="kick">' + esc(f.dt.slice(11, 16)) + '</div>';
      var dist = (S.base && hasPos(f)) ? ' <span class="dist">' + (km(S.base, f) < 3 ? 'בעיר הבסיס' : Math.round(km(S.base, f)) + ' ק״מ') + '</span>' : '';
      var homeLogo = f.home_logo ? '<img class="crest" src="' + esc(f.home_logo) + '" alt="" loading="lazy">' : '';
      var awayLogo = f.away_logo ? '<img class="crest" src="' + esc(f.away_logo) + '" alt="" loading="lazy">' : '';
      var ctryColor = colorOf(f);
      var teamsHtml = isEvent(f)
        ? '<bdi dir="rtl">' + esc(f.emoji || '') + ' ' + esc(titleHe(f)) + '</bdi>'
        : '<bdi dir="rtl">' + homeLogo + esc(f.home_he || f.home) + ' – ' + esc(f.away_he || f.away) + awayLogo + '</bdi>';
      html += '<li class="match' + (picked ? ' picked' : '') + '" style="--ctry-color:' + ctryColor + '">' + time +
        '<div class="teams">' + teamsHtml + '</div>' +
        '<div class="meta"><span class="tag" style="--ctry-color:' + ctryColor + '">' + (compLogoById[f.comp_id] ? '<img src="' + esc(compLogoById[f.comp_id]) + '" alt="" loading="lazy">' : '') + '<bdi dir="rtl">' + esc(f.comp_he || f.comp) + '</bdi></span>' + (f.city ? '<bdi dir="rtl">' + esc(f.city_he || f.city) + '</bdi>' : 'עיר לא ידועה') + (f.venue ? ' · ' + venueHtml(f) : '') + dist + detailBtn(f) + '</div>' +
        '<button type="button" class="add" data-id="' + f.id + '" aria-pressed="' + picked + '">' + (picked ? 'בטיול ✓' : 'הוסף לטיול') + '</button></li>';
    });
    if (open) html += '</ul></section>';
    $('#list').innerHTML = html;
  }

  $('#list').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button.add') : null;
    if (!b) return;
    toggleTrip(Number(b.getAttribute('data-id')), 'list');
  });

  // ---------- map view (Leaflet + OpenStreetMap tiles) ----------
  // lastMapKey captures everything that changes which cities/markers should show (filters,
  // base city, radius) but deliberately excludes S.trip - adding/removing a trip match must
  // never move or rebuild the map, or the user loses their place after every click.
  var mapState = { map: null, markers: null, circle: null, lastKey: null };
  function mapFilterKey() {
    return JSON.stringify([S.base ? [S.base.lat, S.base.lng] : null, S.radius, S.from, S.to, S.days, S.comps]);
  }
  function initMap() {
    if (mapState.map || typeof L === 'undefined') return;
    mapState.map = L.map('map', { scrollWheelZoom: true }).setView([48, 12], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(mapState.map);
    mapState.markers = L.layerGroup().addTo(mapState.map);
    // handled directly here (not via toggleTrip -> update -> renderMap) so adding a match
    // from the map never rebuilds markers, closes the popup, or moves the view
    mapState.map.on('popupopen', function (e) {
      var el = e.popup.getElement();
      if (!el) return;
      el.querySelectorAll('button.add').forEach(function (b) {
        b.addEventListener('click', function () {
          var id = Number(b.getAttribute('data-id'));
          var i = S.trip.indexOf(id);
          var added = i === -1;
          if (added) S.trip.push(id); else S.trip.splice(i, 1);
          saveTrip();
          renderTrip();
          var picked = S.trip.indexOf(id) !== -1;
          b.setAttribute('aria-pressed', String(picked));
          b.textContent = picked ? 'בטיול ✓' : 'הוסף לטיול';
          var f = byId[id];
          if (f) { var p = fixtureTrackParams(f); p.source = 'map'; track(added ? 'add_to_trip' : 'remove_from_trip', p); }
        });
      });
    });
  }
  function mapPopupHtml(city) {
    var rows = city.list.slice().sort(function (a, b) { return a.dt < b.dt ? -1 : 1; }).map(function (f) {
      var picked = S.trip.indexOf(f.id) !== -1;
      var ctryColor = colorOf(f);
      return '<div class="map-match">' +
        '<div class="map-match-top"><span class="tag" style="--ctry-color:' + ctryColor + '">' + (compLogoById[f.comp_id] ? '<img src="' + esc(compLogoById[f.comp_id]) + '" alt="" loading="lazy">' : '') + '<bdi dir="rtl">' + esc(f.comp_he || f.comp) + '</bdi></span><span><bdi dir="rtl">' + esc(isEvent(f) ? longRange(f) : fmtLong(dayOf(f))) + '</bdi>' + (f.status === 'TBD' ? '' : ' · ' + esc(f.dt.slice(11, 16))) + '</span></div>' +
        '<div class="teams"><bdi dir="rtl">' + (isEvent(f) ? esc(f.emoji || '') + ' ' + esc(titleHe(f)) : esc(f.home_he || f.home) + ' – ' + esc(f.away_he || f.away)) + '</bdi></div>' +
        (f.venue || f.sessions ? '<div class="map-venue">' + (f.venue ? venueHtml(f) : '') + detailBtn(f) + '</div>' : '') +
        '<button type="button" class="add" data-id="' + f.id + '" aria-pressed="' + picked + '">' + (picked ? 'בטיול ✓' : 'הוסף לטיול') + '</button></div>';
    }).join('');
    var title = city.venue ? city.venue + ' · ' + city.cityHe : city.cityHe;
    return '<div class="map-popup-in"><h4><bdi dir="rtl">' + esc(title) + '</bdi></h4>' + rows + '</div>';
  }
  function renderMap() {
    if (!mapState.map) return;
    var key = mapFilterKey();
    var keyChanged = key !== mapState.lastKey;
    mapState.lastKey = key;
    mapState.markers.clearLayers();
    if (mapState.circle) { mapState.map.removeLayer(mapState.circle); mapState.circle = null; }
    var list = filtered().list;
    var byCity = {};
    // pin by the exact stadium when we know it (so e.g. Real Madrid's Bernabéu and
    // Atlético's Metropolitano get separate pins, not one shared city dot), falling back
    // to the city-level position - and possibly a shared pin with other such fixtures -
    // for a fixture whose stadium wasn't successfully geocoded
    list.forEach(function (f) {
      var precise = f.venue_lat != null && f.venue_lng != null;
      var lat = precise ? f.venue_lat : f.lat, lng = precise ? f.venue_lng : f.lng;
      if (lat == null || lng == null) return;
      var key = lat + ',' + lng;
      if (!byCity[key]) byCity[key] = { cityHe: cityHe(f), venue: precise ? f.venue : null, lat: lat, lng: lng, list: [] };
      byCity[key].list.push(f);
    });
    var groups = Object.keys(byCity).map(function (k) { return byCity[k]; });
    groups.forEach(function (g) {
      var icon = L.divIcon({
        className: '', html: '<div class="map-pin"><span>' + g.list.length + '</span></div>',
        iconSize: [28, 28], iconAnchor: [14, 26], popupAnchor: [0, -26]
      });
      L.marker([g.lat, g.lng], { icon: icon }).bindPopup(mapPopupHtml(g), { maxWidth: 300, maxHeight: 300 })
        .on('click', function () { track('map_marker_click', { city: g.cityHe, venue: g.venue || '', match_count: g.list.length }); })
        .addTo(mapState.markers);
    });
    if (S.base) {
      mapState.circle = L.circle([S.base.lat, S.base.lng], { radius: S.radius * 1000, color: '#B8862E', weight: 1.5, fillOpacity: .08 }).addTo(mapState.map);
      if (keyChanged) mapState.map.fitBounds(mapState.circle.getBounds(), { padding: [20, 20] });
    } else if (groups.length && keyChanged) {
      mapState.map.fitBounds(groups.map(function (g) { return [g.lat, g.lng]; }), { padding: [30, 30], maxZoom: 6 });
    }
  }
  $('#viewToggle').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button.vtab') : null;
    if (!b) return;
    S.view = b.getAttribute('data-view');
    document.querySelectorAll('#viewToggle .vtab').forEach(function (v) { v.setAttribute('aria-pressed', v === b ? 'true' : 'false'); });
    $('#list').style.display = S.view === 'list' ? '' : 'none';
    $('#mapWrap').style.display = S.view === 'map' ? '' : 'none';
    if (S.view === 'map') {
      initMap();
      requestAnimationFrame(function () { mapState.map.invalidateSize(); renderMap(); });
    }
    track('view_toggle', { view: S.view });
  });

  // ---------- trip ----------
  function toggleTrip(id, source) {
    var i = S.trip.indexOf(id);
    var added = i === -1;
    if (added) S.trip.push(id); else S.trip.splice(i, 1);
    saveTrip(); update();
    var f = byId[id];
    if (f) { var p = fixtureTrackParams(f); p.source = source || 'unknown'; track(added ? 'add_to_trip' : 'remove_from_trip', p); }
  }

  function tripSorted() { return S.trip.map(function (id) { return byId[id]; }).sort(function (a, b) { return a.dt < b.dt ? -1 : 1; }); }

  function hopInfo(prev, cur) {
    var sameDay = dayOf(prev) === dayOf(cur);
    var gap = Math.round((parseDay(dayOf(cur)) - parseDay(endDay(prev))) / 86400000);
    var parts = [], cls = '';
    if (isEvent(prev) || isEvent(cur)) {
      // a multi-day event has no kickoff time to compare, so only day overlap can clash
      if (gap < 0) { parts.push('חופף בתאריכים לאירוע הקודם'); cls = 'clash'; }
      else if (gap === 0) parts.push('אותו יום');
      else if (gap === 1) parts.push('למחרת');
      else parts.push(gap + ' ימים אחר כך');
    } else if (sameDay) {
      var a = minutes(prev), b = minutes(cur);
      if (a == null || b == null) { parts.push('אותו יום, שעה לא ידועה'); cls = 'clash'; }
      else if (b - a < 180) { parts.push('חפיפה בין המשחקים'); cls = 'clash'; }
      else { parts.push('אותו יום'); }
    } else if (gap === 1) parts.push('למחרת');
    else parts.push(gap + ' ימים אחר כך');
    return { text: parts.join(' · '), cls: cls };
  }

  function flightSearch(text) { return 'https://www.google.com/travel/flights?q=' + encodeURIComponent(text); }

  function bookingLinks(list) {
    var first = list[0], last = list[list.length - 1];
    var d1 = dayOf(first), d2 = list.reduce(function (m, f) { return endDay(f) > m ? endDay(f) : m; }, endDay(last));
    var origin = resolveOrigin(S.origin);
    var flights;
    if (first.city && last.city && first.city !== last.city) {
      // different first/last match cities: one-way out + one-way back (multi-city), not a round trip
      flights = [
        { label: 'טיסת הלוך: ' + origin + ' ← ' + (first.city_he || first.city), url: flightSearch('Flights from ' + origin + ' to ' + first.city + ' on ' + d1) },
        { label: 'טיסת חזור: ' + (last.city_he || last.city) + ' ← ' + origin, url: flightSearch('Flights from ' + last.city + ' to ' + origin + ' on ' + addDays(d2, 1)) }
      ];
    } else {
      flights = [
        { label: 'חיפוש טיסות', url: flightSearch('Flights from ' + origin + ' to ' + (first.city || '') + ' on ' + d1 + ' through ' + d2) }
      ];
    }
    var cities = [], seen = {};
    list.forEach(function (f) {
      if (!f.city) return;
      if (!seen[f.city]) { seen[f.city] = { city: f.city, cityHe: f.city_he || f.city, a: dayOf(f), b: endDay(f), lat: f.venue_lat, lng: f.venue_lng }; cities.push(seen[f.city]); }
      else { if (endDay(f) > seen[f.city].b) seen[f.city].b = endDay(f); if (seen[f.city].lat == null && f.venue_lat != null) { seen[f.city].lat = f.venue_lat; seen[f.city].lng = f.venue_lng; } }
    });
    // when we know a stadium's exact spot, centre the hotel search there (< 3km) instead of
    // just searching the city name - closer results for the actual match, not just downtown
    var hotels = cities.map(function (c) {
      var url = 'https://www.booking.com/searchresults.html?ss=' + encodeURIComponent(c.city) + '&checkin=' + c.a + '&checkout=' + addDays(c.b, 1);
      if (c.lat != null && c.lng != null) url += '&latitude=' + c.lat + '&longitude=' + c.lng + '&distance=3000';
      return { city: c.cityHe, url: url };
    });
    return { flights: flights, hotels: hotels };
  }

  function tripText(list) {
    return list.map(function (f) {
      var when = isEvent(f) ? dayOf(f) + (endDay(f) !== dayOf(f) ? ' עד ' + endDay(f) : '') : dayOf(f) + ' ' + (f.status === 'TBD' ? '(שעה לא מאושרת)' : f.dt.slice(11, 16));
      return when + '  ' + titleHe(f).replace(' – ', ' - ') + '  (' + (f.city_he || f.city || '?') + ', ' + (f.comp_he || f.comp) + ')';
    }).join('\n');
  }

  function renderTrip() {
    var list = tripSorted(), body = $('#tripBody');
    $('#tripCount').textContent = list.length;
    if (!list.length) {
      body.innerHTML = '<p class="empty">עוד אין משחקים בטיול. לחץ על "הוסף לטיול" ליד משחק, והוא יופיע כאן עם המרחקים בין המשחקים.</p>';
      return;
    }
    var html = '';
    var lastEnd = list.reduce(function (m, f) { return endDay(f) > m ? endDay(f) : m; }, endDay(list[list.length - 1]));
    var span = Math.round((parseDay(lastEnd) - parseDay(dayOf(list[0]))) / 86400000) + 2;
    html += '<p class="tripsum"><strong>' + list.length + '</strong> אירועים ב-<strong>' + span + '</strong> ימים</p>';
    list.forEach(function (f, i) {
      if (i > 0) { var h = hopInfo(list[i - 1], f); html += '<div class="hop ' + h.cls + '">' + esc(h.text) + '</div>'; }
      var d = parseDay(dayOf(f));
      var homeLogo = f.home_logo ? '<img class="crest" src="' + esc(f.home_logo) + '" alt="" loading="lazy">' : '';
      var awayLogo = f.away_logo ? '<img class="crest" src="' + esc(f.away_logo) + '" alt="" loading="lazy">' : '';
      var stubCtryColor = colorOf(f);
      var ev = isEvent(f), endD = parseDay(endDay(f));
      var stubTag = '<span class="tag" style="--ctry-color:' + stubCtryColor + '">' + (compLogoById[f.comp_id] ? '<img src="' + esc(compLogoById[f.comp_id]) + '" alt="" loading="lazy">' : '') + '<bdi dir="rtl">' + esc(f.comp_he || f.comp) + '</bdi></span>';
      html += '<div class="stub"><div class="date"><span class="num">' + d.getDate() + '</span><span class="mon">' + esc(d.toLocaleDateString('he-IL', { month: 'short' })) + '</span><span class="wd">' + (ev && endDay(f) !== dayOf(f) ? 'עד ' + endD.getDate() + '.' + (endD.getMonth() + 1) : HE_DAYS_FULL[d.getDay()]) + '</span></div>' +
        '<div class="body"><button type="button" class="rm" data-rm="' + f.id + '" aria-label="הסר מהטיול">×</button>' +
        (ev ? '<div class="t"><bdi dir="rtl" class="tname">' + esc(f.emoji || '') + ' ' + esc(titleHe(f)) + '</bdi></div>'
            : '<div class="t">' + homeLogo + '<bdi dir="rtl" class="tname">' + esc(f.home_he || f.home) + '</bdi><span class="vs">–</span><bdi dir="rtl" class="tname">' + esc(f.away_he || f.away) + '</bdi>' + awayLogo + '</div>') +
        '<div class="s">' + stubTag + (ev ? rangeHtml(f) : f.status === 'TBD' ? 'שעה לא מאושרת' : esc(f.dt.slice(11, 16))) + ' · <bdi dir="rtl">' + esc(f.city_he || f.city || 'עיר לא ידועה') + '</bdi>' + (f.venue ? ' · ' + venueHtml(f) : '') + detailBtn(f) + '</div></div></div>';
    });
    var links = bookingLinks(list);
    html += '<div class="tools">' +
      '<label class="field"><span>טיסה מ-</span><div class="combo-wrap"><input id="origin" type="text" autocomplete="off" value="' + esc(S.origin) + '"><div class="combo-menu" id="originMenu"></div></div></label>' +
      links.flights.map(function (f) { return '<a class="btn primary" target="_blank" rel="noopener" href="' + esc(f.url) + '"><bdi dir="rtl">' + esc(f.label) + '</bdi></a>'; }).join('') +
      links.hotels.map(function (h) { return '<a class="btn" target="_blank" rel="noopener" href="' + esc(h.url) + '">חיפוש לינה: <bdi dir="rtl">' + esc(h.city) + '</bdi></a>'; }).join('') +
      '<button type="button" class="btn" id="copyTrip">העתק את הטיול כטקסט</button>' +
      '<button type="button" class="btn" id="clearTrip">נקה את הטיול</button>' +
      '</div><p class="tripnote">קישורי הטיסה והלינה פותחים חיפוש כללי לפי התאריכים של המשחקים (חיפוש הלינה ממוקד סביב האצטדיון עצמו כשהמיקום המדויק שלו ידוע, לא רק מרכז העיר). כשהעיר הראשונה והאחרונה בטיול שונות, מוצגות שתי טיסות חד-כיווניות (הלוך לעיר הראשונה, חזור מהעיר האחרונה) במקום טיסת הלוך-חזור רגילה - ותאריכי הטיסה כדאי להתאים ידנית.</p>';
    body.innerHTML = html;
    combobox($('#origin'), $('#originMenu'), airportItems, {
      onSelect: function (it) { S.origin = it.label; renderTrip(); track('origin_airport_selected', { airport: it.label }); }
    });
    $('#origin').addEventListener('blur', function (e) {
      var v = e.target.value.trim() || 'Ben Gurion International Airport – Tel Aviv, ישראל (TLV)';
      if (v !== S.origin) { S.origin = v; renderTrip(); }
    });
  }

  $('#tripBody').addEventListener('click', function (e) {
    var t = e.target;
    if (t.getAttribute('data-rm')) { toggleTrip(Number(t.getAttribute('data-rm')), 'trip_panel'); return; }
    if (t.id === 'clearTrip') { track('clear_trip', { trip_size: S.trip.length }); S.trip = []; saveTrip(); update(); return; }
    if (t.id === 'copyTrip') {
      track('copy_trip', { trip_size: S.trip.length });
      var txt = tripText(tripSorted());
      var done = function () { t.textContent = 'הועתק ✓'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
      else { fallbackCopy(txt); done(); }
    }
  });
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { }
    document.body.removeChild(ta);
  }
  function update() { renderResults(); renderTrip(); if (S.view === 'map') renderMap(); }

  // ---------- session-details dialog ("פירוט") ----------
  var detailDialog = $('#detailDialog');
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button.detail-btn') : null;
    if (!b) return;
    var f = byId[Number(b.getAttribute('data-detail'))];
    if (!f || !f.sessions) return;
    $('#detailTitle').textContent = titleHe(f);
    $('#detailSub').textContent = fmtLong(dayOf(f)) + (f.sessions_note ? ' · ' + f.sessions_note : '');
    $('#detailRows').innerHTML = f.sessions.map(function (s) {
      return '<div class="drow' + (s.main ? ' main' : '') + '"><span class="dser">' + esc(s.series) + '</span><span class="dname">' + esc(s.name) +
        '</span><span class="dtime"><bdi dir="ltr">' + esc(s.start) + ' - ' + esc(s.end) + '</bdi></span></div>';
    }).join('');
    detailDialog.showModal();
    track('event_details_open', { sport: f.sport || '', title: f.title || '' });
  });
  $('#detailClose').addEventListener('click', function () { detailDialog.close(); });
  detailDialog.addEventListener('click', function (e) { if (e.target === detailDialog) detailDialog.close(); });

  // ---------- legal dialog + version ----------
  $('#appVersion').textContent = APP_VERSION;
  var legalDialog = $('#legalDialog');
  $('#legalBtn').addEventListener('click', function () { legalDialog.showModal(); track('legal_dialog_open', {}); });
  $('#legalClose').addEventListener('click', function () { legalDialog.close(); });
  legalDialog.addEventListener('click', function (e) { if (e.target === legalDialog) legalDialog.close(); });

  // ---------- freshness ----------
  (function () {
    var el = $('#fresh');
    if (!DATA.generated) return;
    var ageDays = (Date.now() - Date.parse(DATA.generated)) / 86400000;
    el.textContent = 'הנתונים עודכנו ב-' + new Date(DATA.generated).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (ageDays > 2) { el.classList.add('stale'); el.textContent += ' · כדאי להריץ שוב את build_fixtures.py'; }
  })();

  update();
})();
