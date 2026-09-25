#!/usr/bin/env python3
"""
build_events.py - non-football events (Formula 1 races, tennis tournaments) from the
AllSportDB API (api.allsportdb.com/v3), turned into the same row shape index.html reads,
and merged into fixtures.js next to the football fixtures.

Why a separate script + data file instead of extending build_fixtures.py: AllSportDB's free
key expires every 30 days and has to be renewed by hand, so this must NOT run in the daily
GitHub Action (a dead key would break the football refresh too). Instead:
  - `py build_events.py` (with ALLSPORTDB_KEY set) pulls fresh events, saves the raw
    response to events_raw.json and the finished rows to events_data.json, then merges them
    into fixtures.js. Run it by hand every so often, and commit the two json files.
  - without a key it rebuilds events_data.json from the saved events_raw.json (so a
    translation fix in he_names.py can be re-applied offline), and merges again.
  - build_fixtures.py (daily Action) calls merge_events() at the end, so the events survive
    each football refresh without touching the AllSportDB API at all; events that have
    already ended are dropped at merge time.

Also reads events_manual.json - hand-entered events for a sport no licensed API covers (darts) -
and turns them into the same rows (with an exact stadium pin via venues_cache.json).

Only future events are kept - there's no reason to pull past ones.
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from he_names import he_event, he_comp, he_city
from overrides import COUNTRY_FLAG, EVENT_COMP_LOGO, EVENT_VENUE_OVERRIDE
from download_logos import download_flags

BASE = "https://api.allsportdb.com/v3"
KEY = os.environ.get("ALLSPORTDB_KEY")
DAYS_AHEAD = int(os.environ.get("DAYS_AHEAD", "400"))
MAX_PAGES = 60
HERE = os.path.dirname(os.path.abspath(__file__))

# AllSportDB sportId -> (our sport key, sport name, emoji, competition-name filter or None = all)
SPORTS = {
    11: ("f1", "Formula 1", "🏎️", {"Formula 1"}),  # sportId 11 is all Motor Sports - we only want F1
    17: ("tennis", "Tennis", "🎾", None),
}
# AllSportDB events get ids in their own namespace; offset them so they can never collide with
# an API-Football fixture id / league id (the site keys its state on those numbers)
EVENT_ID_OFFSET = 1_000_000_000
COMP_ID_OFFSET = 1_000_000
# competitions whose "<comp> - <event>" prefix is redundant next to the competition tag
STRIP_COMP_PREFIX = {"Formula 1", "ATP Tour", "WTA Tour"}


def api_get(path, **params):
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {KEY}", "User-Agent": "sports-trip-planner/1.0", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            data = json.load(r)
        time.sleep(0.3)
        return data, None
    except urllib.error.HTTPError as e:
        return None, f"{e.code} {e.reason}"
    except Exception as e:
        return None, str(e)


def fetch_raw():
    today = datetime.date.today()
    date_to = (today + datetime.timedelta(days=DAYS_AHEAD)).isoformat()
    out = []
    for sport_id, (_, name, _, comp_filter) in SPORTS.items():
        n = 0
        for page in range(1, MAX_PAGES + 1):
            data, err = api_get("calendar", sportId=sport_id, dateFrom=today.isoformat(), dateTo=date_to, page=page)
            if err:
                sys.exit(f"AllSportDB error for {name}, page {page}: {err} (an expired key gives 401 - renew it "
                         f"on AllSportDB's API Settings page)")
            if not data:
                break
            for e in data:
                if comp_filter is None or e.get("competition") in comp_filter:
                    out.append(e)
                    n += 1
            if len(data) < 10:
                break
        print(f"{name}: {n} events")
    return out


def load_raw():
    if KEY:
        raw = fetch_raw()
        with open(os.path.join(HERE, "events_raw.json"), "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False, indent=1)
        return raw
    path = os.path.join(HERE, "events_raw.json")
    if os.path.exists(path):
        print("No ALLSPORTDB_KEY - rebuilding from the saved events_raw.json")
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    probe = os.path.join(HERE, "allsportdb_probe.json")
    if os.path.exists(probe):
        print("No key and no events_raw.json - seeding from allsportdb_probe.json")
        with open(probe, encoding="utf-8") as f:
            ev = json.load(f)["events"]
        raw = [e for e in ev if e.get("sportId") in SPORTS
               and (SPORTS[e["sportId"]][3] is None or e.get("competition") in SPORTS[e["sportId"]][3])]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False, indent=1)
        return raw
    sys.exit("ALLSPORTDB_KEY is not set and there's no saved data to rebuild from.")


def clean_title(name, competition):
    t = re.sub(r"^\d{4}\s+", "", name).strip()
    prefix = f"{competition} - "
    if competition in STRIP_COMP_PREFIX and t.startswith(prefix):
        t = t[len(prefix):]
    return t


def build_rows(raw):
    from build_fixtures import geocode, load_json, save_json
    cache = load_json("cities_cache.json", {})
    manual = load_json("cities_manual.json", {})
    vcache = load_json("venues_cache.json", {})
    vstate = {"dirty": False}
    spath = os.path.join(HERE, "events_sessions.json")
    sessions_all = json.load(open(spath, encoding="utf-8")) if os.path.exists(spath) else {}

    def pin(venue, city, cc):
        """Exact stadium/circuit coordinates, geocoded once and cached in venues_cache.json."""
        vkey = f"{venue}|{city}"
        vc = vcache.get(vkey)
        if vc is None and vkey not in vcache and cc:
            print(f"Geocoding stadium {venue} ({city})...")
            vc, ok = geocode(f"{venue}, {city}", cc)
            if ok:
                vcache[vkey] = vc
                vstate["dirty"] = True
        return vc

    def sessions_for(title):
        s = sessions_all.get(title)
        return {"sessions": s["days"], "sessions_note": s.get("note")} if s else {}

    rows, comps, seen = [], {}, set()
    skipped = []
    dirty = False
    for e in sorted(raw, key=lambda e: e["dateFrom"]):
        sport_key, sport_name, emoji, _ = SPORTS[e["sportId"]]
        spots = [(c["name"], (c.get("code") or "").lower(), l["name"])
                 for c in (e.get("location") or []) for l in (c.get("locations") or [])
                 if l.get("name") and l["name"] not in ("TBA", "Europe")]
        if e["id"] in seen or not spots:
            skipped.append(e["name"])
            continue
        seen.add(e["id"])
        country, cc, city = spots[0]  # a multi-city event (e.g. United Cup) is placed at its first city
        key = f"{city}|{cc}"
        coords = manual.get(key) or cache.get(key)
        if coords is None and cc and key not in cache:
            print(f"Geocoding {city} ({cc})...")
            coords, ok = geocode(city, cc)
            if ok:
                cache[key] = coords
                dirty = True
        date_from = e["dateFrom"][:10]
        date_to = (e.get("dateTo") or e["dateFrom"])[:10]
        title = clean_title(e["name"], e["competition"])
        comp_id = COMP_ID_OFFSET + e["competitionId"]
        comps.setdefault(comp_id, {"id": comp_id, "label": e["competition"], "label_he": he_comp(e["competition"]),
                                   "country": sport_name, "sport": sport_key, "emoji": emoji})
        venue = EVENT_VENUE_OVERRIDE.get(title)
        vc = pin(venue, city, cc) if venue else None
        rows.append({
            "id": EVENT_ID_OFFSET + e["id"], "sport": sport_key, "emoji": emoji,
            "dt": date_from + "T00:00", "date_to": date_to, "status": "TBD",
            "title": title, "title_he": he_event(title),
            "comp_id": comp_id, "comp": e["competition"], "comp_he": he_comp(e["competition"]),
            "country": country, "round": None, "venue": venue, "city": city, "city_he": he_city(city, country),
            "lat": coords[0] if coords else None, "lng": coords[1] if coords else None,
            "venue_lat": vc[0] if vc else None, "venue_lng": vc[1] if vc else None, "web_url": e.get("webUrl"),
            **sessions_for(title),
        })
    # hand-entered events (darts) - same row shape, plus an exact stadium pin via venues_cache.json
    mpath = os.path.join(HERE, "events_manual.json")
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as f:
            m = json.load(f)
        for ev in m["events"]:
            key = f"{ev['city']}|{ev['cc']}"
            coords = manual.get(key) or cache.get(key)
            if coords is None and key not in cache:
                print(f"Geocoding {ev['city']} ({ev['cc']})...")
                coords, ok = geocode(ev["city"], ev["cc"])
                if ok:
                    cache[key] = coords
                    dirty = True
            vc = pin(ev["venue"], ev["city"], ev["cc"])
            comp_id = 2 * COMP_ID_OFFSET + m["competitions"][ev["comp"]]
            comps.setdefault(comp_id, {"id": comp_id, "label": ev["comp"], "label_he": he_comp(ev["comp"]),
                                       "country": m["sport_name"], "sport": m["sport"], "emoji": m["emoji"]})
            rows.append({
                "id": 2 * EVENT_ID_OFFSET + ev["id"], "sport": m["sport"], "emoji": m["emoji"],
                "dt": ev["from"] + "T00:00", "date_to": ev["to"], "status": "TBD",
                "title": ev["title"], "title_he": he_event(ev["title"]),
                "comp_id": comp_id, "comp": ev["comp"], "comp_he": he_comp(ev["comp"]),
                "country": ev["country"], "round": None, "venue": ev["venue"], "city": ev["city"],
                "city_he": he_city(ev["city"], ev["country"]),
                "lat": coords[0] if coords else None, "lng": coords[1] if coords else None,
                "venue_lat": vc[0] if vc else None, "venue_lng": vc[1] if vc else None, "web_url": None,
                **sessions_for(ev["title"]),
            })
    if vstate["dirty"]:
        save_json("venues_cache.json", vcache)
    rows.sort(key=lambda r: r["dt"])
    if dirty:
        save_json("cities_cache.json", cache)
    for name in skipped:
        print(f"  skipped (no usable city or duplicate): {name}")
    return rows, list(comps.values())


def load_events():
    """Finished rows + competitions from events_data.json, minus events that already ended."""
    path = os.path.join(HERE, "events_data.json")
    if not os.path.exists(path):
        return [], []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    today = datetime.date.today().isoformat()
    rows = [r for r in data["fixtures"] if r["date_to"] >= today]
    used = {r["comp_id"] for r in rows}
    return rows, [c for c in data["competitions"] if c["id"] in used]


def merge_events(payload):
    """Replace any non-football rows/competitions in `payload` with the current events."""
    payload["fixtures"] = [r for r in payload["fixtures"] if r.get("sport", "football") == "football"]
    payload["competitions"] = [c for c in payload["competitions"] if c.get("sport", "football") == "football"]
    rows, comps = load_events()
    # presentation extras kept out of the raw data: the competition's crest, and the host country's flag
    for c in comps:
        if c["label"] in EVENT_COMP_LOGO:
            c["logo"] = EVENT_COMP_LOGO[c["label"]]
    for r in rows:
        r["flag"] = COUNTRY_FLAG.get(r["country"])
    download_flags(r["flag"] for r in rows if r["flag"])
    for name in sorted({r["country"] for r in rows if not r["flag"]}):
        print(f"  no flag mapped for host country {name!r} - add it to COUNTRY_FLAG in overrides.py")
    payload["fixtures"].extend(rows)
    payload["competitions"].extend(comps)
    payload["fixtures"].sort(key=lambda r: r["dt"])
    return len(rows)


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    rows, comps = build_rows(load_raw())
    with open(os.path.join(HERE, "events_data.json"), "w", encoding="utf-8") as f:
        json.dump({"fixtures": rows, "competitions": comps}, f, ensure_ascii=False, indent=1)
    path = os.path.join(HERE, "fixtures.js")
    with open(path, encoding="utf-8") as f:
        payload = json.loads(f.read()[len("window.TRIP_DATA = "):].rstrip().rstrip(";"))
    n = merge_events(payload)
    with open(path, "w", encoding="utf-8") as f:
        f.write("window.TRIP_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n")
    print(f"\n{len(rows)} events built, {n} still upcoming - merged into fixtures.js")


if __name__ == "__main__":
    main()
