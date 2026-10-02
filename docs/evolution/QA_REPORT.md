# QA report — ToSport v2 (branch `evolution/v2-20261002`)

Run on 2026-10-02/03 on Windows 11, Node 24, Python 3.14, Playwright 1.63 (Chromium). Nothing was pushed or deployed.
This is engineering verification with deterministic synthetic feeds and a fixed clock (2026-10-02 10:00 Jerusalem) — not a
user study, not a real-device test, and **not evidence of a live ticket-provider integration**.

## 1. What was run (final numbers)

| Suite | Command | Result |
| --- | --- | --- |
| Unit (Node) — model, store, planner, tickets, i18n key coverage | `npm run test:unit` | **52 / 52 pass** |
| Python — ticket matching, adapter failure modes, snapshot allowlist, atomic write | `npm run test:py` | **35 / 35 pass** |
| End-to-end — 52 scenarios × 2 projects (desktop Chrome 1280×800, **Pixel 7 emulation** 390×844) | `npx playwright test` | **104 / 104 pass** |
| Rollback proof — baseline → v2 → baseline on one browser profile/origin | `node tests/capture/rollback-proof.mjs` | **8 / 8 checks pass** |
| Performance sanity (4× CPU + ~Fast 4G, real feed) | `node tests/capture/perf.mjs` | see §4 |
| Cross-engine (Firefox, WebKit) | `PW_ENGINES=all npx playwright test` | **not run** — projects are configured, the browser binaries are not installed on this machine (a download that was not authorized in this session) |

## 2. Scenario coverage (brief IDs)

| ID | Where | Notes |
| --- | --- | --- |
| P01 first visit, London 9–11 Oct | `journey.spec` | exact dates carried to My trip (2 nights, free day shown), no sport choice required |
| P02 flexible month + duration | `plan.spec`, `planner.test.js` | real windows with dates inside the month; choosing one fixes the dates in search; month beyond the feed → truthful message |
| P03 invalid destination | `journey.spec` | first visit blocks with an explanation; in-place edit keeps applied destination/results; prefix is a suggestion |
| P04 paste + click; typing + Enter | `plan.spec` | **real input events** (`insertText` = paste-like, no keydown; `pressSequentially`), not only `Planner.parse`; Arsenal fixture + alternatives in `tests/fixtures/plan-data.js` |
| P05 manual edits / clearing text | `plan.spec` | edits kept; clearing removes the team preference only |
| P06 «אנגליה», «אמצע-סוף ינואר» | `plan.spec`, `planner.test.js` | country ≠ team; mid+end window |
| P07 add from list/map/plan, resize, refresh | `journey.spec`, `map.spec`, `plan.spec` | no duplicates; focus stays; map does not move on add |
| P08 draft filters | `features.spec` | apply/cancel/Escape/reset; destination, dates, trip survive |
| P09 pace presets | `plan.spec`, `planner.test.js` | single → one-event proposals; balanced ≤ 2 in 3 days; sport > balanced; free time shown; tier fairness unit-tested |
| P10 lock/exclude/replace/regenerate | `plan.spec` | locked event in every proposal; excluded never returns; replace preview shows consequences; trip replace in My trip, undo |
| P11 conflicts/uncertainty | `plan.spec`, `planner.test.js` | no cross-Channel/long auto-moves; same-day only with known, separated times; manual pair explained |
| P12 multi-day + United Cup | `features.spec` | one group, day ids kept, provisional multi-city location, no false single-city venue |
| P13 flights/hotels | `plan.spec` | links agree with the exact fixed dates; two cities → one-ways + two stays; dates not extended |
| P14 long names, zoom, keyboard | `a11y.spec` | 320 px no horizontal scroll; 200 % root font no truncated titles; focus ring ≥ 2 px; keyboard-only plan flow |
| P15 price states | `tickets.spec`, `tickets.test.js` | only exact+fresh+known-basis shows a number; unknown fees/quantity/currency/scope → price-free |
| P16 quote expiry, optional data | `tickets.spec`, `tickets.test.js` | expiry on an open page without reload; 404 / malformed / wrong-schema offers → product unaffected |
| P17 ambiguous / reversed / session / rescheduled | `test_tickets.py`, `tickets.spec` | quarantined with reasons; no price, no link |
| P18 empty vs errors | `test_tickets.py` | 401/403 (no retry), 429 (bounded), 5xx/network, schema drift ≠ "no inventory"; mid-pagination failure aborts publish |
| P19 storage, migration, import, rollback | `features.spec`, `store.test.js`, rollback proof | malformed/unavailable storage, idempotent migration, export → clear → import, baseline runnable |
| P20 feed changes under a saved trip | `features.spec` | changed → reconcile prompt; vanished → kept and explained (not "cancelled") |
| P21 hostile data | `features.spec`, `plan.spec` (P21b), `tickets.test.js` | markup/URLs inert in list, Plan, alternatives, excluded list; link lookalikes rejected |
| P22 blocked network | `features.spec`, `tickets.spec` | map library blocked → list works with explanation; analytics/tiles blocked in every run |

## 3. Accessibility (what automation and keyboard checks cover — and what they don't)

* **axe (WCAG 2.0/2.1/2.2 A+AA rules)** on: first visit, results, event dialog, filter dialog, My trip, Plan with proposals, Plan replace
  panel, Plan empty state — desktop and mobile emulation: **no violations after fixes** (two real ones found and fixed: `role=note` on list
  items, `role=group` on a list item).
* Keyboard: Enter/Space/Escape, roving-tab arrows (RTL-aware), combobox (Enter picks only a highlighted option), focus return after
  dialogs, focus kept after list re-renders, Back closes a dialog first.
* **Needs a human/real-device handoff (not claimed):** screen readers (NVDA/JAWS/VoiceOver/TalkBack), real touch, real zoom/text-size
  settings, forced-colors/high-contrast, reduced-motion behaviour, iOS Safari/Android Chrome rendering, an expert audit.

## 4. Performance sanity (emulated, real 2,950-occurrence feed)

Chromium Pixel-7 profile, CPU ×4, ~1.6 Mbps / 150 ms RTT, local `http.server` **without compression**.

| Step | Time |
| --- | --- |
| First search (type, pick, submit) | ~190–250 ms |
| Plan tab first proposals / pace switch / flexible month (3 windows) | ~100 / ~130 / ~190 ms |
| Back to Discover (pagination) | ~160–180 ms |
| Page load (DCL = load) | ~14.1 s before → **~10.9 s** after lazy-loading `airports.js` (600 KB) |

The load time is dominated by `fixtures.js` (1.4 MB uncompressed here; GitHub Pages serves it gzip-compressed, so real transfer is a
fraction — this number is an upper bound, not a measurement of production). Rendering is paginated (60 cards + «הצג עוד»); the
planner never renders cards. Long tasks observed: 5 tasks of 83–189 ms during load/first render at 4× throttling. Not done: a
service-worker/caching strategy (deliberately deferred), splitting `fixtures.js`.

## 5. Failures found and fixed during the work

Legacy entries missing from the feed vanished from the trip view (now an explicit "undated" decision list) · malformed legacy data showed
the "migrated" toast (now the issue toast wins) · map pins were pointer-only (own keydown handler) · empty grid column on the trip tab ·
multi-day group card collapsed into a narrow column on desktop · price chip wrapped as an oversized pill on mobile · Plan offered a
cross-Channel base city for a London trip (now an unverified transfer is never a generated base; a count says how many were skipped) ·
single/sport paces returned one proposal only (alternatives without each lead event) · `role=note`/`role=group` list semantics (axe) ·
`airports.js` blocked first paint (lazy) · `venue_maps_click`/`legal_dialog_open` analytics had been dropped (restored).

## 6. Known gaps and deferrals (with reasons)

| Item | Status |
| --- | --- |
| Live ticket prices | **Blocked externally** (entitlement, price basis, caching terms, deep link) — `TICKETS.md` §5 has the one-list of inputs |
| Firefox / WebKit runs | Configured, **not run** (binaries not installed; download not authorized here) |
| Real devices, screen readers | Handoff |
| Map marker clustering | Deferred; the list is the accessible alternative |
| English / Arabic UI | Strings extracted + direction support; no selector until a locale is genuinely translated |
| Share URL / `.ics` | Next (no fake timed events for unknown times); JSON backup/copy shipped |
| PWA/offline | Deferred until version/freshness behaviour is designed |
| Baseline screenshot of the session dialog | Not captured (baseline opens it only for tournament days; covered by tests in v2) |
| Rollback of v2-only data into an unchanged v1 | Not possible by design (documented in `ROLLBACK.md`; export + `tools/restore-legacy.md` carries selections/filters) |
| COMP_TIER coverage | Still thin for tennis/darts/F1 (handled by within-sport normalisation, not by inventing tiers) |

## 7. Screenshots

`docs/evolution/screenshots/baseline/*` (before) and `docs/evolution/screenshots/v2/*` (after, desktop + mobile): first entry, results,
Plan with fixed proposals, flexible windows, replace preview, ticket states on cards (**mock offers**), event detail with a mock priced
offer, populated trip; `rollback-v2.png`, `rollback-baseline-again.png`. Reviewed by eye; two layout defects (group card, price chip)
were found this way and fixed. Regenerate: `node tests/capture/v2-shots.mjs`.

## 8. Internal task walkthrough (engineering inspection)

After each slice the main path was walked end-to-end by script and by eye: *London + dates → results → add → My trip → refresh*,
*flexible month → windows → choose → add*, *pasted sentence → proposal → lock/exclude/replace → add*, *ticket states*. Friction found
and fixed is in §5. Open questions for real usage are in `PRODUCT_NOTES.md` §6.
