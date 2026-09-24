#!/usr/bin/env python3
"""
backfill_hebrew.py - one-off pass over an existing fixtures.js that (re)applies, without
touching the football API:
  - Hebrew display fields (home_he, away_he, city_he, comp_he), from he_names.py
  - manual corrections from overrides.py: a team's city (geocoded through Nominatim if
    it's new - the only network call this script makes), venue name, and crest
  - for a UEFA competition fixture (Champions/Europa/Conference League/Nations League)
    without an override, re-verifies its city/country the same way build_fixtures.py's
    UEFA block does (reusing a cached city|country_code first, only calling Nominatim for
    a city we haven't seen under any country yet) - so a fix to that resolution logic
    (e.g. telling Scotland apart from England) is picked up here too, not just on the
    next full pull.
  - the exact stadium location (venue_lat/venue_lng), cached in venues_cache.json the same
    way cities_cache.json caches city coordinates - lets the venue name link straight to
    Google Maps instead of just the city centre.

Safe to re-run any time after editing he_names.py or overrides.py.
"""
import json
import os

from he_names import he_team, he_city, he_comp
from overrides import TEAM_CITY_OVERRIDE, VENUE_OVERRIDE, LOGO_OVERRIDE
from download_logos import download_comp_logos
from build_fixtures import geocode, geocode_any, CC_TO_OUR_COUNTRY, CC_COUNTRY_NAME, UEFA_COMPETITIONS, NATIONAL_COMPETITIONS

HERE = os.path.dirname(os.path.abspath(__file__))

# both are "unknown venue country until geocoded" competitions - UEFA club competitions and
# UEFA Nations League alike
UEFA_LABELS = {label for _, _, label in UEFA_COMPETITIONS} | {label for _, _, label in NATIONAL_COMPETITIONS}

COUNTRY_CC = {
    "England": "gb", "Spain": "es", "Germany": "de", "France": "fr",
    "Netherlands": "nl", "Italy": "it", "Poland": "pl", "Portugal": "pt",
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


def main():
    path = os.path.join(HERE, "fixtures.js")
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    payload = json.loads(raw[len("window.TRIP_DATA = "):].rstrip().rstrip(";"))

    cache = load_json("cities_cache.json", {})
    manual = load_json("cities_manual.json", {})
    vcache = load_json("venues_cache.json", {})
    cache_dirty = vcache_dirty = False

    for r in payload["fixtures"]:
        if r.get("sport", "football") != "football":
            continue  # other sports are rebuilt by build_events.py, which owns their translation/geocoding
        home = r["home"]

        if VENUE_OVERRIDE.get(home):
            r["venue"] = VENUE_OVERRIDE[home]

        if LOGO_OVERRIDE.get(r["home"]):
            r["home_logo"] = LOGO_OVERRIDE[r["home"]]
        if LOGO_OVERRIDE.get(r["away"]):
            r["away_logo"] = LOGO_OVERRIDE[r["away"]]

        overridden = home in TEAM_CITY_OVERRIDE
        is_uefa = r["comp"] in UEFA_LABELS
        if overridden:
            r["city"], cc = TEAM_CITY_OVERRIDE[home]
        elif is_uefa:
            cc = None  # not a fixed domestic country - resolve/reuse below
        else:
            cc = COUNTRY_CC.get(r.get("country"))

        # an override always re-resolves (it may replace an already-geocoded but wrong
        # city); a plain domestic row only needs it if it's not geocoded yet; a UEFA row
        # without an override always re-resolves too, cheaply, via cache reuse - so a fix
        # to geocode_any() (e.g. Scotland vs England) gets picked up on old data as well
        needs_resolve = r.get("city") and (
            overridden or is_uefa or r.get("lat") is None or r.get("lng") is None
        )
        if needs_resolve:
            coords = None
            if cc:
                key = f"{r['city']}|{cc}"
                coords = manual.get(key) or cache.get(key)
                if coords is None and key not in cache:
                    print(f"Geocoding {r['city']} ({cc}) for {home}...")
                    coords, ok = geocode(r["city"], cc)
                    if ok:
                        cache[key] = coords
                        cache_dirty = True
            else:
                key_guess = next((k for k in cache if k.startswith(f"{r['city']}|")), None) or \
                            next((k for k in manual if k.startswith(f"{r['city']}|")), None)
                if key_guess:
                    cc = key_guess.split("|", 1)[1]
                    coords = manual.get(key_guess) or cache.get(key_guess)
                else:
                    print(f"Geocoding {r['city']} (unknown country) for {home}...")
                    coords, cc, ok = geocode_any(r["city"])
                    if ok and coords and cc:
                        cache[f"{r['city']}|{cc}"] = coords
                        cache_dirty = True
            if coords:
                r["lat"], r["lng"] = coords[0], coords[1]
            if cc:
                r["country"] = CC_TO_OUR_COUNTRY.get(cc) or CC_COUNTRY_NAME.get(cc) or cc

        # exact stadium location, so the venue name can link straight to Google Maps -
        # re-keyed on (venue, city) so a new VENUE_OVERRIDE name gets geocoded fresh too
        if r.get("venue") and r.get("city") and cc:
            vkey = f"{r['venue']}|{r['city']}"
            vcoords = vcache.get(vkey)
            if vcoords is None and vkey not in vcache:
                print(f"Geocoding stadium {r['venue']} ({r['city']})...")
                vcoords, ok = geocode(f"{r['venue']}, {r['city']}", cc)
                if ok:
                    vcache[vkey] = vcoords
                    vcache_dirty = True
            r["venue_lat"], r["venue_lng"] = (vcoords[0], vcoords[1]) if vcoords else (None, None)
        else:
            r["venue_lat"], r["venue_lng"] = None, None

        r["home_he"] = he_team(r["home"])
        r["away_he"] = he_team(r["away"])
        r["city_he"] = he_city(r["city"], r["country"])
        r["comp_he"] = he_comp(r["comp"])

    for c in payload.get("competitions", []):
        c["label_he"] = he_comp(c["label"])
        if not c.get("logo") and c.get("sport", "football") == "football":
            c["logo"] = f"https://media.api-sports.io/football/leagues/{c['id']}.png"

    if cache_dirty:
        save_json("cities_cache.json", cache)
    if vcache_dirty:
        save_json("venues_cache.json", vcache)

    with open(path, "w", encoding="utf-8") as f:
        f.write("window.TRIP_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n")

    print(f"Backfilled {len(payload['fixtures'])} fixtures.")

    download_comp_logos()


if __name__ == "__main__":
    main()
