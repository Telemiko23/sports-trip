#!/usr/bin/env python3
"""
Coverage check for API-Football (v3.football.api-sports.io).

For each target league/cup it reports:
  - whether the competition exists in the API and under which name/id
  - the current season the API exposes
  - how many upcoming fixtures come back (and how many have no confirmed kickoff time)
  - how many teams come back with a venue city (needed for the city/radius filter)

Usage:
  1. Register at https://www.api-football.com (direct dashboard, not RapidAPI) and copy your key.
  2. Set the key as an environment variable:
       Windows (CMD):   set API_FOOTBALL_KEY=your_key
       Windows (PS):    $env:API_FOOTBALL_KEY="your_key"
       Mac / Linux:     export API_FOOTBALL_KEY=your_key
  3. python coverage_check.py

Cost: about 7 + 23 + 23 = ~53 requests (free plan = 100/day, 10/min).
Runtime: ~6 minutes, because the script waits between calls to respect the per-minute limit.

Optional env vars:
  SKIP_TEAMS=1   skip the team/venue-city check (saves ~23 requests)
  SLEEP=6.5      seconds to wait between calls
Output: a table in the console + coverage_report.json next to the script.
"""
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://v3.football.api-sports.io"
KEY = os.environ.get("API_FOOTBALL_KEY")
SLEEP = float(os.environ.get("SLEEP", "6.5"))
SKIP_TEAMS = os.environ.get("SKIP_TEAMS") == "1"

# (country as used by the API, our label, accepted API names)
TARGETS = [
    ("England", "Premier League", ["Premier League"]),
    ("England", "Championship", ["Championship"]),
    ("England", "League One", ["League One"]),
    ("England", "League Two", ["League Two"]),
    ("England", "FA Cup", ["FA Cup"]),
    ("England", "EFL Cup", ["League Cup", "EFL Cup", "Carabao Cup"]),
    ("England", "EFL Trophy", ["EFL Trophy", "Football League Trophy"]),
    ("Spain", "La Liga", ["La Liga", "LaLiga", "Primera Division"]),
    ("Spain", "Segunda", ["Segunda Division", "La Liga 2", "LaLiga 2"]),
    ("Spain", "Copa del Rey", ["Copa del Rey"]),
    ("Germany", "Bundesliga", ["Bundesliga"]),
    ("Germany", "2. Bundesliga", ["2. Bundesliga"]),
    ("Germany", "DFB-Pokal", ["DFB Pokal", "DFB-Pokal"]),
    ("France", "Ligue 1", ["Ligue 1"]),
    ("France", "Ligue 2", ["Ligue 2"]),
    ("France", "Coupe de France", ["Coupe de France"]),
    ("Netherlands", "Eredivisie", ["Eredivisie"]),
    ("Netherlands", "KNVB Beker", ["KNVB Beker", "KNVB Cup"]),
    ("Italy", "Serie A", ["Serie A"]),
    ("Italy", "Serie B", ["Serie B"]),
    ("Italy", "Coppa Italia", ["Coppa Italia"]),
    ("Poland", "Ekstraklasa", ["Ekstraklasa"]),
    ("Poland", "Puchar Polski", ["Puchar Polski", "Polish Cup"]),
]


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().replace("-", " ").strip()


def call(path, **params):
    """Returns (json_dict, requests_remaining_today_or_None)."""
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(
        url, headers={"x-apisports-key": KEY, "User-Agent": "coverage-check/1.0"}
    )
    for attempt in range(2):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.load(r)
                remaining = r.headers.get("x-ratelimit-requests-remaining")
            time.sleep(SLEEP)
            return data, remaining
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt == 0:
                print("  rate limited, waiting 65s...")
                time.sleep(65)
                continue
            return {"errors": {"http": f"{e.code} {e.reason}"}, "response": []}, None
        except Exception as e:  # network problems etc.
            return {"errors": {"network": str(e)}, "response": []}, None
    return {"errors": {"unknown": "failed"}, "response": []}, None


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    if not KEY:
        sys.exit("API_FOOTBALL_KEY is not set - see the instructions at the top of this file.")

    remaining = None
    leagues_by_country = {}
    for country in sorted({t[0] for t in TARGETS}):
        print(f"Loading leagues for {country}...")
        data, rem = call("leagues", country=country)
        remaining = rem or remaining
        if data.get("errors"):
            print(f"  ERROR: {data['errors']}")
            leagues_by_country[country] = []
        else:
            leagues_by_country[country] = data.get("response", [])

    report = []
    print()
    for country, label, aliases in TARGETS:
        wanted = {norm(a) for a in aliases}
        match = next(
            (x for x in leagues_by_country[country] if norm(x["league"]["name"]) in wanted),
            None,
        )
        row = {"country": country, "label": label}

        if not match:
            row["status"] = "NOT FOUND"
            row["candidates"] = [x["league"]["name"] for x in leagues_by_country[country]][:40]
            report.append(row)
            print(f"{country:12} {label:16} NOT FOUND under names {aliases}")
            continue

        lid = match["league"]["id"]
        seasons = match.get("seasons", [])
        cur = next((s for s in seasons if s.get("current")), seasons[-1] if seasons else None)
        year = cur["year"] if cur else None
        row.update(id=lid, api_name=match["league"]["name"], season=year)

        fx, rem = call("fixtures", league=lid, season=year, next=10)
        remaining = rem or remaining
        if fx.get("errors"):
            row["status"] = "ERROR"
            row["error"] = fx["errors"]
        else:
            items = fx.get("response", [])
            dates = sorted(i["fixture"]["date"] for i in items)
            row["status"] = "OK" if items else "NO UPCOMING"
            row["upcoming"] = len(items)
            row["tbd_time"] = sum(1 for i in items if i["fixture"]["status"]["short"] == "TBD")
            row["first_fixture"] = dates[0][:16] if dates else None

        if not SKIP_TEAMS and year and row["status"] != "ERROR":
            tm, rem = call("teams", league=lid, season=year)
            remaining = rem or remaining
            teams = tm.get("response", []) if not tm.get("errors") else []
            row["teams"] = len(teams)
            row["teams_with_city"] = sum(1 for t in teams if (t.get("venue") or {}).get("city"))

        report.append(row)
        extra = ""
        if row["status"] == "ERROR":
            extra = f" error={row['error']}"
        elif row["status"] == "OK":
            extra = f" upcoming={row['upcoming']} tbd_time={row['tbd_time']} first={row['first_fixture']}"
        if "teams" in row:
            extra += f" teams={row['teams']} with_city={row['teams_with_city']}"
        print(f"{country:12} {label:16} id={lid:<5} season={year} [{row['status']}]{extra}")

    print()
    bad = [r for r in report if r["status"] != "OK"]
    print(f"{len(report) - len(bad)}/{len(report)} competitions returned upcoming fixtures.")
    for r in bad:
        print(f"  - {r['country']} / {r['label']}: {r['status']} {r.get('error', '')}")
    if remaining is not None:
        print(f"Requests remaining today: {remaining}")

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "coverage_report.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"Saved {out}")
    print("Send me the console output (or the JSON) and we'll decide the plan from there.")


if __name__ == "__main__":
    main()
