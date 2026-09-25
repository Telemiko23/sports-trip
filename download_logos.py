#!/usr/bin/env python3
"""
download_logos.py - downloads every team crest referenced in fixtures.js into the
local logos/ folder, named after the team (e.g. logos/AFC_Wimbledon.png) rather than
its numeric API id, so the folder is easy to browse by eye. Then rewrites fixtures.js's
home_logo/away_logo fields to point at those local files instead of media.api-sports.io.

Safe to re-run - files that were already downloaded are skipped (matched by team name,
not by re-downloading), and a fresh build_fixtures.py run just fetches whatever is new.
Runs automatically at the end of build_fixtures.py.

overrides.py's LOGO_OVERRIDE entries (hand-sourced crests API-Football doesn't have)
are matched by team name here too, and are never overwritten by a re-download.
"""
import json
import os
import re
import unicodedata
import urllib.request

from overrides import LOGO_OVERRIDE

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO_DIR = os.path.join(HERE, "logos")
COMP_LOGO_DIR = os.path.join(HERE, "comp_logos")


def slug(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^A-Za-z0-9]+", "_", ascii_name).strip("_")
    return ascii_name or "team"


def download_logos():
    path = os.path.join(HERE, "fixtures.js")
    if not os.path.exists(path):
        print("No fixtures.js yet - run build_fixtures.py first.")
        return
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    payload = json.loads(raw[len("window.TRIP_DATA = "):].rstrip().rstrip(";"))
    rows = payload["fixtures"]

    os.makedirs(LOGO_DIR, exist_ok=True)
    downloaded = skipped = failed = 0
    # team name -> local "logos/Name.png" path, resolved once per distinct team
    resolved = {}

    for r in rows:
        if r.get("sport", "football") != "football":
            continue  # other sports (build_events.py) have no team crests
        for role, name_key, logo_key in (("home", "home", "home_logo"), ("away", "away", "away_logo")):
            team = r[name_key]
            url = r.get(logo_key)

            if team in resolved:
                r[logo_key] = resolved[team]
                continue

            override = LOGO_OVERRIDE.get(team)
            if override:
                # override points at an existing hand-placed file (e.g. logos/28424.png) -
                # copy it under the team's own name so the folder stays name-addressable
                local_name = f"{slug(team)}.png"
                local_path = os.path.join(LOGO_DIR, local_name)
                src_path = os.path.join(HERE, override)
                if not os.path.exists(local_path) and os.path.exists(src_path):
                    with open(src_path, "rb") as sf, open(local_path, "wb") as df:
                        df.write(sf.read())
                resolved[team] = "logos/" + local_name
                r[logo_key] = resolved[team]
                continue

            if not url or url.startswith("logos/"):
                if url:
                    resolved[team] = url
                continue

            local_name = f"{slug(team)}.png"
            local_path = os.path.join(LOGO_DIR, local_name)
            if not os.path.exists(local_path):
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "sports-trip-planner/1.0"})
                    with urllib.request.urlopen(req, timeout=20) as resp, open(local_path, "wb") as out:
                        out.write(resp.read())
                    downloaded += 1
                except Exception as e:
                    print(f"  could not download {url} ({team}): {e}")
                    failed += 1
                    continue
            else:
                skipped += 1
            resolved[team] = "logos/" + local_name
            r[logo_key] = resolved[team]

    with open(path, "w", encoding="utf-8") as f:
        f.write("window.TRIP_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n")

    print(f"Logos: {downloaded} downloaded, {skipped} already had a local copy, {failed} failed. Saved in logos/.")


def download_comp_logos():
    """Same idea as download_logos(), for the ~23 competition crests (comps_meta[].logo)."""
    path = os.path.join(HERE, "fixtures.js")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        raw = f.read()
    payload = json.loads(raw[len("window.TRIP_DATA = "):].rstrip().rstrip(";"))
    comps = payload.get("competitions", [])

    os.makedirs(COMP_LOGO_DIR, exist_ok=True)
    downloaded = skipped = failed = 0

    for c in comps:
        url = c.get("logo")
        if not url or url.startswith("comp_logos/"):
            continue
        local_name = f"{slug(c['label'])}.png"
        local_path = os.path.join(COMP_LOGO_DIR, local_name)
        if not os.path.exists(local_path):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "sports-trip-planner/1.0"})
                with urllib.request.urlopen(req, timeout=20) as resp, open(local_path, "wb") as out:
                    out.write(resp.read())
                downloaded += 1
            except Exception as e:
                print(f"  could not download {url} ({c['label']}): {e}")
                failed += 1
                continue
        else:
            skipped += 1
        c["logo"] = "comp_logos/" + local_name

    with open(path, "w", encoding="utf-8") as f:
        f.write("window.TRIP_DATA = " + json.dumps(payload, ensure_ascii=False) + ";\n")

    print(f"Competition logos: {downloaded} downloaded, {skipped} already had a local copy, {failed} failed.")


FLAG_DIR = os.path.join(HERE, "flags")
_FLAG_CODE = re.compile(r"^[a-z]{2}(-[a-z]{3})?$")  # 'de', 'gb-eng' - also keeps the code safe to use as a filename


def download_flags(codes):
    """Save flags/<code>.svg (from flagcdn.com) for each code we don't have yet, so the site serves
    them itself instead of depending on an external host. Best effort: a failure only means no flag."""
    os.makedirs(FLAG_DIR, exist_ok=True)
    for code in sorted(set(codes)):
        if not _FLAG_CODE.match(code):
            print(f"  skipping flag with an unexpected code: {code!r}")
            continue
        path = os.path.join(FLAG_DIR, code + ".svg")
        if os.path.exists(path):
            continue
        try:
            req = urllib.request.Request(f"https://flagcdn.com/{code}.svg", headers={"User-Agent": "sports-trip-planner/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp, open(path, "wb") as out:
                out.write(resp.read())
            print(f"  flag downloaded: {code}")
        except Exception as e:
            print(f"  could not download flag {code}: {e}")


if __name__ == "__main__":
    download_logos()
    download_comp_logos()
