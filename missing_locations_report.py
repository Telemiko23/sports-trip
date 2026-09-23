#!/usr/bin/env python3
"""
missing_locations_report.py - lists every fixture in fixtures.js that has a city name
but no coordinates (so it gets silently excluded whenever a base-city + radius filter is
active - the "X fixtures without a known location" notice on the site). Run this after
build_fixtures.py to see what's worth fixing.

To fix one: add its "City, Country|cc" key to cities_manual.json with [lat, lng]
(cc = the 2-letter country code, e.g. "gb", "es"), or - if the API's city name itself is
wrong - add the team to TEAM_CITY_OVERRIDE in overrides.py instead. Either way, re-run
backfill_hebrew.py afterwards (no API calls needed).
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

COUNTRY_CC = {
    "England": "gb", "Spain": "es", "Germany": "de", "France": "fr",
    "Netherlands": "nl", "Italy": "it", "Poland": "pl",
}


def main():
    path = os.path.join(HERE, "fixtures.js")
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    payload = json.loads(raw[len("window.TRIP_DATA = "):].rstrip().rstrip(";"))
    fx = payload["fixtures"]

    missing = {}
    for f in fx:
        if f.get("city") and (f.get("lat") is None or f.get("lng") is None):
            cc = COUNTRY_CC.get(f["country"], "?")
            key = (f["city"], f["country"], cc)
            missing.setdefault(key, {"n": 0, "home": f["home"]})
            missing[key]["n"] += 1

    if not missing:
        print("Nothing missing - every fixture with a city name has coordinates.")
        return

    print(f"{len(missing)} cities have a name but no coordinates ({sum(v['n'] for v in missing.values())} fixtures affected):\n")
    for (city, country, cc), info in sorted(missing.items()):
        print(f'  "{city}|{cc}": [??, ??],   # {country} - {info["home"]} and {info["n"]} fixture(s)')
    print("\nAdd the real [lat, lng] for each into cities_manual.json, then run backfill_hebrew.py.")


if __name__ == "__main__":
    main()
