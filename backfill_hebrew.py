#!/usr/bin/env python3
"""
backfill_hebrew.py - one-off pass over an existing fixtures.js that (re)applies, without
touching the football API:
  - Hebrew display fields (home_he, away_he, city_he, comp_he), from he_names.py
  - manual corrections from overrides.py: a team's city (geocoded through Nominatim if
    it's new - the only network call this script makes), venue name, and crest

Safe to re-run any time after editing he_names.py or overrides.py.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from he_names import he_team, he_city, he_comp
from overrides import TEAM_CITY_OVERRIDE, VENUE_OVERRIDE, LOGO_OVERRIDE
from download_logos import download_comp_logos

HERE = os.path.dirname(os.path.abspath(__file__))

COUNTRY_CC = {
    "England": "gb", "Spain": "es", "Germany": "de", "France": "fr",
    "Netherlands": "nl", "Italy": "it", "Poland": "pl",
}


def load_json(name, default):
    path = os.path.join(HERE, name)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(name, obj):
    with open(os.path.join(HERE, name), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1, sort_keys=True)


def geocode(city, cc):
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
        return None
    time.sleep(1.1)
    if data:
        return [round(float(data[0]["lat"]), 4), round(float(data[0]["lon"]), 4)]
    return None


def main():
    path = os.path.join(HERE, "fixtures.js")
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    payload = json.loads(raw[len("window.TRIP_DATA = "):].rstrip().rstrip(";"))

    cache = load_json("cities_cache.json", {})
    manual = load_json("cities_manual.json", {})
    cache_dirty = False

    for r in payload["fixtures"]:
        home = r["home"]

        if VENUE_OVERRIDE.get(home):
            r["venue"] = VENUE_OVERRIDE[home]

        if LOGO_OVERRIDE.get(r["home"]):
            r["home_logo"] = LOGO_OVERRIDE[r["home"]]
        if LOGO_OVERRIDE.get(r["away"]):
            r["away_logo"] = LOGO_OVERRIDE[r["away"]]

        if home in TEAM_CITY_OVERRIDE:
            r["city"], cc = TEAM_CITY_OVERRIDE[home]
        else:
            cc = COUNTRY_CC.get(r.get("country"))

        # (re)resolve coordinates whenever we have a city and a country code to geocode
        # it with, whether that's a fresh override or an existing row still missing lat/lng
        if r.get("city") and cc and (r.get("lat") is None or r.get("lng") is None):
            key = f"{r['city']}|{cc}"
            coords = manual.get(key) or cache.get(key)
            if coords is None and key not in cache:
                print(f"Geocoding {r['city']} ({cc}) for {home}...")
                coords = geocode(r["city"], cc)
                cache[key] = coords
                cache_dirty = True
            if coords:
                r["lat"], r["lng"] = coords[0], coords[1]

        r["home_he"] = he_team(r["home"])
        r["away_he"] = he_team(r["away"])
        r["city_he"] = he_city(r["city"], r["country"])
        r["comp_he"] = he_comp(r["comp"])

    for c in payload.get("competitions", []):
        c["label_he"] = he_comp(c["label"])
        if not c.get("logo"):
            c["logo"] = f"https://media.api-sports.io/football/leagues/{c['id']}.png"

    if cache_dirty:
        save_json("cities_cache.json", cache)

    with open(path, "w", encoding="utf-8") as f:
        f.write("window.TRIP_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n")

    print(f"Backfilled {len(payload['fixtures'])} fixtures.")

    download_comp_logos()


if __name__ == "__main__":
    main()
