/* ToSport v2 - ticket enrichment (frontend half). Provider-neutral and lazily loaded: a failure here can never break search,
   the trip or the planner. Pure resolver + renderers (testable in Node with a fake clock); the loader is browser-only.

   Data comes from tickets/offers.json, an ALLOWLISTED derived snapshot produced by a trusted job (see TICKETS.md). Raw
   provider responses, credentials and match internals never reach this file. Numeric prices are OFF unless the snapshot
   itself says `priceDisplay: true`, which the build job only writes after the activation checklist is satisfied.

   Truthfulness rules implemented in resolve():
   - a number is shown ONLY for an exact/reviewed match on the exact occurrence, with a known fee basis, a safe approved link,
     a sane currency, and an unexpired quote - expiry is computed from the quote's own fetchedAt with the CURRENT clock, so an
     old tab, a stale CDN copy or a dead CI job cannot keep a price alive;
   - unknown is an explicit state, never an assumed zero/true; no urgency, discounts, "last tickets" or "sold out" claims;
   - a day/session/pass scope that does not cover the occurrence is never priced for it; passes are never priced per day. */
(function (root, factory) {
  var M = typeof require === 'function' && typeof module === 'object' ? require('./model.js') : root.ToSport.model;
  var I = typeof require === 'function' && typeof module === 'object' ? require('./i18n.js') : root.ToSport.i18n;
  var api = factory(M, I);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ToSport = root.ToSport || {}; root.ToSport.tickets = api; }
})(typeof self !== 'undefined' ? self : this, function (M, I) {
  'use strict';
  var t = I.t, esc = M.esc;

  /* ---------- configuration ---------- */
  // Approved outbound hosts (the provider's documented retail/tracking domains). PROVISIONAL until the owner confirms them with the
  // account manager - see TICKETS.md. A link whose host is not listed is treated as absent.
  var ALLOWED_HOSTS = ['sportsevents365.com'];
  var CURRENCIES = ['EUR', 'USD', 'GBP', 'ILS'];
  var PROVIDER = { id: 'sportsevents365', name: 'Sports Events 365' };
  // The validity window is NOT a commercial SLA. Production value = what the provider requires and what the collection cadence
  // can support (TICKETS.md). Until validated nothing numeric is shown at all; tests inject their own value with a fake clock.
  var DEFAULT_TTL_MIN = 60;
  var CLOCK_SKEW_MS = 5 * 60 * 1000;

  var state = { loaded: false, failed: false, doc: null, ttlMin: DEFAULT_TTL_MIN, now: function () { return Date.now(); } };

  /* ---------- validation helpers ---------- */
  function hostAllowed(host) {
    host = String(host || '').toLowerCase();
    return ALLOWED_HOSTS.some(function (h) { return host === h || host.slice(-(h.length + 1)) === '.' + h; });
  }
  function safeOutbound(u) {
    if (typeof u !== 'string' || u.length > 600) return null;
    var safe = M.safeUrl(u); if (!safe) return null;
    var m = /^https:\/\/([^\/?#:]+)(?::\d+)?(?:[\/?#]|$)/i.exec(safe);
    return m && hostAllowed(m[1]) ? safe : null;
  }
  function ms(iso) { var n = Date.parse(iso); return isFinite(n) ? n : null; }
  function docTtlMin(doc) { var n = doc && Number(doc.ttlMinutes); return n > 0 && n <= 24 * 60 ? n : state.ttlMin; }

  /* ---------- the resolver: one truthful state per occurrence ---------- */
  // returns {state, offer, reason, expiresAt}
  //   state: priced | link | expired | none | unmatched | ambiguous
  function resolve(ev, doc, nowMs) {
    if (!doc || typeof doc !== 'object' || !doc.offers || typeof doc.offers !== 'object') return { state: 'unmatched', reason: 'no-data' };
    var offer = doc.offers[String(ev.id)];
    if (!offer || typeof offer !== 'object') return { state: 'unmatched', reason: 'no-offer' };
    if (offer.match === 'ambiguous') return { state: 'ambiguous', reason: 'ambiguous' };
    if (offer.match !== 'exact' && offer.match !== 'reviewed') return { state: 'unmatched', reason: 'match-not-trusted' };
    var url = safeOutbound(offer.url);
    var fetched = ms(offer.fetchedAt), ttl = docTtlMin(doc) * 60000;
    var fresh = fetched != null && fetched <= nowMs + CLOCK_SKEW_MS && nowMs < fetched + ttl && (!offer.expiresAt || (ms(offer.expiresAt) != null && nowMs < ms(offer.expiresAt)));
    var expiresAt = fetched != null ? Math.min(fetched + ttl, offer.expiresAt && ms(offer.expiresAt) != null ? ms(offer.expiresAt) : Infinity) : null;

    if (offer.status === 'no-offers') {
      // an explicit "nothing right now" is itself a timestamped claim: once stale it degrades to a plain link/unknown
      return fresh ? { state: 'none', offer: offer, expiresAt: expiresAt } : (url ? { state: 'expired', offer: offer, url: url, reason: 'stale', expiresAt: expiresAt } : { state: 'unmatched', reason: 'stale-no-link' });
    }
    if (!url) return { state: 'unmatched', reason: 'no-safe-link' };
    if (offer.status !== 'priced') return { state: 'link', offer: offer, url: url, reason: 'no-price' };

    // priced: every condition must hold, otherwise we fall back to a price-free link (never to a guessed number)
    if (doc.priceDisplay !== true) return { state: 'link', offer: offer, url: url, reason: 'prices-off' };
    if (offer.scope !== 'occurrence') return { state: 'link', offer: offer, url: url, reason: 'scope-' + String(offer.scope || 'unknown') };
    if (offer.feesIncluded !== true && offer.feesIncluded !== false) return { state: 'link', offer: offer, url: url, reason: 'fee-basis-unknown' };
    if (!(typeof offer.amount === 'number' && isFinite(offer.amount) && offer.amount > 0) || CURRENCIES.indexOf(offer.currency) === -1) return { state: 'link', offer: offer, url: url, reason: 'bad-amount' };
    if (offer.quantityBasis !== 'per-ticket') return { state: 'link', offer: offer, url: url, reason: 'quantity-basis' };
    if (!fresh) return { state: 'expired', offer: offer, url: url, reason: 'stale', expiresAt: expiresAt };
    return { state: 'priced', offer: offer, url: url, expiresAt: expiresAt };
  }

  /* ---------- rendering ---------- */
  function money(amount, currency) {
    var v = Math.ceil(amount * 100 - 1e-9) / 100;                    // never round DOWN into a cheaper-looking offer
    try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: currency, minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(v); }
    catch (e) { return currency + ' ' + v; }
  }
  function when(isoStr) {
    var d = new Date(isoStr); if (isNaN(d)) return '';
    return d.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  var disclosureShort = function () { return '<p class="tix-disclosure hint">' + esc(t('tix.disclosure')) + '</p><details class="tix-more"><summary>' + esc(t('tix.disclosureMore')) + '</summary>' + disclosureHtml() + '</details>'; };

  // a compact line for list/trip cards. Quiet when there is nothing to say; never a number unless resolve() says priced.
  function chipHtml(ev, nowMs) {
    if (!state.doc) return '';
    var r = resolve(ev, state.doc, nowMs == null ? state.now() : nowMs);
    if (r.state === 'priced') return '<span class="tix-chip tix-chip--price" data-tix="priced"><bdi>' + esc(t('tix.from', { price: money(r.offer.amount, r.offer.currency) })) + '</bdi> · ' + esc(PROVIDER.name) + '</span>';
    if (r.state === 'link' || r.state === 'expired') return '<span class="tix-chip" data-tix="' + r.state + '">' + esc(t(r.state === 'expired' ? 'tix.priceAtProviderFresh' : 'tix.priceAtProvider')) + '</span>';
    if (r.state === 'none') return '<span class="tix-chip" data-tix="none">' + esc(t('tix.noOffers')) + '</span>';
    return '';                                                       // unmatched/ambiguous: nothing on the card (the dialog explains)
  }

  function linkHtml(ev, r, labelKey) {
    return '<a class="btn' + (r.state === 'priced' ? ' primary' : '') + '" href="' + esc(r.url) + '" target="_blank" rel="sponsored noopener noreferrer" data-link="ticket" data-tix-state="' + r.state +
      '" data-tix-provider="' + PROVIDER.id + '" data-tix-scope="' + esc(r.offer && r.offer.scope || '') + '">' + esc(t(labelKey || 'tix.check')) + '</a>';
  }
  function basisHtml(r) {
    var o = r.offer, rows = [];
    rows.push(t('tix.basis.perTicket'));
    rows.push(o.feesIncluded ? t('tix.basis.feesIn') : t('tix.basis.feesOut'));
    if (o.fetchedAt) rows.push(t('tix.basis.fetched', { when: when(o.fetchedAt) }));
    return '<ul class="tix-basis">' + rows.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  // the ticket section of the event dialog (also reachable without any price: official link + honest explanation)
  function detailHtml(ev, nowMs) {
    var official = ev.ticketsUrl ? '<p><a class="btn" href="' + esc(ev.ticketsUrl) + '" target="_blank" rel="noopener noreferrer" data-link="official-tickets">' + esc(t('tix.official')) + '</a></p>' : '';
    if (!state.doc) return official ? official + '<p class="hint">' + esc(t('ev.ticketsNone')) + '</p>' : null;
    var r = resolve(ev, state.doc, nowMs == null ? state.now() : nowMs), body = '', scope = r.offer && r.offer.scope;
    if (r.state === 'priced') {
      body = '<p class="tix-price" data-tix="priced"><strong><bdi>' + esc(t('tix.from', { price: money(r.offer.amount, r.offer.currency) })) + '</bdi></strong> · ' + esc(PROVIDER.name) + '</p>' + basisHtml(r) +
        (r.offer.feesIncluded ? '' : '<p class="hint">' + esc(t('tix.mandatoryExtras')) + '</p>') + '<p class="hint">' + esc(t('tix.minNotGroup')) + '</p>' + '<p>' + linkHtml(ev, r, 'tix.check') + '</p>' + disclosureShort();
    } else if (r.state === 'link' || r.state === 'expired') {
      var label = scope === 'parent-event' ? 'tix.checkEvent' : 'tix.check';
      body = '<p data-tix="' + r.state + '"><strong>' + esc(t(r.state === 'expired' ? 'tix.priceAtProviderFresh' : 'tix.priceAtProvider')) + '</strong></p>' +
        (scope === 'parent-event' ? '<p class="hint">' + esc(t('tix.chooseDay')) + '</p>' : '') + (scope === 'pass' ? '<p class="hint">' + esc(t('tix.passNote')) + '</p>' : '') +
        (r.state === 'expired' ? '<p class="hint">' + esc(t('tix.expired')) + '</p>' : '') + '<p>' + linkHtml(ev, r, label) + '</p>' + disclosureShort();
    } else if (r.state === 'none') {
      body = '<p data-tix="none"><strong>' + esc(t('tix.noOffers')) + '</strong></p><p class="hint">' + esc(t('tix.noOffersNote')) + '</p>';
    } else {
      body = '<p data-tix="' + r.state + '" class="hint">' + esc(t('tix.unavailable')) + ' ' + esc(t('tix.unavailableWhy')) + '</p>';
    }
    return official + body;
  }

  function disclosureHtml() {
    return '<div id="tixInfo" class="tix-info"><h3>' + esc(t('tix.infoTitle')) + '</h3><ul>' + ['commission', 'checkout', 'min', 'fees', 'fresh'].map(function (k) { return '<li>' + esc(t('tix.info.' + k)) + '</li>'; }).join('') + '</ul></div>';
  }

  /* ---------- loading (browser): lazy, failure-tolerant, never trusts HTTP caching for validity ---------- */
  function setDoc(doc) {
    state.doc = doc && typeof doc === 'object' && doc.schema === 1 && doc.offers ? doc : null;
    state.loaded = true; state.failed = !state.doc;
    return state.doc;
  }
  function load(url, fetchImpl) {
    var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!f) return Promise.resolve(null);
    return f(url, { cache: 'no-store', credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).then(setDoc).catch(function () { state.loaded = true; state.failed = true; return null; });
  }
  // earliest instant at which a currently-priced offer in the snapshot stops being valid after `nowMs` (null when none will)
  function nextExpiry(nowMs) {
    if (!state.doc) return null;
    var best = null;
    Object.keys(state.doc.offers).forEach(function (id) {
      var o = state.doc.offers[id]; if (!o || o.status !== 'priced') return;
      var f = ms(o.fetchedAt); if (f == null) return;
      var e = Math.min(f + docTtlMin(state.doc) * 60000, o.expiresAt && ms(o.expiresAt) != null ? ms(o.expiresAt) : Infinity);
      if (e > nowMs && (best == null || e < best)) best = e;
    });
    return best;
  }
  function configure(o) { if (o.ttlMin > 0) state.ttlMin = o.ttlMin; if (typeof o.now === 'function') state.now = o.now; }
  function reset() { state.doc = null; state.loaded = false; state.failed = false; }

  return { resolve: resolve, chipHtml: chipHtml, detailHtml: detailHtml, disclosureHtml: disclosureHtml, money: money, safeOutbound: safeOutbound, hostAllowed: hostAllowed,
    setDoc: setDoc, load: load, nextExpiry: nextExpiry, configure: configure, reset: reset, status: function () { return { loaded: state.loaded, failed: state.failed, hasData: !!state.doc }; },
    PROVIDER: PROVIDER, ALLOWED_HOSTS: ALLOWED_HOSTS, CURRENCIES: CURRENCIES, DEFAULT_TTL_MIN: DEFAULT_TTL_MIN };
});
