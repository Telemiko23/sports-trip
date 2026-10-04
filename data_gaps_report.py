"""data_gaps_report.py - ONE file with everything missing or uncertain in the current fixtures.js.

    py data_gaps_report.py        ->  data_gaps.csv   (UTF-8 with BOM, opens in Excel)

Sections (column "סוג"):
  אצטדיון / סיכה   a match or event with no stadium, or a stadium without an exact pin   (from missing_info_report.py's logic)
  תרגום            a team/city name that has no reviewed Hebrew entry (the site shows an automatic transliteration)
  קואורדינטות      a stadium pin far from its city point - either a real out-of-centre venue or a wrong city point

Columns "ההצעה שלי" / "רמת ביטחון" come from data_gaps_suggestions.json (empty = I did not guess).
"תיקון שלך" and "הערה שלך" are carried over from the previous data_gaps.csv when the same row is still open,
so filled-in answers are never lost. No network, no API quota. Run missing_info_report.py first (it refreshes the two source CSVs).
"""
import csv
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data_gaps.csv")
HEADER = ["סוג", "פריט", "הקשר (תחרות/מדינה)", "מה חסר או לא בטוח", "ערך נוכחי", "ההצעה שלי", "רמת ביטחון בהצעה", "הערה שלי", "תיקון שלך", "הערה שלך"]


def read_csv(name):
    path = os.path.join(HERE, name)
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def km(a, b):
    r = math.pi / 180
    x = math.sin((b[0] - a[0]) * r / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin((b[1] - a[1]) * r / 2) ** 2
    return 12742 * math.asin(math.sqrt(x))


def main(limit=20.0):
    sys.stdout.reconfigure(encoding="utf-8")
    sug = json.load(open(os.path.join(HERE, "data_gaps_suggestions.json"), encoding="utf-8"))
    prev = {(r["סוג"], r["פריט"]): r for r in read_csv("data_gaps.csv")}
    rows = []

    def add(kind, item, ctx, what, current="", key=None, note=""):
        s = sug.get(key or f"{kind}|{item}", {})
        old = prev.get((kind, item), {})
        rows.append([kind, item, ctx, what, current, s.get("s", ""), s.get("c", ""), s.get("n", "") or note, old.get("תיקון שלך", ""), old.get("הערה שלך", "")])

    for r in read_csv("missing_info.csv"):
        what = r["מה חסר"]
        kind = "סיכה" if "סיכה" in what else "אצטדיון"
        add(kind, r["קבוצה/אירוע"], f'{r["ענף"]} · {r["תחרות"]} · {r["מדינה"]}', what, r["אצטדיון נוכחי"] or r["עיר נוכחית"], key=f'אצטדיון|{r["קבוצה/אירוע"]}',
            note=(r["ההצעה שלי"] and f'הצעה קיימת: {r["ההצעה שלי"]} ({r["רמת ביטחון בהצעה"]}) {r["הערה"]}'.strip()) or r["הערה"])
    for r in read_csv("missing_translations.csv"):
        add("תרגום", r["השם המדויק ב-API (המפתח)"], f'{r["סוג"]} · {r["איפה מופיע"]}', "אין תרגום בדוק לעברית (מוצג תעתיק אוטומטי)", r["העברית האוטומטית כרגע"],
            key=f'תרגום|{r["השם המדויק ב-API (המפתח)"]}')

    raw = open(os.path.join(HERE, "fixtures.js"), encoding="utf-8").read()
    data = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    seen = {}
    for f in data["fixtures"]:
        if f.get("venue_lat") is None or f.get("lat") is None:
            continue
        key = (f["city"], f["venue"], f["country"])
        if key not in seen:
            seen[key] = (km([f["lat"], f["lng"]], [f["venue_lat"], f["venue_lng"]]), f.get("home") or f.get("title"), f["lat"], f["lng"])
    for (city, venue, country), (d, who, la, lo) in sorted(seen.items(), key=lambda kv: -kv[1][0]):
        if d > limit:
            item = f"{city} ({country})"
            add("קואורדינטות", item, f"{venue} · {who}", f"סיכת האצטדיון רחוקה {d:.1f} ק\"מ מנקודת העיר", f"נקודת העיר: {la},{lo}",
                note="" if f"קואורדינטות|{item}" in sug else "נראה תקין: מתקן ספורט מחוץ למרכז העיר (לא אומת מול מקור)")

    order = {"סיכה": 0, "אצטדיון": 1, "קואורדינטות": 2, "תרגום": 3}
    rows.sort(key=lambda r: (order[r[0]], r[1]))
    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        w.writerows(rows)
    by = {}
    for r in rows:
        by[r[0]] = by.get(r[0], 0) + 1
    print(f"{len(rows)} rows -> data_gaps.csv  " + ", ".join(f"{k}: {v}" for k, v in by.items()))
    print("with a suggestion: %d (empty = no guess)" % sum(1 for r in rows if r[5]))


if __name__ == "__main__":
    main()
