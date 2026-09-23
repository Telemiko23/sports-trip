# Football Trip Planner - README

A guide to every file in this folder: what it does, when to run it, and in what order.
For the project plan (what's done, what's planned) see [ROADMAP.md](ROADMAP.md). For
current live status (deployment, affiliate signup progress, the ToS review) see
[STATUS.md](STATUS.md) (in Hebrew).

## The big picture

Two parts:
1. **Data pipeline** (Python scripts) - pulls fixtures from API-Football, translates
   them to Hebrew, applies manual corrections, downloads logos, and finally writes
   everything to `fixtures.js`.
2. **The site itself** - [index.html](index.html), a single page that reads
   `fixtures.js` (and `airports.js`) and runs entirely in the browser. No server, no
   build step - just open the file directly.

## Quick start

```
set API_FOOTBALL_KEY=your_key          (PowerShell: $env:API_FOOTBALL_KEY="...")
py build_fixtures.py
```
This pulls fresh fixtures, translates, corrects, and downloads logos - all
automatically. When it's done, open `index.html`. If you only edited a
translation/correction file (no need for fresh fixtures from the API), just run
`py backfill_hebrew.py` instead - much faster, and it doesn't touch your API quota.

## Core site files

| File | What it is |
|---|---|
| `index.html` | The site - HTML+CSS+JS in one file, in Hebrew (RTL). Reads `fixtures.js` and `airports.js` at load time. |
| `fixtures.js` | **Auto-generated - don't edit by hand.** Every fixture, with Hebrew fields, location, logo and stadium already attached. |

## API pull pipeline

| File | What it does | When to run it |
|---|---|---|
| `build_fixtures.py` | Pulls fixtures from API-Football for the 7 countries / 23 competitions, geocodes any new city, runs translation+corrections+logos, writes `fixtures.js`. | Whenever you want up-to-date fixtures (upcoming matches change, new cup rounds get drawn). Uses API quota. |
| `coverage_check.py` | Checks against the API (without writing `fixtures.js`) which competitions exist, how many fixtures they have, and how many teams have a city - before running `build_fixtures.py` on a new key/plan. | Only when testing a new API key or adding a competition. |
| `coverage_report.json` | Output of `coverage_check.py`. | Auto-generated. |

## Hebrew translation

| File | What it does | When to edit |
|---|---|---|
| `he_names.py` | Translation dictionary: every competition/city/team name we've seen, in Hebrew. Anything not in the dictionary falls back to automatic phonetic transliteration (so a Latin-script name is never shown). | When an existing translation looks wrong, or to improve the auto-transliteration of a new team. Key = the exact name the API returns. |
| `backfill_hebrew.py` | Re-runs translation + the corrections from `overrides.py` over the existing `fixtures.js`, **without** touching the fixtures API (only geocodes a new city, if needed). Also downloads any new competition logos. | After every edit to `he_names.py` or `overrides.py`. Fast (seconds), no API key needed. |

## Manual corrections (when the API is wrong or missing something)

| File | What it does | When to edit |
|---|---|---|
| `overrides.py` | Three dictionaries keyed by exact team name: `TEAM_CITY_OVERRIDE` (city, when the API doesn't give one or gets it wrong), `VENUE_OVERRIDE` (stadium name), `LOGO_OVERRIDE` (a better local crest). | When you spot a team with a wrong/missing city, stadium or logo. After editing - run `backfill_hebrew.py`. |
| `cities_manual.json` | Fixes coordinates for a specific city that Nominatim (the geocoding service) couldn't find. Key: `"City Name|country-code"` (e.g. `"Cardiff|gb"`), value: `[lat, lng]`. | When a city shows up in `missing_locations_report.py` as "has a name but no coordinates." |
| `cities_cache.json` | **Auto-generated** - a cache of every city already geocoded, so Nominatim isn't asked about the same city twice. Don't edit by hand (use `cities_manual.json` instead). | - |
| `missing_locations_report.py` | Run this to see which cities have a name but no coordinates (and are therefore hidden by the distance filter) - with a suggested fix. | After every `build_fixtures.py`, to catch new gaps early. |

## Logos

| File/folder | What it is |
|---|---|
| `download_logos.py` | Downloads each team's crest (`download_logos()`) and each competition's crest (`download_comp_logos()`) once, under a readable name (`AFC_Wimbledon.png`, not `1333.png`). Runs automatically at the end of `build_fixtures.py` and `backfill_hebrew.py`. |
| `logos/` | Team crests, stored locally (not dependent on an external server staying up). |
| `comp_logos/` | Competition (league/cup) crests. |

To replace one team's logo: put the file in `logos/`, then add a line to
`LOGO_OVERRIDE` in `overrides.py` pointing at it (exactly what we did for a few small
Spanish clubs the API didn't have a crest for).

## Airports (autocomplete for "flight from")

| File | What it does | When to edit/run |
|---|---|---|
| `airports.csv` | Raw dataset from [OurAirports](https://ourairports.com/data/) - every airport in the world. Includes a `municipality_he` column (Hebrew city translation) added by this project. | Replace with a newer export if you want to refresh the dataset. |
| `add_hebrew_city_column.py` | Adds/refreshes the `municipality_he` column in `airports.csv`. | Once after every new `airports.csv`, **before** `build_airports.py`. |
| `build_airports.py` | Filters `airports.csv` (only airports with scheduled commercial service and an IATA code), groups cities with multiple airports, and writes `airports.js`. | After every change to `airports.csv`. |
| `airports.js` | **Auto-generated** - the list the browser actually reads in the "flight from" field. | - |

## Planning

| File | What it is |
|---|---|
| `ROADMAP.md` | What was defined at the start, what's been done (by work round), and what's planned next. |
| `STATUS.md` | Current state, not a log: live deployment info, affiliate signup progress, the ToS legal review. |
| `ANALYTICS.md` | Every Google Analytics 4 custom event the site fires: name, params, trigger, and what it's for. |
| `README.md` | This file. |

## Common scenarios

**"I want up-to-date fixtures"** → `py build_fixtures.py` (needs `API_FOOTBALL_KEY`).

**"A team/city/competition is translated wrong"** → edit the matching entry in
`he_names.py` → `py backfill_hebrew.py`.

**"A team is missing its city/stadium/logo, or has the wrong one"** → add/fix a line
in `overrides.py` → `py backfill_hebrew.py`.

**"A fixture is hidden because it has no known location"** → `py
missing_locations_report.py` to see what's missing, fix it in `cities_manual.json`
(or in `overrides.py` if the city name itself is wrong) → `py backfill_hebrew.py`.

**"I have a new airports.csv"** → `py add_hebrew_city_column.py` → `py
build_airports.py`.
