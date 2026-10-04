# ToSport - project instructions

Static site (vanilla JS/CSS/HTML, no build step, no backend), GitHub Pages, Hebrew RTL by
default. Full history and detailed rationale live in `ROADMAP.md`/`STATUS.md` - this file is
the short, durable core. Detailed guidance lives in its own file; don't duplicate it here.

## Product contract
1. **Destination-first, not team-first.** ToSport starts with a destination and dates; sports
   are optional discovery preferences. Support both fixed dates and flexible-date/destination
   planning. Do not turn this into a football-only or team-first tool.
2. **Three fixed top-level destinations**: Discover (`חיפוש אירועים` - the Hebrew label was
   `גילוי אירועים` through v1.13.0; renamed 2026-09-30, the user doesn't want an evocative verb
   for a functional search/nav label, only for onboarding-style marketing copy) / Plan
   (`תכנון טיול`) / My trip (`הטיול שלי`). Discover owns its own List/Map switch - planning is
   not a third display mode alongside them. Keep this naming and structure stable. Plan only
   produces **previews** (nothing enters the trip until the user adds it); manual discovery is
   never gated behind generated proposals. Flow, components, state contract and intentional
   supersessions: `docs/evolution/PRODUCT_NOTES.md`.
3. Preserve working capabilities, stable occurrence IDs, `localStorage` compatibility (legacy
   `tripIds_v1`, `filterCtx_v1`, `onboarded_v1` are read-only forever; v2 keys `tosport_v2_context`,
   `tosport_v2_trip`, backup `tosport_legacy_backup_v1`), and the `/sports-trip/` GitHub Pages base path.

## Architecture (v2 - one state, pure layers)
- `js/model.js` (domain, pure) · `js/store.js` (ONE serializable state + ONE reducer + persistence/migration) ·
  `js/ui.js` (renderers) · `js/i18n.js` (all strings) · `planner.js` (engine) · `js/planview.js` (Plan tab) ·
  `js/tickets.js` (ticket states) · `app.js` (controller). No second state machine per viewport, no second planner.
- Every new user-visible string goes through `i18n.js` (`tests/unit/i18n.test.js` fails on a missing key).

## Identity and design (full tokens/components: `BRANDING.md`)
- Exact spelling **ToSport**; logo stays LTR in both language layouts, never mirrored/redrawn.
- Cobalt `#2454E6` (hover `#3A64F0`) is reserved for actions/selection - do not give every sport
  or category its own strong color; no gradients, neon, oversized pills, or shrinking text to
  force a fit. Warning colors (`--warn`) are reserved for warnings only.
- Heebo + the established spacing/radius scale (`--radius`, `--radius-sm`). Wrap long names
  instead of truncating them (see the R6 fix in `ROADMAP.md`).
- Hebrew RTL is the default; English/other languages are a known gap (`ROADMAP.md`) - a labeled
  language selector when it's built, not a silent switch.

## Sport identity (full registry/how-to-add-a-sport: `MULTISPORT.md`)
- Every event identifies its sport via the shared `SPORT_REGISTRY`/`sportLabelHtml()` in
  `js/model.js` - one renderer reused by the list, map panel, plan proposals, itinerary and the
  detail dialog. Never a second hardcoded label list, never inferred from a competition name.
  An unmapped sport code renders as the honest `unknown` fallback, never silently as football.

## Data truth
- Distinguish resolved destination from draft text (see `#base`'s `onInput` handler - typing an
  unresolved city must never silently widen results), date-only values from times, event-day
  spans from accommodation nights, and event dates from travel dates.
- Times are venue-local, explicitly labeled - never silently reinterpreted as Israel/browser time.
- Never fabricate timezones, prices, ticket availability, or planner constraints the parser
  doesn't actually support (`planner.js`'s `Planner.parse` is a rule-based matcher, not an LLM -
  say so in the UI, don't imply otherwise).
- **Travel feasibility**: distance is a straight-line *estimate*; there is no travel-time authority
  (no km/h model). Water crossings and long moves are never auto-proposed; an unknown start/finish
  is uncertainty, not zero duration. Unlocated/provisional-location events are never routed.
- **Tickets** (`TICKETS.md`): a number is shown only through `js/tickets.js` `resolve()` (exact match,
  occurrence scope, known fee basis, safe approved link, unexpired quote, activation on). Live pricing
  is OFF until the activation checklist passes with an authorized sample. No credentials in the repo
  or client; commission never influences ranking; a click is not a purchase.

## State
- Switching Discover/Plan/My-trip, list/map, or viewport width must preserve search and trip
  state. `localStorage` is single-device only, not sync - never claim otherwise.
- A city-level destination must not silently broaden to its whole country (or vice versa).

## Accessibility (standing, every UI change - 2026-09-30)
- Keep keyboard operability, visible focus (the global `:focus-visible` outline - don't override
  it away), accessible labels, and contrast/readability at zoom for anything touched, not just
  new features.
- In any form/input, check typing, **paste** (wire to the `input` event, not `keydown` - paste
  doesn't fire keydown), and both **button-click and Enter** activation - especially once free
  text gets translated into filters/results (`#smartText`, the destination combobox, onboarding).
- When a control's state changes silently (e.g. a filter stays applied while typed text is
  invalid), say so in visible text near the control - don't leave the visible state looking
  broken/empty when the system actually still knows and is using a value.

## Workflow
- Inspect the current code/`git status` before changing something - don't assume a feature is
  missing without checking; don't re-litigate settled product decisions from `ROADMAP.md`.
- **Security review on every change**, not just when asked (`STATUS.md` "אבטחה" section has the
  running log and the pattern to follow: CSP scope, `esc()` before any `innerHTML`, no secrets
  in client code).
- Commit locally freely; **never push/deploy without an explicit request** in that session.
- No new frameworks, paid services, or backend dependencies as incidental design work.
- Tests (dev-only tooling; the site has no build step): `npm run test:unit` (Node), `npm run test:py`
  (tickets), `npx playwright test` (desktop + Pixel 7 emulation on deterministic feeds with a fixed
  clock; a11y via axe + keyboard), `node tests/capture/rollback-proof.mjs`. Run what you changed,
  also check 320/375/768/1280 and RTL by eye for UI work, and say what was actually tested vs. only
  emulated (no real-device or screen-reader claims from a desktop browser). Mock ticket offers exist
  only in tests/previews and must never reach production data.
- Docs: keep this file the short durable core; put detail in `docs/evolution/PRODUCT_NOTES.md`,
  `TICKETS.md`, `ROLLBACK.md`, `docs/evolution/QA_REPORT.md`.

## Done means
State plainly which parts of a task are implemented-and-tested, implemented-but-awaiting-a-
specific-check, or deferred-with-a-reason - not a version bump presented as full completion.
