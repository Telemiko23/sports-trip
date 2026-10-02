# Capability inventory — ToSport v1.17.0 (baseline), written 2026-10-02

Based on reading `app.js` (1,210 lines), `planner.js`, `index.html`, the two data workflows and the generated
data — not on the older documentation. Baseline = tag `baseline-v1.17.0-20261002` (commit `de87418`, equal to
public `main` at the time; `origin/main` was fetched and had not moved).

Data facts that shape the design: `fixtures.js` generated `2026-09-29T11:15`, 2,776 records
(2,741 football · 15 tennis · 12 darts · 8 F1), kick-off range 2026-09-28 → 2027-01-27 (`days_ahead` 120).
`dt` is a **naive venue-local timestamp** (no timezone field anywhere). 35 non-football records are multi-day
events; 7 of them carry session tables; 23 have an official `web_url`; none has a `tickets_url`.

## Present and working (verified in code and by the baseline capture)

| Area | What exists |
| --- | --- |
| Entry | Compact first-visit screen (destination + date mode + «מצאו אירועים»), skip link, Enter/Escape; `onboarded_v1` + `filterCtx_v1` resume. The "flexible dates" option only keeps the default *today → +45 days* range. |
| Search | Chronological list grouped by local day; base city + radius (straight-line), date range, weekday chips, competition tree; List/Map switch inside the search destination; live count badge; mobile filter sheet (applies **live**, not a draft). |
| Map | Leaflet + OSM; one pin per exact stadium, a panel of the pin's events; pin click **re-centres the destination** (v1.6 rule). Map failure leaves the list usable (`typeof L` guard). |
| Event model | Multi-day events expand to per-day items with stable ids `eventId*100+n`; session tables for 7 events («פירוט»); sport registry (`SPORT_REGISTRY`, `sportIdOf`, `sportLabelHtml`) with football / motorsport / tennis / darts / unknown. |
| Planner | Rule-based parser (`Planner.parse`, not an LLM); `Planner.plan` DP: at most one event per day, hop cost from straight-line km, weekend anchoring, team preference bonus (+500), `COMP_TIER` bonus (×10), "mid-end" month parts, factual option titles. |
| Trip | `tripIds_v1` in localStorage; chronological stubs; hop/overlap notes; flight + Booking links (round trip / two one-ways, origin airport autocomplete from `airports.js`); copy-as-text; clear. R3 date agreement fixed. |
| Regression fixes | R1 (invalid destination keeps applied results + explanation), R4 (Plan inherits context), R5 (no fake tab), R6 (names wrap), v1.16 active-destination hint. |
| Data pipeline | Daily `update-fixtures.yml` and weekly `update-events.yml` (both push to `main`, share concurrency group `data-update`); overrides, `venues_cache.json`, `cities_*.json`, `check_coordinates.py`, missing-info/translation reports. |

## Present but needs verification (or is known to be wrong for the new goals)

| Item | Why |
| --- | --- |
| Paste/Enter path of the free-text planner | `#smartText` listens to `change` (fires on blur) and Enter-`keydown`; the documented rule "wire to `input`" is not what the handler does. Needs a real paste→click test (**P04**). |
| Travel time | Planner uses `distance / 70 km/h + 1.5 h` as if authoritative. London→northern France looks close but crosses water. Must stop being presented as feasibility (§5.4 of the brief). |
| Time truth | Naive local `dt` is displayed as venue-local with a generic reminder; no tz provenance; `new Date('YYYY-MM-DD')` style parsing is avoided today (uses `parseDay`) but nothing tests it. |
| `COMP_TIER` | Editorial heuristic, hand-keyed by English competition name; tennis/darts/motorsport are mostly unranked (0) so they lose to every tiered football match. `planLabel` classifies UEFA competitions via `country === 'Europe'`. |
| Event identity across feed refreshes | Trip stores bare ids; an id that disappears from the rolling feed is silently dropped on load (`filter(id => byId[id])`). |
| Accessibility | Global focus ring, labels on most controls, dialogs via `<dialog>`; no automated or screen-reader verification, combobox lacks `role=combobox/listbox` semantics. |
| Analytics | Event names documented in `ANALYTICS.md`; no UI-version dimension; preview traffic not isolated. |

## Absent (to build in this delivery unless marked "next")

Draft-vs-applied filter contract · genuine flexible-date windows · pace presets (the planner forces one event per
day) · lock / exclude / replace / regenerate · undo on removal · explicit trip arrival/departure dates · saved event
snapshots and "no longer in the latest feed" reconciliation · versioned trip document + legacy migration backup ·
JSON export/import · tournament parent grouping with day/session choice · useful detail view for every event ·
multi-location provenance (United Cup) · returning-visitor summary / «המשך הטיול שלי» · day selector ·
«חיפוש סביב המקום הזה» · string extraction (i18n) · ticket integration and states · Playwright/unit tests ·
share URL and `.ics` (next phase, per brief §10) · English/Arabic completion and a selector (next release) · PWA (deferred).

## Interaction map (what talks to what)

`fixtures.js` → `expandDays()` → `fixtures[]`/`byId` → `filtered()` (reads global `S`) → `renderResults` / `renderMap` /
`renderPanel` / `renderTrip` (all via the shared `cardHtml`/`tagHtml`/`placeHtml`) → `update()` is the single re-render
entry; `S` is a closure-global object with no transitions layer. Planner: `runSmart()` reads the DOM form directly,
builds `items`, calls `Planner.plan`, renders into `#smartResult`. Persistence is three `localStorage` keys written by
scattered call sites. This is why v2 introduces an explicit store (see `PRODUCT_NOTES.md`).

## Documentation conflicts resolved by this delivery (record, do not delete history)

1. Navigation is **חיפוש אירועים** (not גילוי אירועים); marketing copy may use גלו.
2. Cobalt/ink/paper identity, Heebo and the SVG logo are accepted.
3. Sport registry exists; MULTISPORT's latest "implemented" section governs; horse racing is **not** motorsport.
4. STATUS "Portugal/Nations League not verified" and old missing-data counts are stale — both verified/ingested later.
5. Parser disclosure vs. later removal of technical copy → honest functional copy (what is supported + what was understood).
6. A prestige weight is an editorial heuristic; historical third-party terms/prices in docs are not verified requirements.
