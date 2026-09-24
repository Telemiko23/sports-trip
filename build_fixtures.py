#!/usr/bin/env python3
"""
build_fixtures.py - pulls upcoming football fixtures from API-Football and writes
fixtures.js, the data file that index.html (same folder) reads.

Usage (same steps as coverage_check.py):
  set API_FOOTBALL_KEY=YOUR_KEY          (PowerShell: $env:API_FOOTBALL_KEY="YOUR_KEY")
  py build_fixtures.py
  then double-click index.html

Optional environment variables:
  DAYS_AHEAD=120   how many days ahead to fetch (default 120)
  SLEEP=1.0        seconds to wait between API calls (default 1.0)

Files in the same folder:
  fixtures.js         created on every run - the data the site reads
  cities_cache.json   coordinates found for each city, so every city is looked up only once
  cities_manual.json  optional, yours: overrides / fixes, e.g. {"Cardiff|gb": [51.4816, -3.1791]}
                      (key = "CityName|countrycode"; you can also fix a wrong entry in the cache file)
  venues_cache.json   coordinates found for each stadium, same idea as cities_cache.json - lets
                      the site link a match's venue name straight to Google Maps
  he_names.py         Hebrew names for competitions/cities/teams - edit this to fix a translation
  logos/              team crests, downloaded automatically at the end of every run (see download_logos.py)

Cost per run: about 30-65 API-Football requests (Pro plan = 7,500/day), including the
3 UEFA club competitions (Champions/Europa/Conference League) and UEFA Nations League -
only fixtures involving a team/nation from one of our 8 tracked countries are kept; every
other one is discarded.
The first run is slower (several minutes) because every city is geocoded once through
OpenStreetMap Nominatim, limited to 1 request per second as their usage policy requires.
"""
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

from he_names import he_team, he_city, he_comp
from download_logos import download_logos, download_comp_logos
from overrides import TEAM_CITY_OVERRIDE, VENUE_OVERRIDE, LOGO_OVERRIDE

BASE = "https://v3.football.api-sports.io"
KEY = os.environ.get("API_FOOTBALL_KEY")
DAYS_AHEAD = int(os.environ.get("DAYS_AHEAD", "120"))
SLEEP = float(os.environ.get("SLEEP", "1.0"))
HERE = os.path.dirname(os.path.abspath(__file__))

# country -> (timezone used for kickoff times, country code used for geocoding)
COUNTRY = {
    "England": ("Europe/London", "gb"),
    "Spain": ("Europe/Madrid", "es"),
    "Germany": ("Europe/Berlin", "de"),
    "France": ("Europe/Paris", "fr"),
    "Netherlands": ("Europe/Amsterdam", "nl"),
    "Italy": ("Europe/Rome", "it"),
    "Poland": ("Europe/Warsaw", "pl"),
    "Portugal": ("Europe/Lisbon", "pt"),
}

# (API-Football league id, label, country). None = look the id up by name.
COMPETITIONS = [
    (39, "Premier League", "England"),
    (40, "Championship", "England"),
    (41, "League One", "England"),
    (42, "League Two", "England"),
    (45, "FA Cup", "England"),
    (48, "EFL Cup", "England"),
    (46, "EFL Trophy", "England"),
    (140, "La Liga", "Spain"),
    (141, "Segunda", "Spain"),
    (143, "Copa del Rey", "Spain"),
    (78, "Bundesliga", "Germany"),
    (79, "2. Bundesliga", "Germany"),
    (81, "DFB-Pokal", "Germany"),
    (61, "Ligue 1", "France"),
    (62, "Ligue 2", "France"),
    (66, "Coupe de France", "France"),
    (88, "Eredivisie", "Netherlands"),
    (90, "KNVB Beker", "Netherlands"),
    (135, "Serie A", "Italy"),
    (136, "Serie B", "Italy"),
    (137, "Coppa Italia", "Italy"),
    (106, "Ekstraklasa", "Poland"),
    (None, "Puchar Polski", "Poland"),
    (None, "Primeira Liga", "Portugal"),
    (None, "Taça de Portugal", "Portugal"),
]
# by-name lookup, for a competition whose id isn't hardcoded above (None) - avoids hardcoding
# an id we can't verify, and survives a sponsor rename (Primeira Liga's had several: Liga
# Bwin, Liga NOS, Liga Portugal Betclic...) since we match on several plausible name variants
LOOKUP_NAMES = {
    "Puchar Polski": {"cup", "puchar polski", "polish cup"},
    "Primeira Liga": {"primeira liga", "liga portugal", "liga portugal betclic", "liga bwin", "liga nos"},
    "Taça de Portugal": {"taça de portugal", "taca de portugal", "portuguese cup"},
}
# resolve_id() filters by the API's 'type' field ('League' or 'Cup') - defaults to Cup
# (Puchar Polski's original case); a competition here that's actually a league needs "League"
LOOKUP_KIND = {"Primeira Liga": "League"}
KEEP_STATUS = {"NS", "TBD"}  # not started / time to be defined

# UEFA club competitions - not tied to one country, so they're not in COMPETITIONS above.
# (search term for the leagues API, {accepted exact names}, our display label)
UEFA_COMPETITIONS = [
    ("Champions League", {"uefa champions league", "champions league"}, "Champions League"),
    ("Europa League", {"uefa europa league", "europa league"}, "Europa League"),
    ("Conference League", {"uefa europa conference league", "europa conference league", "conference league"}, "Conference League"),
]

# UEFA Nations League - a national-team competition, not a club one, so it can't reuse
# known_teams (club names) for relevance - it's checked against NATION_TEAMS instead (our
# tracked countries' own national-team names, assumed identical to the country label, e.g.
# the England national team's API name is "England" - not yet verified against a live pull)
NATIONAL_COMPETITIONS = [
    ("UEFA Nations League", {"uefa nations league", "nations league"}, "UEFA Nations League"),
]
NATION_TEAMS = set(COUNTRY.keys())
# The API gives no venue/city for national-team fixtures, so the host country is assumed to be the
# home nation's own (true for the group stage) - used only for the kickoff time zone and the
# country grouping, never to invent a city or stadium. API team name -> country code.
NATION_CC = {
    "England": "gb", "Spain": "es", "Germany": "de", "France": "fr", "Netherlands": "nl", "Italy": "it",
    "Poland": "pl", "Portugal": "pt", "Belgium": "be", "Bosnia & Herzegovina": "ba", "Croatia": "hr",
    "Czechia": "cz", "Denmark": "dk", "Greece": "gr", "Norway": "no", "Romania": "ro", "Serbia": "rs",
    "Sweden": "se", "Türkiye": "tr", "Wales": "wls",
}

# a UEFA fixture's real country isn't known until its venue is geocoded (unlike domestic
# fixtures, where it's the competition's own country) - map the resolved country code back
# to the same country label already used for a domestic fixture in that country, so e.g. a
# Manchester City Champions League match groups/colors with its Premier League matches
CC_TO_OUR_COUNTRY = {cc: country for country, (_, cc) in COUNTRY.items()}

# fallback timezone by country code, for countries we don't already track (COUNTRY above
# covers our own 7). Good enough for European club football; defaults to Europe/London.
CC_TIMEZONE = {
    "gb": "Europe/London", "es": "Europe/Madrid", "de": "Europe/Berlin", "fr": "Europe/Paris",
    "nl": "Europe/Amsterdam", "it": "Europe/Rome", "pl": "Europe/Warsaw", "pt": "Europe/Lisbon",
    "ua": "Europe/Kyiv", "be": "Europe/Brussels", "at": "Europe/Vienna", "ch": "Europe/Zurich",
    "tr": "Europe/Istanbul", "gr": "Europe/Athens", "cz": "Europe/Prague", "dk": "Europe/Copenhagen",
    "no": "Europe/Oslo", "se": "Europe/Stockholm", "rs": "Europe/Belgrade", "hr": "Europe/Zagreb",
    "sk": "Europe/Bratislava", "hu": "Europe/Budapest", "ro": "Europe/Bucharest", "bg": "Europe/Sofia",
    "sct": "Europe/London", "wls": "Europe/London", "nir": "Europe/London", "ie": "Europe/Dublin", "cy": "Asia/Nicosia", "il": "Asia/Jerusalem",
    "az": "Asia/Baku", "ge": "Asia/Tbilisi", "kz": "Asia/Almaty",
    "ba": "Europe/Sarajevo", "al": "Europe/Tirane", "ad": "Europe/Andorra", "am": "Asia/Yerevan",
    "by": "Europe/Minsk", "ee": "Europe/Tallinn", "fo": "Atlantic/Faroe", "fi": "Europe/Helsinki",
    "gi": "Europe/Gibraltar", "is": "Atlantic/Reykjavik", "xk": "Europe/Belgrade", "li": "Europe/Vaduz",
    "lt": "Europe/Vilnius", "lu": "Europe/Luxembourg", "lv": "Europe/Riga", "mc": "Europe/Monaco",
    "md": "Europe/Chisinau", "me": "Europe/Podgorica", "mk": "Europe/Skopje", "mt": "Europe/Malta",
    "ru": "Europe/Moscow", "sm": "Europe/San_Marino", "si": "Europe/Ljubljana",
}

# English display name for a country code not already covered by COUNTRY above (used as the
# fixture's "country" field, e.g. for grouping/coloring in the UI)
CC_COUNTRY_NAME = {
    "pt": "Portugal", "ua": "Ukraine", "be": "Belgium", "at": "Austria", "ch": "Switzerland",
    "tr": "Turkey", "gr": "Greece", "cz": "Czechia", "dk": "Denmark", "no": "Norway",
    "se": "Sweden", "rs": "Serbia", "hr": "Croatia", "sk": "Slovakia", "hu": "Hungary",
    "ro": "Romania", "bg": "Bulgaria", "sct": "Scotland", "wls": "Wales", "nir": "Northern Ireland", "ie": "Ireland", "cy": "Cyprus",
    "il": "Israel", "az": "Azerbaijan", "ge": "Georgia", "kz": "Kazakhstan",
    "am": "Armenia", "ba": "Bosnia and Herzegovina", "lv": "Latvia", "lt": "Lithuania",
    "al": "Albania", "ad": "Andorra", "by": "Belarus", "ee": "Estonia", "fo": "Faroe Islands",
    "fi": "Finland", "gi": "Gibraltar", "is": "Iceland", "xk": "Kosovo", "li": "Liechtenstein",
    "lu": "Luxembourg", "mt": "Malta", "md": "Moldova", "mc": "Monaco", "me": "Montenegro",
    "mk": "North Macedonia", "ru": "Russia", "sm": "San Marino", "si": "Slovenia",
}

# UEFA member associations' country codes (roughly - England/Scotland/Wales/N.Ireland all
# share "gb" in OSM). Used to bias an unrestricted geocode toward the right same-named city
# (e.g. "Athens" without this would as easily match Athens, Georgia, USA).
UEFA_CC = ",".join([
    "al", "ad", "am", "at", "az", "by", "be", "ba", "bg", "hr", "cy", "cz", "dk", "gb", "ee",
    "fo", "fi", "fr", "ge", "de", "gi", "gr", "hu", "is", "il", "it", "kz", "xk", "lv", "li",
    "lt", "lu", "mt", "md", "mc", "me", "nl", "mk", "no", "pl", "pt", "ie", "ro", "ru", "sm",
    "rs", "sk", "si", "es", "se", "ch", "tr", "ua",
])


def call(path, **params):
    """One API-Football request. Returns the parsed JSON (with an 'errors' entry on failure)."""
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url, headers={"x-apisports-key": KEY, "User-Agent": "sports-trip-planner/1.0"}
    )
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                data = json.load(r)
            time.sleep(SLEEP)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 0:
                print("  rate limited, waiting 65s...")
                time.sleep(65)
                continue
            return {"errors": {"http": f"{e.code} {e.reason}"}, "response": []}
        except Exception as e:
            return {"errors": {"network": str(e)}, "response": []}
    return {"errors": {"unknown": "failed"}, "response": []}


def geocode(city, cc):
    """Returns (coords_or_None, ok). ok=False means a network problem (do not cache the miss)."""
    q = urllib.parse.urlencode({"q": city, "format": "json", "limit": 1, "countrycodes": cc})
    req = urllib.request.Request(
        "https://nominatim.openstreetmap.org/search?" + q,
        headers={"User-Agent": "sports-trip-planner/1.0 (personal hobby project)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
    except Exception as e:
        print(f"  geocode error for {city}: {e}")
        time.sleep(2)
        return None, False
    time.sleep(1.1)
    if data:
        return [round(float(data[0]["lat"]), 4), round(float(data[0]["lon"]), 4)], True
    return None, True


def load_json(name, default):
    path = os.path.join(HERE, name)
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Could not read {name}: {e}")
    return default


def save_json(name, obj):
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)


def resolve_id(label, country):
    names = LOOKUP_NAMES.get(label, set())
    kind = LOOKUP_KIND.get(label, "Cup")
    data = call("leagues", country=country)
    for x in data.get("response", []):
        if x["league"]["name"].strip().lower() in names and x["league"].get("type") == kind:
            return x["league"]["id"]
    return None


def resolve_uefa_id(search_term, accepted_names):
    """Same idea as resolve_id, but for a competition with no single country - looks it up
    by name across the whole API instead of hardcoding an id that might be wrong or change."""
    data = call("leagues", search=search_term)
    for x in data.get("response", []):
        if x["league"]["name"].strip().lower() in accepted_names:
            return x["league"]["id"]
    return None


def _nominatim_search(city, countrycodes=None):
    params = {"q": city, "format": "json", "limit": 1, "addressdetails": 1}
    if countrycodes:
        params["countrycodes"] = countrycodes
    q = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        "https://nominatim.openstreetmap.org/search?" + q,
        headers={"User-Agent": "sports-trip-planner/1.0 (personal hobby project)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
    except Exception as e:
        print(f"  geocode error for {city}: {e}")
        time.sleep(2)
        return None, False
    time.sleep(1.1)
    return data, True


def geocode_any(city):
    """Like geocode(), but the country isn't known yet - for a European club competition
    venue. First tries biased to UEFA member countries (a plain unrestricted search for a
    common name like "Athens" is just as likely to match Athens, Georgia, USA); only falls
    back to a fully unrestricted search if that finds nothing, for the rare genuine case of
    a match hosted outside Europe. Returns (coords_or_None, country_code_or_None, ok)."""
    data, ok = _nominatim_search(city, UEFA_CC)
    if ok and not data:
        data, ok = _nominatim_search(city)
    if not ok:
        return None, None, False
    if data:
        d = data[0]
        coords = [round(float(d["lat"]), 4), round(float(d["lon"]), 4)]
        addr = d.get("address", {})
        cc = (addr.get("country_code") or "").lower() or None
        if cc == "gb":
            # "gb" alone doesn't distinguish England/Scotland/Wales/N.Ireland - Nominatim's
            # ISO3166-2 subdivision code does (e.g. "GB-SCT" for Scotland), so a Scottish
            # club doesn't get grouped under "England"
            subdivision = (addr.get("ISO3166-2-lvl4") or "").lower()
            if subdivision == "gb-sct":
                cc = "sct"
            elif subdivision == "gb-wls":
                cc = "wls"
            elif subdivision == "gb-nir":
                cc = "nir"
        return coords, cc, True
    return None, None, True


def main():
    if not KEY:
        sys.exit("API_FOOTBALL_KEY is not set - see the instructions at the top of this file.")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    today = datetime.date.today()
    start = today.isoformat()
    end = (today + datetime.timedelta(days=DAYS_AHEAD)).isoformat()
    season = today.year if today.month >= 7 else today.year - 1
    print(f"Fetching fixtures {start} -> {end} (season {season})\n")

    rows, comps_meta, seen = [], [], set()
    for cid, label, country in COMPETITIONS:
        tz, cc = COUNTRY[country]
        if cid is None:
            cid = resolve_id(label, country)
            if cid is None:
                print(f"{country:12} {label:16} not found in the API - skipped")
                continue

        items, used = [], None
        for s in (season, season - 1):
            data = call("fixtures", **{"league": cid, "season": s, "from": start, "to": end, "timezone": tz})
            if data.get("errors"):
                print(f"{country:12} {label:16} ERROR {data['errors']}")
                break
            if data.get("response"):
                items, used = data["response"], s
                break

        team_city = {}
        if used and any(not ((i["fixture"].get("venue") or {}).get("city")) for i in items):
            td = call("teams", league=cid, season=used)
            for t in td.get("response", []):
                team_city[t["team"]["id"]] = (t.get("venue") or {}).get("city")

        added = missing_city = 0
        for i in items:
            fx, tm, lg = i["fixture"], i["teams"], i["league"]
            if fx["status"]["short"] not in KEEP_STATUS or fx["id"] in seen:
                continue
            seen.add(fx["id"])
            venue = fx.get("venue") or {}
            home_name, away_name = tm["home"]["name"], tm["away"]["name"]
            city = (venue.get("city") or team_city.get(tm["home"]["id"]) or "").strip() or None
            row_cc = cc
            if home_name in TEAM_CITY_OVERRIDE:
                city, row_cc = TEAM_CITY_OVERRIDE[home_name]
            if not city:
                missing_city += 1
            rows.append({
                "id": fx["id"],
                "dt": fx["date"][:16],  # local wall-clock time 'YYYY-MM-DDTHH:MM'
                "status": fx["status"]["short"],
                "home": home_name,
                "away": away_name,
                "home_he": he_team(home_name),
                "away_he": he_team(away_name),
                "home_logo": LOGO_OVERRIDE.get(home_name) or tm["home"].get("logo"),
                "away_logo": LOGO_OVERRIDE.get(away_name) or tm["away"].get("logo"),
                "comp_id": cid,
                "comp": label,
                "comp_he": he_comp(label),
                "country": country,
                "round": lg.get("round"),
                "venue": VENUE_OVERRIDE.get(home_name) or venue.get("name"),
                "city": city,
                "cc": row_cc,
            })
            added += 1
        comps_meta.append({"id": cid, "label": label, "country": country,
                            "logo": f"https://media.api-sports.io/football/leagues/{cid}.png"})
        print(f"{country:12} {label:16} season={used} fixtures={added} without_city={missing_city}")

    cache = load_json("cities_cache.json", {})
    manual = load_json("cities_manual.json", {})

    # ---- UEFA club competitions: not tied to one country, so a fixture only counts if a
    # team from one of our 7 tracked countries is playing in it, and its real host country
    # has to be discovered from its venue (a team's own country is not a safe guess - e.g. a
    # Ukrainian club's "home" European fixture is often played at a neutral ground abroad) ----
    known_teams = {r["home"] for r in rows} | {r["away"] for r in rows}
    print()
    for search_term, accepted_names, ulabel in UEFA_COMPETITIONS:
        ucid = resolve_uefa_id(search_term, accepted_names)
        if ucid is None:
            print(f"{'UEFA':12} {ulabel:16} not found in the API - skipped")
            continue

        items, used = [], None
        for s in (season, season - 1):
            data = call("fixtures", **{"league": ucid, "season": s, "from": start, "to": end, "timezone": "UTC"})
            if data.get("errors"):
                print(f"{'UEFA':12} {ulabel:16} ERROR {data['errors']}")
                break
            if data.get("response"):
                items, used = data["response"], s
                break

        added = skipped_other = missing_city = 0
        for i in items:
            fx, tm, lg = i["fixture"], i["teams"], i["league"]
            home_name, away_name = tm["home"]["name"], tm["away"]["name"]
            if fx["status"]["short"] not in KEEP_STATUS or fx["id"] in seen:
                continue
            if home_name not in known_teams and away_name not in known_teams:
                skipped_other += 1
                continue
            seen.add(fx["id"])

            venue = fx.get("venue") or {}
            city = (venue.get("city") or "").strip() or None
            row_cc = None
            if home_name in TEAM_CITY_OVERRIDE:
                city, row_cc = TEAM_CITY_OVERRIDE[home_name]
            elif city:
                key_guess = next((k for k in cache if k.startswith(f"{city}|")), None) or \
                            next((k for k in manual if k.startswith(f"{city}|")), None)
                if key_guess:
                    row_cc = key_guess.split("|", 1)[1]
                else:
                    coords, row_cc, ok = geocode_any(city)
                    if ok and coords and row_cc:
                        cache[f"{city}|{row_cc}"] = coords

            if not city:
                missing_city += 1
            tzname = CC_TIMEZONE.get(row_cc, "Europe/London")
            local_dt = datetime.datetime.fromisoformat(fx["date"]).astimezone(ZoneInfo(tzname))

            rows.append({
                "id": fx["id"],
                "dt": local_dt.strftime("%Y-%m-%dT%H:%M"),
                "status": fx["status"]["short"],
                "home": home_name,
                "away": away_name,
                "home_he": he_team(home_name),
                "away_he": he_team(away_name),
                "home_logo": LOGO_OVERRIDE.get(home_name) or tm["home"].get("logo"),
                "away_logo": LOGO_OVERRIDE.get(away_name) or tm["away"].get("logo"),
                "comp_id": ucid,
                "comp": ulabel,
                "comp_he": he_comp(ulabel),
                "country": CC_TO_OUR_COUNTRY.get(row_cc) or CC_COUNTRY_NAME.get(row_cc) or row_cc or "Europe",
                "round": lg.get("round"),
                "venue": VENUE_OVERRIDE.get(home_name) or venue.get("name"),
                "city": city,
                "cc": row_cc,
            })
            added += 1
        comps_meta.append({"id": ucid, "label": ulabel, "country": "Europe",
                            "logo": f"https://media.api-sports.io/football/leagues/{ucid}.png"})
        print(f"{'UEFA':12} {ulabel:16} season={used} fixtures={added} (of our teams) without_city={missing_city}")

    # ---- national-team competitions (UEFA Nations League) - identical "unknown venue
    # country" handling as the UEFA club competitions above, just checked against national
    # team names (NATION_TEAMS) instead of club names (known_teams) ----
    for search_term, accepted_names, ulabel in NATIONAL_COMPETITIONS:
        ucid = resolve_uefa_id(search_term, accepted_names)
        if ucid is None:
            print(f"{'Intl':12} {ulabel:16} not found in the API - skipped")
            continue

        items, used = [], None
        for s in (season, season - 1):
            data = call("fixtures", **{"league": ucid, "season": s, "from": start, "to": end, "timezone": "UTC"})
            if data.get("errors"):
                print(f"{'Intl':12} {ulabel:16} ERROR {data['errors']}")
                break
            if data.get("response"):
                items, used = data["response"], s
                break

        added = skipped_other = missing_city = 0
        for i in items:
            fx, tm, lg = i["fixture"], i["teams"], i["league"]
            home_name, away_name = tm["home"]["name"], tm["away"]["name"]
            if fx["status"]["short"] not in KEEP_STATUS or fx["id"] in seen:
                continue
            if home_name not in NATION_TEAMS and away_name not in NATION_TEAMS:
                skipped_other += 1
                continue
            seen.add(fx["id"])

            venue = fx.get("venue") or {}
            city = (venue.get("city") or "").strip() or None
            row_cc = None
            if home_name in TEAM_CITY_OVERRIDE:
                city, row_cc = TEAM_CITY_OVERRIDE[home_name]
            elif city:
                key_guess = next((k for k in cache if k.startswith(f"{city}|")), None) or \
                            next((k for k in manual if k.startswith(f"{city}|")), None)
                if key_guess:
                    row_cc = key_guess.split("|", 1)[1]
                else:
                    coords, row_cc, ok = geocode_any(city)
                    if ok and coords and row_cc:
                        cache[f"{city}|{row_cc}"] = coords

            if not city:
                missing_city += 1
                row_cc = row_cc or NATION_CC.get(home_name)  # time zone + country only; the city stays unknown
            tzname = CC_TIMEZONE.get(row_cc, "Europe/London")
            local_dt = datetime.datetime.fromisoformat(fx["date"]).astimezone(ZoneInfo(tzname))

            rows.append({
                "id": fx["id"],
                "dt": local_dt.strftime("%Y-%m-%dT%H:%M"),
                "status": fx["status"]["short"],
                "home": home_name,
                "away": away_name,
                "home_he": he_team(home_name),
                "away_he": he_team(away_name),
                "home_logo": LOGO_OVERRIDE.get(home_name) or tm["home"].get("logo"),
                "away_logo": LOGO_OVERRIDE.get(away_name) or tm["away"].get("logo"),
                "comp_id": ucid,
                "comp": ulabel,
                "comp_he": he_comp(ulabel),
                "country": CC_TO_OUR_COUNTRY.get(row_cc) or CC_COUNTRY_NAME.get(row_cc) or row_cc or "Europe",
                "round": lg.get("round"),
                "venue": VENUE_OVERRIDE.get(home_name) or venue.get("name"),
                "city": city,
                "cc": row_cc,
            })
            added += 1
        comps_meta.append({"id": ucid, "label": ulabel, "country": "Europe",
                            "logo": f"https://media.api-sports.io/football/leagues/{ucid}.png"})
        print(f"{'Intl':12} {ulabel:16} season={used} fixtures={added} (of our teams) without_city={missing_city}")

    # ---- geocode every distinct city once ----
    todo = sorted({(r["city"], r["cc"]) for r in rows if r["city"] and f"{r['city']}|{r['cc']}" not in cache
                   and f"{r['city']}|{r['cc']}" not in manual})
    if todo:
        print(f"\nGeocoding {len(todo)} new cities (about {len(todo) * 1.3 / 60:.0f} min)...")
    for n, (city, cc) in enumerate(todo, 1):
        coords, ok = geocode(city, cc)
        if ok:
            cache[f"{city}|{cc}"] = coords
        if n % 25 == 0:
            print(f"  {n}/{len(todo)}")
            save_json("cities_cache.json", cache)
    if todo:
        save_json("cities_cache.json", cache)

    # ---- geocode every distinct stadium once, so the "venue" name can link straight to
    # its exact spot on Google Maps instead of just the city centre. Best-effort: a venue
    # whose country is unknown (city never resolved) or that Nominatim can't find by name
    # is simply left without a pin - the site already falls back gracefully everywhere else. ----
    vcache = load_json("venues_cache.json", {})
    vtodo = sorted({(r["venue"], r["city"], r["cc"]) for r in rows
                     if r["venue"] and r["city"] and r["cc"] and f"{r['venue']}|{r['city']}" not in vcache})
    if vtodo:
        print(f"\nGeocoding {len(vtodo)} new stadiums (about {len(vtodo) * 1.3 / 60:.0f} min)...")
    for n, (venue, city, cc) in enumerate(vtodo, 1):
        coords, ok = geocode(f"{venue}, {city}", cc)
        if ok:
            vcache[f"{venue}|{city}"] = coords
        if n % 25 == 0:
            print(f"  {n}/{len(vtodo)}")
            save_json("venues_cache.json", vcache)
    if vtodo:
        save_json("venues_cache.json", vcache)

    unresolved = set()
    for r in rows:
        key = f"{r['city']}|{r['cc']}" if r["city"] else None
        c = manual.get(key) or cache.get(key) if key else None
        r["lat"], r["lng"] = (c[0], c[1]) if c else (None, None)
        r["city_he"] = he_city(r["city"], r["country"])
        if r["city"] and not c:
            unresolved.add(key)
        vc = vcache.get(f"{r['venue']}|{r['city']}") if r["venue"] and r["city"] else None
        r["venue_lat"], r["venue_lng"] = (vc[0], vc[1]) if vc else (None, None)
        del r["cc"]

    for c in comps_meta:
        c["label_he"] = he_comp(c["label"])

    rows.sort(key=lambda r: r["dt"])
    payload = {
        "generated": datetime.datetime.now().isoformat(timespec="minutes"),
        "days_ahead": DAYS_AHEAD,
        "competitions": comps_meta,
        "fixtures": rows,
    }
    # non-football events (build_events.py) live in their own data file so this daily run never
    # needs the AllSportDB key - just carry the still-upcoming ones over into the new fixtures.js
    from build_events import merge_events
    n_events = merge_events(payload)
    print(f"Merged {n_events} upcoming non-football events from events_data.json")
    with open(os.path.join(HERE, "fixtures.js"), "w", encoding="utf-8") as f:
        f.write("window.TRIP_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n")

    located = sum(1 for r in rows if r["lat"] is not None)
    venue_located = sum(1 for r in rows if r["venue_lat"] is not None)
    print(f"\nWrote fixtures.js: {len(rows)} fixtures, {located} with a known city location, "
          f"{venue_located} with an exact stadium location.")

    download_logos()
    download_comp_logos()
    if unresolved:
        print(f"{len(unresolved)} cities could not be located (their matches are hidden by the distance filter).")
        print("Add them to cities_manual.json, e.g. {\"Cardiff|gb\": [51.4816, -3.1791]}:")
        for k in sorted(unresolved):
            print("  ", k)
    print("\nDone. Open index.html.")


if __name__ == "__main__":
    main()
