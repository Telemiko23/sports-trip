"""
check_coordinates.py - read-only sanity check (no network): lists every venue/city pair in fixtures.js whose
stadium pin is far from the city's own point. A big gap usually means the CITY point is wrong (a geocoder
returned a province centroid instead of the town - seen for Pisa/Parma/Lecce/Avellino/Frosinone/Bolzano/Soria)
or a typo in a hand-entered pin. Some gaps are legitimate (Yas Marina Circuit is on an island 23 km from Abu
Dhabi centre; Uxbridge FC is 23 km from central London).

  py check_coordinates.py [threshold_km]      default 20

Fix a wrong city point by adding "City|cc": [lat, lng] to cities_manual.json (it always wins over the cache),
then run backfill_hebrew.py.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))


def km(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def main():
    limit = float(sys.argv[1]) if len(sys.argv) > 1 else 20.0
    raw = open(os.path.join(HERE, "fixtures.js"), encoding="utf-8").read()
    data = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    seen = {}
    for f in data["fixtures"]:
        if f.get("venue_lat") is None or f.get("lat") is None:
            continue
        key = (f["city"], f["venue"], f["country"])
        if key not in seen:
            seen[key] = (km([f["lat"], f["lng"]], [f["venue_lat"], f["venue_lng"]]), f.get("home") or f.get("title"))
    bad = sorted(((d, k, who) for k, (d, who) in seen.items() if d > limit), reverse=True)
    print(f"{len(seen)} venue/city pairs checked; {len(bad)} with the pin more than {limit:g} km from the city point")
    for d, (city, venue, country), who in bad:
        print(f"  {d:6.1f} km  {city} ({country}) | {venue} | {who}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
