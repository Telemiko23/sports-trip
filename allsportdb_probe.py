#!/usr/bin/env python3
"""
allsportdb_probe.py - read-only exploration of the AllSportDB API (api.allsportdb.com/v3).
Nothing here writes to fixtures.js - it only dumps what the API returns for the next
DAYS_AHEAD days into allsportdb_probe.json (git-ignored) and prints a per-sport summary, so
we can decide which sports are worth wiring into the site before building anything.

Usage:
  set ALLSPORTDB_KEY=<your JWT>          (PowerShell: $env:ALLSPORTDB_KEY="<your JWT>")
  py allsportdb_probe.py

The key is read from the environment only - never pass it on the command line or paste it
in chat. Free plan: 10,000 calls/month, 10 events per call (hence the paging loop below).
"""
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://api.allsportdb.com/v3"
KEY = os.environ.get("ALLSPORTDB_KEY")
DAYS_AHEAD = int(os.environ.get("DAYS_AHEAD", "120"))
MAX_PAGES = int(os.environ.get("MAX_PAGES", "60"))  # safety cap: 60 calls max per run
HERE = os.path.dirname(os.path.abspath(__file__))


def get(path, **params):
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


def paged(path, **params):
    out = []
    for page in range(1, MAX_PAGES + 1):
        data, err = get(path, page=page, **params)
        if err:
            print(f"  {path} page {page}: {err}")
            break
        if not data:
            break
        out.extend(data)
        if len(data) < 10:
            break
    return out


def main():
    if not KEY:
        sys.exit("ALLSPORTDB_KEY is not set - see the usage note at the top of this file.")
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    today = datetime.date.today()
    date_from, date_to = today.isoformat(), (today + datetime.timedelta(days=DAYS_AHEAD)).isoformat()

    sports = paged("sports")
    print(f"{len(sports)} sports in the catalog")
    events = paged("calendar", dateFrom=date_from, dateTo=date_to)
    print(f"{len(events)} events {date_from} -> {date_to}\n")

    by_sport = {}
    for e in events:
        by_sport.setdefault(e.get("sport"), []).append(e)
    for name in sorted(by_sport, key=lambda n: -len(by_sport[n])):
        print(f"{len(by_sport[name]):4}  {name}")

    with open(os.path.join(HERE, "allsportdb_probe.json"), "w", encoding="utf-8") as f:
        json.dump({"sports": sports, "events": events}, f, ensure_ascii=False, indent=1)
    print("\nWrote allsportdb_probe.json")


if __name__ == "__main__":
    main()
