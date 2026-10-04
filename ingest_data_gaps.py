"""ingest_data_gaps.py - applies the owner's filled-in data_gaps.csv EXACTLY as written (no guessing, no "fixing" of spellings).

    py ingest_data_gaps.py            # apply
    py ingest_data_gaps.py --dry-run  # show what would change

Owner columns: אצטדיון שלך | סיכה שלך לאצטדיון | שם עיר שלך | שם קבוצה שלך   (empty cell = nothing to apply).
Targets:
  team name   -> he_names.HE_TEAMS[<exact API team name>]
  city name   -> he_names.HE_CITIES["<API city>|<our country>"]
  stadium     -> overrides.VENUE_OVERRIDE[<API home team name>]            (only when the owner gave a stadium)
  pin         -> venues_cache.json["<venue>|<API city>"] = [lat, lng]
Dictionaries are edited IN PLACE with the AST (existing key -> value replaced; new key -> inserted), then the file is re-parsed and
checked for duplicate keys - the failure mode of v1.9.0. After applying, run:  py backfill_hebrew.py
"""
import ast
import csv
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")


def load_fixtures():
    raw = open(os.path.join(HERE, "fixtures.js"), encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex("}") + 1])["fixtures"]


def lit(s):
    return json.dumps(s, ensure_ascii=False)


def edit_dict(path, var, updates):
    """updates: {key(str): value(str)}. Returns (replaced, inserted) key lists. Edits the source text in place."""
    src = open(path, encoding="utf-8").read()
    tree = ast.parse(src)
    node = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == var for t in n.targets)).value
    assert isinstance(node, ast.Dict)
    keys = [k.value for k in node.keys if isinstance(k, ast.Constant)]
    assert len(keys) == len(set(keys)), f"{var} already has duplicate keys"
    lines = src.split("\n")
    blines = [l.encode("utf-8") for l in lines]
    existing = {k.value: v for k, v in zip(node.keys, node.values) if isinstance(k, ast.Constant)}
    replaced, inserted = [], []
    edits = []                                                           # (lineno, col, end_lineno, end_col, newtext) - applied bottom-up
    for key, val in updates.items():
        if key in existing:
            v = existing[key]
            if isinstance(v, ast.Constant) and v.value == val:
                continue
            edits.append((v.lineno, v.col_offset, v.end_lineno, v.end_col_offset, lit(val)))
            replaced.append(key)
        else:
            inserted.append(key)
    for lineno, col, end_lineno, end_col, new in sorted(edits, reverse=True):
        assert lineno == end_lineno, "multi-line value - edit by hand"
        b = blines[lineno - 1]
        blines[lineno - 1] = b[:col] + new.encode("utf-8") + b[end_col:]
    if inserted:
        close = node.end_lineno - 1                                       # the line holding the closing brace
        text = [(f"    {lit(k)}: {lit(updates[k])},").encode("utf-8") for k in inserted]
        blines[close:close] = text
    new_src = b"\n".join(blines).decode("utf-8")
    ast2 = ast.parse(new_src)                                              # still valid Python?
    n2 = next(n for n in ast2.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == var for t in n.targets)).value
    k2 = [k.value for k in n2.keys if isinstance(k, ast.Constant)]
    assert len(k2) == len(set(k2)), f"{var}: duplicate key introduced"
    got = {k.value: v.value for k, v in zip(n2.keys, n2.values) if isinstance(k, ast.Constant) and isinstance(v, ast.Constant)}
    for k, v in updates.items():
        assert got.get(k) == v, f"{var}[{k!r}] not applied"
    return new_src, replaced, inserted


def main():
    dry = "--dry-run" in sys.argv
    rows = list(csv.DictReader(open(os.path.join(HERE, "data_gaps.csv"), encoding="utf-8-sig", newline="")))
    fx = load_fixtures()
    teams, cities, venue_over, pins = {}, {}, {}, {}
    problems = []

    def first_fixture(hebrew):
        return next((f for f in fx if f.get("home_he") == hebrew), None) or next((f for f in fx if f.get("away_he") == hebrew), None)

    def latlng(s):
        m = re.match(r"^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", s or "")
        return [float(m.group(1)), float(m.group(2))] if m else None

    for r in rows:
        kind, item = r["סוג"], r["פריט"]
        stad, pin, city_he, team_he = (r.get("אצטדיון שלך") or "").strip(), (r.get("סיכה שלך לאצטדיון") or "").strip(), (r.get("שם עיר שלך") or "").strip(), (r.get("שם קבוצה שלך") or "").strip()
        if not (stad or pin or city_he or team_he):
            continue
        if kind == "תרגום":
            if team_he:
                teams[item] = team_he
            if city_he:
                cities[item] = city_he                                  # item is already "<API city>|<country>"
        elif kind in ("סיכה", "אצטדיון"):
            f = next((f for f in fx if f.get("home_he") == item), None) or first_fixture(item)
            if not f:
                problems.append(f"{kind} {item}: no fixture found"); continue
            home_api = f["home"] if f.get("home_he") == item else f["away"]
            home_fx = next((g for g in fx if g.get("home") == home_api), f)
            city_api, country = home_fx["city"], home_fx["country"]
            venue = stad or home_fx.get("venue")
            if stad:
                venue_over = venue_over  # noqa
                venue_over[home_api] = stad
            if team_he:
                teams[home_api] = team_he
            if city_he:
                cities[f"{city_api}|{country}"] = city_he
            if pin:
                ll = latlng(pin)
                if not ll or not venue:
                    problems.append(f"{kind} {item}: bad pin or no venue ({pin!r})"); continue
                pins[f"{venue}|{city_api}"] = ll
        elif kind == "קואורדינטות":
            ll = latlng(pin)
            ctx_venue = r["הקשר (תחרות/מדינה)"].split(" · ")[0]
            city_api = item.split(" (")[0]
            if not ll:
                problems.append(f"{kind} {item}: bad pin {pin!r}"); continue
            pins[f"{ctx_venue}|{city_api}"] = ll

    he_path, ov_path, vc_path = (os.path.join(HERE, n) for n in ("he_names.py", "overrides.py", "venues_cache.json"))
    out = {}
    for path, var, upd in ((he_path, "HE_TEAMS", teams), (he_path, "HE_CITIES", cities)):
        src, rep, ins = edit_dict(path, var, upd)
        out[(path, var)] = (src, rep, ins)
        if not dry:
            open(path, "w", encoding="utf-8", newline="").write(src)
        print(f"{var}: {len(rep)} replaced, {len(ins)} inserted")
    if venue_over:
        src, rep, ins = edit_dict(ov_path, "VENUE_OVERRIDE", venue_over)
        if not dry:
            open(ov_path, "w", encoding="utf-8", newline="").write(src)
        print(f"VENUE_OVERRIDE: {len(rep)} replaced, {len(ins)} inserted")
    vc = json.load(open(vc_path, encoding="utf-8"))
    changed = {k: (vc.get(k), v) for k, v in pins.items() if vc.get(k) != v}
    vc.update(pins)
    if not dry:
        json.dump(vc, open(vc_path, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print(f"venues_cache.json: {len(changed)} pins set/changed")
    for k, (old, new) in changed.items():
        print(f"   {k}: {old} -> {new}")
    for p in problems:
        print("PROBLEM:", p)
    print("DRY RUN - nothing written" if dry else "applied. Next: py backfill_hebrew.py")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
