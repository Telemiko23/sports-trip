# Multi-sport architecture - design (not implemented yet)

This is a **design document only** - nothing here is built. Written 2026-09-24 per an
explicit request to think through the architecture before touching code, starting with
Formula 1 (deferred - no paid API access yet) and Darts (two candidate sources reviewed
below, neither wired up).

## Why this needs real design, not just "add another competition"

Every previous addition (Champions League, Portugal, UEFA Nations League) was still
football: same API, same JSON shape, same idea of two teams playing at a venue. A second
*sport* breaks assumptions baked into the whole pipeline:
- `build_fixtures.py` is written entirely around API-Football's JSON shape.
- `index.html`'s rendering (`renderResults`, `renderTrip`, the map popup) hardcodes
  `f.home`/`f.away`/`f.home_logo`/`f.away_logo` everywhere - there's no "two teams" in a
  Formula 1 race weekend or a darts exhibition night.
- The filter sidebar groups competitions by **country** - that fits football (each league
  belongs to one country) but not Formula 1 (one championship, races all over the world)
  or Darts (UK/Europe-wide tours, not one country per event).

## Proposed common event schema

One normalized shape every sport's data adapter fills in, so the frontend can stay mostly
sport-agnostic:

```
{
  id, sport,                 // sport: "football" | "f1" | "darts" | ...
  dt, status,
  title, title_he,           // the one field every sport must produce - see below
  logos: [url, ...],         // 0, 1 or 2 images (team crests for football; empty for F1/darts)
  comp, comp_he, comp_id, comp_logo,
  country, city, city_he, lat, lng,
  venue, venue_lat, venue_lng,
  round,
  extra: { ... }             // sport-specific leftovers that don't generalize
}
```

`title`/`title_he` replaces `home`/`away` as the one thing every card renders:
- Football: `"Arsenal – Chelsea"` (built by that adapter exactly like today, just written
  into `title` instead of two separate fields; `logos` becomes `[home_logo, away_logo]`).
- Formula 1: `"Belgian Grand Prix – Race"` (or a separate `session` field if we want
  practice/qualifying/race as distinct rows - probably yes, since a trip could be built
  around watching qualifying and the race on different days).
- Darts: `"Swiss Darts Trophy"` for an official tournament, or `"A Night at the Darts:
  Blackpool"` for an exhibition - `extra.players` could hold a lineup when known.

This is the one real refactor football's own code would need: today `renderResults()`
etc. build `"X – Y"` inline from `home_he`/`away_he` with two hardcoded crest slots. Making
football's adapter itself emit `title_he` and a `logos` array keeps the frontend rendering
loop identical for every sport (loop over `logos`, print `title`) instead of branching by
sport in the UI code. Worth doing as its own small, reviewable change before the first
new sport lands - not a big rewrite, but touches several render functions.

## Pipeline shape

Keep one adapter script per sport (`build_fixtures_football.py` - today's
`build_fixtures.py`, renamed; `build_fixtures_f1.py`; `build_fixtures_darts.py` if that
ever happens), each pulling its own source and writing events in the common schema. A
thin `build_all.py` runs each adapter and merges their output into one `fixtures.js`, plus
a `sports` metadata list (mirrors the existing `competitions` list) so the frontend can
build a sport filter. Each adapter keeps owning its own cache files
(`cities_cache.json`/`venues_cache.json` can likely stay shared across sports, since
geocoding a city doesn't care what sport is being played there).

## Frontend

- A sport-level filter above/alongside the competition list (⚽ כדורגל / 🏎️ פורמולה 1 /
  🎯 דארטס as toggle chips, similar styling to the existing view toggle).
- Small sport icon next to the competition tag on every card (the icon-set idea already in
  ROADMAP.md, e.g. an emoji per sport rather than depending on a per-sport API for a logo).
- The country-grouped competition sidebar stays as-is for football; a sport with no
  natural "country" grouping (F1: one global championship; Darts: tours/categories like
  European Tour / Majors / Galas) needs its own grouping key instead of country - the
  competitions list already carries a free-text `country` field per competition, so this
  can likely reuse the exact same grouping code with e.g. `"European Tour"` in that field
  instead of an actual country, no new UI code needed.
- Trip building stays sport-agnostic by construction (a trip is just a list of fixture
  ids) - the genuinely fun part of this: someone could plan one European trip that hits a
  football match and a darts gala in the same city on the same weekend. Worth calling out
  as the actual pitch for this feature, not just "more data."

## Formula 1 - deferred, not paid for yet

API-Sports (same family as API-Football) has a Formula-1 product with a similar shape to
what we already integrate against (races, sessions, circuits) - likely the cleanest fit
architecturally once there's a paid key, since the adapter would look a lot like
`build_fixtures.py` already does. Nothing else to design here until that's confirmed and
paid for - flagging now only so the schema above already has a session/practice-vs-race
concept ready for it.

## Update 2026-09-24 - AllSportDB (the user registered; free plan)

**What it is**: a calendar of *events* (tournaments/race weekends/championships), ~all
sports - boxing, tennis, Euroleague, motorsport (F1 included), golf, rugby, cycling, etc.
Not match-level data: one row is e.g. "Formula 1 - Azerbaijan Grand Prix, Baku, 24-26
September" or "Laver Cup, London, 25-27 September". That granularity actually fits a
*trip* planner well (you plan around a weekend in a city, not a single fixture).

**API** (OpenAPI spec is public: `api.allsportdb.com/v3/swagger.json`): read-only REST,
Bearer-JWT auth. Endpoints: `/calendar` (events; filters `dateFrom`, `dateTo`, `sportId`,
`country`, `competitionId`, free-text, `page`...), `/sports`, `/competitions`,
`/countries`, `/locations`, `/regions`, `/continents`. An event carries name, date range,
sport + emoji, competition, logo URLs, official/tickets/live URLs, and a `location` list
(country + city names).

**Free ("Basic") plan limits that matter for us** (from their pricing page):
- 10,000 calls/month (plenty - a daily run needs maybe 30-60 calls).
- **10 events per call** - paging is mandatory.
- Current + future events only - which is exactly what we want anyway.
- **The authorisation key is valid 30 days and must be renewed by hand** from their API
  Settings page. For our daily GitHub Action that's a recurring chore: the key stored in
  the repo Secret would silently expire monthly unless renewed (or unless we pay).
- **No lat/lng** in the free plan (geospatial data is Standard, £20/month) - fine, we
  already geocode city names ourselves via Nominatim, same as football.
- **No tickets links** on the free plan (Standard only).
- Their Terms page is generic (liability/accounts) - it says nothing about attribution or
  redistribution of the data, so it neither permits nor forbids what we'd do. Worth a
  short email to them to confirm, and we'd credit them in the footer regardless.

**Fit with the event schema above**: `title` = event name, `comp` = competition,
`sport` + `emoji` map directly, dates are ranges (so `dt` = start, and `extra.dateTo` for
the end - the UI currently assumes a single kickoff time, so multi-day events need a small
"date range" treatment in the cards/trip logic, not just a new data source).

**Nothing is wired up yet.** `allsportdb_probe.py` is a read-only exploration script (needs
the user's key in the `ALLSPORTDB_KEY` env var) that dumps what the API really returns
for the next 120 days per sport, so we pick sports based on real coverage, not guesses.

## AllSportDB probe results (real free-plan data, run 2026-09-24)

544 events between 2026-09-05 and 2027-01-22 across 55 sports (70 in the catalog). Findings:
- **No Darts and no horse racing at all** (Equestrian is show-jumping only). So AllSportDB
  does not solve Darts - that stays open.
- **Locations are city *names* only - zero lat/lng** (0 of 637) on the free plan. Fine:
  same Nominatim geocoding pipeline as football.
- **Free plan has no logos, ticket links or live links** (0 events with any).
- **One event can span several cities** (e.g. a rugby Nations Championship round in
  Paris + Dublin + Udine) - the schema needs `locations[]`, not a single city.
- **Trip-useful sports (a real European city + a specific date)**: Formula 1 (only ~5
  Europe-based motorsport events in this window, but the F1 calendar is global),
  Snooker (10, mostly UK: Belfast, Leicester, York, Blackpool, Edinburgh), Rugby (7),
  Tennis (7 in Europe; mostly Asia in this window), Cycling (13), Ice Hockey (11),
  Motorbike Racing (8), plus winter sports (Alpine/Ski Jumping/Biathlon ~13-19 each).
- **Not usable for trips**: Basketball - 38 of 47 events are Euroleague/EuroCup *rounds*
  located just "Europe" (no city, no individual game); Football - 18 of 23 have no city
  (and we already have far better football data); Boxing - only 6, mostly minor "TBA".
- **Data-quality warning**: the F1 "Bahrain Grand Prix" is listed at Sepang, Malaysia -
  an obvious error. Any AllSportDB adapter needs a manual-override layer like
  `overrides.py` has for football, and sanity checks against the sport's own calendar.

## Darts - correction after testing TheSportsDB for real

Last night I recommended TheSportsDB's free Darts API. **That was too optimistic - tested
this morning, it doesn't deliver what we need**: the free key (`123`) lists the "PDC Darts"
league, but its 2026 season returns only 15 events, the newest dated February 2026, and
"next events" is empty - i.e. no upcoming darts at all. Premium ($9/month) may differ but I
haven't verified that, and I wouldn't pay before confirming it has forward-looking data.
AllSportDB (above) is the better bet for darts if it lists PDC events - the probe will tell.

## Darts - two sources looked at tonight, neither wired up

**[pdc-europe.tv/events](https://www.pdc-europe.tv/events/)** - PDC Europe's own events
calendar. Reasonably structured for a webpage: each event has a name, a category
(European Tour / Majors / Galas / PDC Europe Super League), a date range, a venue name,
and a city/country. This is the stronger candidate of the two - if Darts happens, this is
probably the source.
- **Not an API** - it's a normal webpage, so pulling from it means scraping HTML (parsing
  a page layout, not calling a documented endpoint), which is inherently more fragile
  than API-Football (a redesign of their site silently breaks the adapter, with no error
  from an API contract to catch it).
- **robots.txt has no explicit permission for this use.** It defines "content signals"
  (search / ai-input / ai-train) but doesn't actually set any of them to `yes` or `no` -
  by their own stated rule, an unset signal means neither granted nor restricted. Pulling
  their event calendar into our own product is arguably "ai-input" (feeding content into
  an AI-assisted pipeline) under their own definition, and that's specifically left
  ambiguous rather than allowed. I'd want either an explicit yes from PDC Europe, or to
  find a properly licensed data source, before building an automated scraper against it -
  same bar we already hold API-Football and OpenStreetMap to.

**[dartsworldstore.com](https://www.dartsworldstore.com/collections/all-upcoming-darts-events)**
- turned out to be a UK ticket retailer's product catalog (Shopify), not tournament data:
  each "product" is a local exhibition night ("A Night at the Darts: Blackpool - 24th
  September 2026") with a ticket price, no separate structured venue/city/date fields -
  city and date live inside the free-text title and would need to be parsed out. Weaker
  fit than pdc-europe.tv on every axis: less structured, and it's someone else's retail
  storefront rather than an event calendar, which raises more questions about whether
  scraping it for a different product is appropriate at all. I'd deprioritize this one.

**A licensed alternative exists and is worth checking first.** API-Sports itself doesn't
appear to cover Darts, but a quick search tonight turned up real, structured Darts APIs:
- **Sportradar** - an official PDC data partner, so the real thing, but almost certainly
  priced for businesses, not a personal hobby project.
- **SportDevs** ("Darts Devs" on RapidAPI) - a general sports-data platform with a Darts
  product (matches, players, tournaments), same RapidAPI-style access as many budget-
  friendly sports APIs.
- **TheSportsDB** - explicitly advertises a **free** Darts API, and confirmed tonight to
  actually list "PDC Darts" as a league in their database (browsed `thesportsdb.com/Sport/Darts`) -
  so it's not just marketing copy, there's real PDC coverage there. Given this project already
  runs on a paid API-Football plan and free-when-possible has been the pattern everywhere
  else (Leaflet/OSM over Google Maps, GoatCounter considered before GA4), this is the
  first thing worth actually opening and checking - a real, licensed, structured feed
  would make Darts a clean adapter exactly like football and F1, no scraping needed at all.

**Bottom line for Darts**: check TheSportsDB's free Darts API first (`thesportsdb.com`) -
if its coverage/data quality is good enough, that's a far better foundation than scraping
either site above, with none of the ToS ambiguity. Only fall back to pdc-europe.tv (with
its permission question actually resolved, not assumed) if no licensed option pans out.
