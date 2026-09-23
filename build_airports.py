#!/usr/bin/env python3
"""
build_airports.py - turns airports.csv (the OurAirports full-airport-database export:
https://ourairports.com/data/, with a municipality_he column added by
add_hebrew_city_column.py) into airports.js, the dataset the "flight from" field's
autocomplete reads.

Filter (only airports worth offering in a flight search):
  scheduled_service == "yes"  AND  iata_code is set  AND  type in
  {large_airport, medium_airport, small_airport}

Run add_hebrew_city_column.py first if airports.csv doesn't have municipality_he yet.
Re-run this whenever you replace airports.csv with a newer export. No network calls.
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# Hebrew names for the countries most relevant to this project; anything else falls
# back to its raw ISO country code so the list still works for every airport.
HE_COUNTRY_CODE = {
    "IL": "ישראל", "GB": "בריטניה", "ES": "ספרד", "DE": "גרמניה", "FR": "צרפת",
    "NL": "הולנד", "IT": "איטליה", "PL": "פולין", "PT": "פורטוגל", "IE": "אירלנד",
    "BE": "בלגיה", "CH": "שוויץ", "AT": "אוסטריה", "GR": "יוון", "TR": "טורקיה",
    "CY": "קפריסין", "CZ": "צ'כיה", "HU": "הונגריה", "RO": "רומניה", "BG": "בולגריה",
    "HR": "קרואטיה", "RS": "סרביה", "DK": "דנמרק", "SE": "שוודיה", "NO": "נורווגיה",
    "FI": "פינלנד", "IS": "איסלנד", "LU": "לוקסמבורג", "MT": "מלטה", "SI": "סלובניה",
    "SK": "סלובקיה", "US": "ארה\"ב", "CA": "קנדה", "AE": "איחוד האמירויות",
    "EG": "מצרים", "JO": "ירדן", "MA": "מרוקו", "GE": "גאורגיה", "AZ": "אזרבייג'ן",
    "UA": "אוקראינה", "RU": "רוסיה", "IN": "הודו", "CN": "סין", "JP": "יפן",
    "AU": "אוסטרליה", "BR": "ברזיל", "MX": "מקסיקו", "ZA": "דרום אפריקה",
    "TH": "תאילנד", "AL": "אלבניה", "ME": "מונטנגרו", "MK": "מקדוניה הצפונית",
    "EE": "אסטוניה", "LV": "לטביה", "LT": "ליטא", "MD": "מולדובה",
}

ALLOWED_TYPES = {"large_airport", "medium_airport", "small_airport"}


def label(row):
    country = HE_COUNTRY_CODE.get(row["iso_country"], row["iso_country"])
    city = row.get("municipality_he") or row["municipality"] or row["name"]
    return f'{row["name"]} – {city}, {country} ({row["iata_code"]})'


def search_key(row):
    # everything a viewer might type, English or Hebrew, lowercased once here so the
    # page doesn't have to lowercase 4000 strings on every keystroke
    parts = [row["name"], row["municipality"], row.get("municipality_he", ""), row["iata_code"], row["iso_country"]]
    return " ".join(p for p in parts if p).lower()


def city_group_label(city_en, city_he, country_he, n):
    return f'כל שדות התעופה – {city_he}, {country_he} ({n})'


def main():
    src = os.path.join(HERE, "airports.csv")
    if not os.path.exists(src):
        print("airports.csv not found - place an OurAirports export next to this script first.")
        return

    rows = {}
    with open(src, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row["scheduled_service"] != "yes":
                continue
            if not row["iata_code"]:
                continue
            if row["type"] not in ALLOWED_TYPES:
                continue
            rows[row["iata_code"]] = row  # de-dup by IATA code

    entries = [{"l": label(r), "c": r["iata_code"], "s": search_key(r)} for r in rows.values()]

    # cities with 2+ airports in the list get one extra "all airports in <city>" entry,
    # so picking a metro area doesn't require knowing which specific airport to use -
    # its value is the plain city name, which Google Flights already resolves across
    # every airport that serves it.
    by_city = {}
    for r in rows.values():
        key = (r["municipality"], r["iso_country"])
        if key[0]:
            by_city.setdefault(key, []).append(r)
    multi = {k: v for k, v in by_city.items() if len(v) >= 2}
    for (city_en, iso), members in multi.items():
        city_he = members[0].get("municipality_he") or city_en
        country_he = HE_COUNTRY_CODE.get(iso, iso)
        entries.append({
            "l": city_group_label(city_en, city_he, country_he, len(members)),
            "c": city_en,
            "s": f"{city_en} {city_he} {country_he}".lower(),
            "grp": True,
        })

    entries.sort(key=lambda e: (0 if e.get("grp") else 1, e["l"]))

    out = os.path.join(HERE, "airports.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("window.AIRPORTS_DATA = " + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n")

    print(f"Wrote airports.js: {len(entries)} entries ({len(multi)} multi-airport cities grouped).")


if __name__ == "__main__":
    main()
