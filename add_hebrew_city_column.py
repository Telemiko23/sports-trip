#!/usr/bin/env python3
"""
add_hebrew_city_column.py - adds a "municipality_he" column to airports.csv, so the
"flight from" field can be searched in Hebrew without switching languages. Reuses this
project's own city dictionary (he_names.py) for cities we already track from fixtures,
and falls back to the same phonetic transliteration used everywhere else in the project
for every other city in the world.

Run this once after replacing airports.csv with a newer export, then run
build_airports.py to regenerate airports.js from the updated CSV.
"""
import csv
import os

from he_names import HE_CITIES, transliterate

HERE = os.path.dirname(os.path.abspath(__file__))

# HE_CITIES is keyed "City|Country" (e.g. "Munich|Germany") for our 7 tracked
# countries. Flatten it to "City" -> Hebrew, ignoring the country part, so it can
# also match the same city name appearing in the worldwide airports list.
CITY_ONLY = {}
for key, he in HE_CITIES.items():
    city = key.rsplit("|", 1)[0]
    CITY_ONLY.setdefault(city, he)

# major cities outside the 7 tracked countries that matter for a "flight from" field
# (Israeli departure points, common connecting hubs) but never show up in HE_CITIES
# because no fixture is played there.
CITY_ONLY.update({
    "Tel Aviv": "תל אביב", "Tel Aviv-Yafo": "תל אביב", "Jerusalem": "ירושלים",
    "Haifa": "חיפה", "Beer Sheva": "באר שבע", "Be'er Sheva": "באר שבע", "Eilat": "אילת",
    "Athens": "אתונה", "Istanbul": "איסטנבול", "Larnaca": "לרנקה", "Nicosia": "ניקוסיה",
    "New York": "ניו יורק", "Los Angeles": "לוס אנג'לס", "Chicago": "שיקגו",
    "Toronto": "טורונטו", "Moscow": "מוסקבה", "Dubai": "דובאי", "Abu Dhabi": "אבו דאבי",
    "Doha": "דוחה", "Cairo": "קהיר", "Amman": "עמאן", "Bangkok": "בנגקוק",
    "Tokyo": "טוקיו", "Beijing": "בייג'ינג", "Hong Kong": "הונג קונג",
    "Singapore": "סינגפור", "Sydney": "סידני", "Mumbai": "מומבאי", "Delhi": "דלהי",
    "Vienna": "וינה", "Zurich": "ציריך", "Geneva": "ז'נבה", "Prague": "פראג",
    "Budapest": "בודפשט", "Lisbon": "ליסבון", "Dublin": "דבלין", "Brussels": "בריסל",
    "Copenhagen": "קופנהגן", "Stockholm": "שטוקהולם", "Oslo": "אוסלו",
    "Helsinki": "הלסינקי", "Reykjavik": "רייקיאוויק", "Belgrade": "בלגרד",
    "Sofia": "סופיה", "Bucharest": "בוקרשט", "Kyiv": "קייב", "Tbilisi": "טביליסי",
})


def he_municipality(name):
    if not name:
        return ""
    return CITY_ONLY.get(name) or transliterate(name)


def main():
    src = os.path.join(HERE, "airports.csv")
    with open(src, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames)
        rows = list(reader)

    if "municipality_he" not in fieldnames:
        fieldnames.append("municipality_he")

    for row in rows:
        row["municipality_he"] = he_municipality(row.get("municipality", ""))

    with open(src, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Added municipality_he to {len(rows)} rows in airports.csv.")


if __name__ == "__main__":
    main()
