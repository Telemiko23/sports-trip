#!/usr/bin/env python3
"""
translation_coverage_report.py - scans the existing fixtures.js for any team/city name
that fell through to automatic phonetic transliteration instead of a reviewed dictionary
entry in he_names.py (HE_TEAMS / HE_CITIES). A transliterated name is never *wrong*
outright, but it's never been human-checked either - this is the same "review before
trusting" pattern used throughout the project's history for translations.

Doesn't touch the football API or Nominatim - just reads fixtures.js and he_names.py.
Run any time to catch gaps left by a real build_fixtures.py pull (a name new to that run).
"""
import json
import os

from he_names import HE_TEAMS, HE_CITIES, HE_COMPETITIONS, HE_EVENTS

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    with open(os.path.join(HERE, "fixtures.js"), encoding="utf-8") as f:
        raw = f.read()
    payload = json.loads(raw[len("window.TRIP_DATA = "):].rstrip().rstrip(";"))

    teams_missing = {}
    cities_missing = {}
    comps_missing = set()

    events_missing = {}
    for r in payload["fixtures"]:
        if r.get("sport", "football") != "football":
            # other sports: event titles come from HE_EVENTS, cities from HE_CITIES
            if r["title"] not in HE_EVENTS:
                events_missing.setdefault(r["title"], set()).add(r["comp"])
            key = f"{r['city']}|{r['country']}"
            if r.get("city") and key not in HE_CITIES:
                cities_missing.setdefault(key, set()).add(r["title"])
            if r["comp"] not in HE_COMPETITIONS:
                comps_missing.add(r["comp"])
            continue
        for name in (r["home"], r["away"]):
            if name not in HE_TEAMS:
                teams_missing.setdefault(name, set()).add(r["comp"])
        if r.get("city") and r.get("country"):
            key = f"{r['city']}|{r['country']}"
            if key not in HE_CITIES:
                cities_missing.setdefault(key, set()).add(r["home"])
        if r["comp"] not in HE_COMPETITIONS:
            comps_missing.add(r["comp"])

    print(f"Teams without a reviewed HE_TEAMS entry (fell back to transliteration): {len(teams_missing)}")
    for name in sorted(teams_missing):
        comps = ", ".join(sorted(teams_missing[name]))
        print(f"  {name!r}  ({comps})")

    print(f"\nCities without a reviewed HE_CITIES entry (fell back to transliteration): {len(cities_missing)}")
    for key in sorted(cities_missing):
        teams = ", ".join(sorted(cities_missing[key]))
        print(f"  {key!r}  (e.g. {teams})")

    print(f"\nNon-football event titles without a HE_EVENTS entry (shown in English): {len(events_missing)}")
    for t in sorted(events_missing):
        print(f"  {t!r}  ({', '.join(sorted(events_missing[t]))})")

    print(f"\nCompetitions without a HE_COMPETITIONS entry (shown in English): {len(comps_missing)}")
    for c in sorted(comps_missing):
        print(f"  {c!r}")


if __name__ == "__main__":
    main()
