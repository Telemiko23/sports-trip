# ToSport - project instructions

Static site (vanilla JS/CSS/HTML, no build step, no backend), GitHub Pages, Hebrew RTL by
default. Full history and detailed rationale live in `ROADMAP.md`/`STATUS.md` - this file is
the short, durable core. Detailed guidance lives in its own file; don't duplicate it here.

## Product contract
1. **Destination-first, not team-first.** ToSport starts with a destination and dates; sports
   are optional discovery preferences. Support both fixed dates and flexible-date/destination
   planning. Do not turn this into a football-only or team-first tool.
2. **Three fixed top-level destinations**: Discover (`גילוי אירועים`) / Plan (`תכנון טיול`) /
   My trip (`הטיול שלי`). Discover owns its own List/Map switch - planning is not a third
   display mode alongside them. Keep this naming and structure stable.
3. Preserve working capabilities, stable fixture IDs, `localStorage` key compatibility
   (`tripIds_v1`, `filterCtx_v1`, `onboarded_v1`), and the `/sports-trip/` GitHub Pages base path.

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
  `app.js` - one renderer reused by the list, map panel, plan proposals, itinerary and the
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

## State
- Switching Discover/Plan/My-trip, list/map, or viewport width must preserve search and trip
  state. `localStorage` is single-device only, not sync - never claim otherwise.
- A city-level destination must not silently broaden to its whole country (or vice versa).

## Workflow
- Inspect the current code/`git status` before changing something - don't assume a feature is
  missing without checking; don't re-litigate settled product decisions from `ROADMAP.md`.
- **Security review on every change**, not just when asked (`STATUS.md` "אבטחה" section has the
  running log and the pattern to follow: CSP scope, `esc()` before any `innerHTML`, no secrets
  in client code).
- Commit locally freely; **never push/deploy without an explicit request** in that session.
- No new frameworks, paid services, or backend dependencies as incidental design work.
- No automated test suite exists yet (Playwright is a `ROADMAP.md` backlog item) - verify
  changes by hand: representative widths (320/375/768/1280), RTL, empty/error/selected states,
  and note what you actually tested vs. only emulated (no real-device claims from a desktop
  browser). `node --check app.js` catches syntax errors; there's no other lint/build step.

## Done means
State plainly which parts of a task are implemented-and-tested, implemented-but-awaiting-a-
specific-check, or deferred-with-a-reason - not a version bump presented as full completion.
