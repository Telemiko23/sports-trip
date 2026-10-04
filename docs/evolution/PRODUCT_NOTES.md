# Product notes — ToSport v2 (destination-first planning)

Branch `evolution/v2-20261002`. Baseline: tag `baseline-v1.17.0-20261002` (see `ROLLBACK.md`). This is an engineering design
record, not a user study; the hypotheses at the end are for revisiting once real usage exists.

## 1. The flow

```
 First visit ──► destination + dates (fixed | flexible) ──► Discover (חיפוש אירועים)  ◄─────────────┐
   │  "עדיין אין לי יעד" = deliberate global browsing                │ list | map, sport chips,        │
   │                                                                 │ draft filter sheet, day bar     │
   └─ flexible ─► Plan (תכנון טיול) ◄──────────────────────────────┐ │ event detail (every event)      │
                    pace · lodging · optional sports/team          │ ▼                                 │
                    windows (≤3) or proposals (≤3), PREVIEW ONLY ──┴─► add / merge ──► My trip (הטיול שלי)
                    lock · exclude · replace · regenerate                 day-by-day, free time, decisions,
                                                                          notes, travel links, export/import
```

* Returning visitors: «המשך הטיול שלי» / «חיפוש חדש»; if every saved date has passed the banner says so, offers new dates and
  keeps old selections (nothing is shifted silently).
* Fixed dates are hard boundaries everywhere (Discover, Plan, trip). A flexible request opens Plan, which proposes up to three
  real windows with actual dates; choosing one commits it as the fixed dates for search, trip and travel searches.
* Manual discovery is never gated behind generated proposals: Discover shows the exhaustive list for the same context.

## 2. Shared components (one implementation each)

| Concern | Where |
| --- | --- |
| Domain: catalog, occurrence ids, destination resolution, query, groups, date/time/place formatting, trip derivations, travel links, pair notes | `js/model.js` (pure; Node-testable) |
| State: one serializable state + ONE reducer + persistence + legacy migration + export/import | `js/store.js` |
| Rendering builders (cards, dialogs, trip, nav, forms) | `js/ui.js` |
| Strings (Hebrew complete; en/ar prepared, empty, no selector) | `js/i18n.js` |
| Accessible autocomplete (ARIA 1.2 combobox) | `js/combo.js` |
| Planning engine (parse, propose, alternatives, rebuild) — rule-based, deterministic, DOM-free | `planner.js` |
| Plan tab | `js/planview.js` |
| Ticket resolver + renderers (provider-neutral) | `js/tickets.js` |
| Controller: wires store ↔ DOM, history, dialogs, map (lazy Leaflet), toasts | `app.js` |

One sport-identity renderer (`SPORT_REGISTRY` / `sportLabelHtml`), one event card, one place renderer, one note renderer and one
alternatives list (Plan preview and My trip use `planView.altListHtml`). There is one navigation element (`#mainNav`: top tabs on
desktop, fixed bottom bar ≤ 760 px, same DOM) and one planner engine for every viewport.

## 3. State contract

```
{ v: 2,
  context: { dest: {kind:'city'|'country', …} | null, dates: {mode:'fixed'|'flexible', from, to, days?, weekdays?} | null, radiusKm, browse },
  filters: { sports: [ids] | null, excludedComps: {}, excludedWeekdays: {} },          // optional; reset never touches context/trip
  prefs:   { pace: 'single'|'balanced'|'sport', lodging: 'single'|'multi' },
  trip:    { entries: [{ id, locked, addedAt, snap }], excluded: [ids], arrival, departure, origin },
  meta:    { onboarded, lastVisit },
  ui:      { tab, mode, day, pin, draft, undo, storageOk, notice } }                   // never persisted
```

* Persisted: `tosport_v2_context` (context + filters + prefs + meta) and `tosport_v2_trip`. Legacy `tripIds_v1`, `filterCtx_v1`,
  `onboarded_v1` are **read once and never modified**; a recoverable copy goes to `tosport_legacy_backup_v1` before the v2 trip is
  created; migration is idempotent; ids absent from the feed are kept (with whatever snapshot exists), malformed data is reported
  not erased.
* Draft state (filter sheet) lives in `ui.draft`; apply/cancel are explicit actions. `FILTERS_RESET` clears optional filters only.
* Selected map pin, dialog state and committed context are separate; a pin never changes the destination (only «חיפוש סביב המקום
  הזה» does).
* Every transition is an action in `store.reduce`; subscribers render. Back closes dialogs / returns to the previous tab and never
  leaves with an unsaved trip. `localStorage` is single-device; nothing claims sync.
* Import is size-limited (400 KB) and schema-validated; every field read from storage/import is re-validated.
* Plan-only memory (not persisted, by design): locks on not-yet-added proposals, optional max-events, the parsed team preference
  (alive only while its text is).

## 4. Planning rules (what the engine does and refuses to do)

* Pace is a *target*: single = one event (a shortlist of alternatives), balanced = ≈ one per two days (default, editable),
  sport = as many as constraints allow. Free time is shown as free time. Generated proposals never place two events on one day
  unless both start times are known, ≥ 5 h apart and local (sport pace only); manual selections are unrestricted and get notes.
* Hard constraints: fixed dates, exclusions, locked and already-in-trip entries, the destination boundary, no unverified transfer.
  Soft: team, sport mix, competition tier, fewer moves.
* Tier (`COMP_TIER`, editorial, versioned) is compared only inside one sport within the candidate set; a sport with no tier signal
  gets the neutral midpoint, so tennis/darts/motorsport are neither buried nor floated. A UEFA competition is never inferred from a
  geographic `country === 'Europe'`; competition identity is used.
* No travel-time authority: distance is a straight-line estimate, 70 km/h is gone. Water crossings and > 150 km moves are not
  generated automatically (`transferKind` = unverified); they can be added by hand and are explained with a directions link.
  Unknown start/finish = uncertainty, not zero duration. Unlocated or provisional-location events (United Cup) are not routed.
* Alternatives are real differences (event set / window / base city / sport mix) and are deduplicated by event set; labels are
  derived from facts (ללא החלפת עיר, פחות מעברים, שילוב X ו־Y, כולל משחק של …) and shown only when true.
* The parser is a replaceable boundary (`Planner.parse`): it only recognises destination, month/part, duration, sports and a team;
  the UI shows what was understood and says everything else was not applied.

## 5. Intentional supersessions

| v1 behaviour | v2 |
| --- | --- |
| One event per day objective; 70 km/h feasibility | Pace presets; straight-line estimate only; unverified transfers never auto-generated |
| "Flexible" = today + 45 days | Real flexible windows (month/part, duration, start weekday) or a truthful lack-of-coverage message |
| Competition tree always expanded; filters applied live | Draft sheet (apply/cancel); sport chips live; optional filters reset without touching the trip |
| Pin click re-centred the destination | A pin only inspects; «חיפוש סביב המקום הזה» is the explicit action |
| `country === 'Europe'` UEFA detection | Competition identity; no geographic guess |
| Duplicate My-trip entry points | One `#mainNav` |
| `airports.js` loaded up front (600 KB) | Loaded on first use of the trip's departure-airport field |
| Parser copy exposed technical wording | Plain "what we understood" line |
| No tests | Unit (Node), Python, Playwright (desktop + mobile), axe, keyboard, rollback proof |

## 6. Hypotheses to revisit with real usage (not findings)

* Destination + dates first reaches useful results faster than team-first; measure `context_submit` → first `add_to_trip`.
* Balanced pace (≈ 1 per 2 days) is the right default; watch `pace_change` distribution.
* Flexible windows are used; watch `context_submit.date_mode` and `window_choose`.
* Travelers want a price on the card; ticket clicks (`ticket_link_click`) are not purchases and no revenue is claimed from them.
* Time-to-first-add is recorded as a future observed metric; no improvement percentage is claimed.
