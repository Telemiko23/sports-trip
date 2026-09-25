"""
missing_info_report.py - writes missing_info.csv: everything in fixtures.js that has no stadium/venue,
no exact pin, or (national teams) no city, so it can be filled in by hand.

  py missing_info_report.py

Columns 9-10 (my suggestion + confidence) are carried over from the previous CSV when the same row is
still missing, so they aren't lost. Fill the last columns (venue / city / "lat,lng") and send the file
back - never guess; leave a cell empty if unknown. No network, no API quota.
"""
import csv
import json
import os
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
CSV = os.path.join(HERE, "missing_info.csv")
SPORT_HE = {"football": "כדורגל", "tennis": "טניס", "darts": "דארטס", "f1": "פורמולה 1"}
HEADER = ["ענף", "תחרות", "קבוצה/אירוע", "כמה משחקים/ימים", "מה חסר", "עיר נוכחית", "מדינה", "אצטדיון נוכחי",
          "ההצעה שלי", "רמת ביטחון בהצעה", "תיקון שלך: אצטדיון", "תיקון שלך: עיר", "תיקון שלך: קואורדינטות lat,lng", "הערה"]
NO_VENUE_EV = "אצטדיון/אולם חסר"
NO_VENUE = "אצטדיון חסר"
NO_PIN = "אין סיכה מדויקת (קואורדינטות)"
NO_CITY = "אין עיר ואצטדיון (ה-API לא מפרסם למשחקי נבחרות)"


def write_translations(data):
    """missing_translations.csv: team/city names with no reviewed Hebrew entry (the site shows an automatic
    transliteration for them - readable, but not checked). Fill 'your Hebrew' and send back."""
    from he_names import HE_TEAMS, HE_CITIES
    teams, cities = OrderedDict(), OrderedDict()
    for f in data["fixtures"]:
        if f.get("sport"):
            continue
        for side in ("home", "away"):
            n = f[side]
            if n not in HE_TEAMS and n not in teams:
                teams[n] = (f.get("comp_he") or f["comp"], f.get(side + "_he") or "")
        if f.get("city"):
            key = f"{f['city']}|{f['country']}"
            if key not in HE_CITIES and key not in cities:
                cities[key] = (f.get("home") or "", f.get("city_he") or "")
    with open(os.path.join(HERE, "missing_translations.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["סוג", "השם המדויק ב-API (המפתח)", "איפה מופיע", "העברית האוטומטית כרגע", "העברית הנכונה שלך", "הערה"])
        for n, (comp, he) in sorted(teams.items()):
            w.writerow(["קבוצה", n, comp, he, "", ""])
        for k, (ex, he) in sorted(cities.items()):
            w.writerow(["עיר", k, "למשל: " + ex, he, "", ""])
    print(f"{len(teams)} teams + {len(cities)} cities -> missing_translations.csv")


def main():
    raw = open(os.path.join(HERE, "fixtures.js"), encoding="utf-8").read()
    data = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    old = {}
    if os.path.exists(CSV):
        with open(CSV, encoding="utf-8-sig", newline="") as f:
            for r in list(csv.reader(f))[1:]:
                if len(r) >= 10:
                    old[(r[1], r[2], r[4])] = (r[8], r[9], r[13] if len(r) > 13 else "")
    groups = OrderedDict()   # (sport, comp, name, missing) -> [count, city, country, venue]

    def add(sport, comp, name, missing, city, country, venue):
        g = groups.setdefault((sport, comp, name, missing), [0, city, country, venue])
        g[0] += 1

    seen_days = set()
    for f in data["fixtures"]:
        sp = f.get("sport") or "football"
        if sp == "football":
            comp, name = f.get("comp_he") or f["comp"], f.get("home_he") or f["home"]
            if not f.get("city"):
                add(sp, comp, f"{name} (כמארחת)", NO_CITY, "", f["country"], "")
            elif not f.get("venue"):
                add(sp, comp, name, NO_VENUE, f.get("city_he") or f["city"], f["country"], "")
            elif f.get("venue_lat") is None:
                add(sp, comp, name, NO_PIN, f.get("city_he") or f["city"], f["country"], f["venue"])
        else:
            # one row per event (its per-day copies are made in the browser, not in the data)
            comp, name = f.get("comp_he") or f["comp"], f.get("title_he") or f["title"]
            if not f.get("venue"):
                add(sp, comp, name, NO_VENUE_EV, f.get("city_he") or f.get("city") or "", f["country"], "")
            elif f.get("venue_lat") is None:
                add(sp, comp, name, NO_PIN, f.get("city_he") or f.get("city") or "", f["country"], f["venue"])
    rows = []
    for (sp, comp, name, missing), (n, city, country, venue) in sorted(groups.items(), key=lambda kv: (kv[0][0], kv[0][3], kv[0][1], kv[0][2])):
        sug, conf, note = old.get((comp, name, missing), ("", "", ""))
        rows.append([SPORT_HE.get(sp, sp), comp, name, n, missing, city, country, venue, sug, conf, "", "", "", note])
    out = CSV
    try:
        open(CSV, "a").close()
    except PermissionError:      # usually: the file is open in Excel
        out = CSV.replace(".csv", "_UPDATED.csv")
        print(f"{os.path.basename(CSV)} is locked (open in Excel?) - writing {os.path.basename(out)} instead")
    with open(out, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        w.writerows(rows)
    write_translations(data)
    by = {}
    for r in rows:
        by[r[4]] = by.get(r[4], 0) + 1
    print(f"{len(rows)} rows -> missing_info.csv")
    for k, v in by.items():
        print(f"  {v:4}  {k}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
