"""Regression test for the daily fixtures job (build_fixtures.py) - runs main() offline in a temp COPY with a fake API.

Why it exists: v1.9.0 pasted the national-team venue override into the wrong loops, so every scheduled CI run died with
`UnboundLocalError: cannot access local variable 'match_venue'` from 2026-09-30 until it was fixed. This test reproduces that
crash on the old code and proves (a) main() completes and (b) NATION_MATCH_VENUE lands in the national-team rows.
No network, no API key, nothing is written to the repository.
"""
import datetime
import importlib
import json
import os
import shutil
import sys
import tempfile
import unittest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SKIP = {".git", "node_modules", "logos", "comp_logos", "flags", "docs", "tests", "schedules", ".github", ".claude", "tickets", "tools", "__pycache__", ".browsers", "js"}


def fixture(fid, home, away, date, venue=None, city=None, hid=1, aid=2):
    return {"fixture": {"id": fid, "date": date + "T18:45:00+00:00", "status": {"short": "NS"}, "venue": {"name": venue, "city": city}},
            "teams": {"home": {"id": hid, "name": home, "logo": ""}, "away": {"id": aid, "name": away, "logo": ""}}, "league": {"round": "R1"}}


class BuildFixturesOffline(unittest.TestCase):
    def test_main_completes_and_national_venue_override_is_applied(self):
        tmp = tempfile.mkdtemp(prefix="tosport-build-")
        old_cwd, old_path, old_mods = os.getcwd(), list(sys.path), set(sys.modules)
        try:
            for name in os.listdir(ROOT):
                p = os.path.join(ROOT, name)
                if name not in SKIP and os.path.isfile(p):
                    shutil.copy(p, tmp)
            os.makedirs(os.path.join(tmp, "logos"))
            os.makedirs(os.path.join(tmp, "comp_logos"))
            sys.path.insert(0, tmp)
            os.chdir(tmp)
            os.environ["API_FOOTBALL_KEY"] = "fake-key-for-offline-test"
            B = importlib.import_module("build_fixtures")
            be = importlib.import_module("build_events")

            first_cid = B.COMPETITIONS[0][0] or 39
            nations_id = 77777
            nation_key = next(iter(B.NATION_MATCH_VENUE))
            nation_home, nation_date = nation_key.split("|")

            def fake_call(path, **params):
                if path == "fixtures":
                    if params.get("league") == first_cid:
                        return {"errors": [], "response": [fixture(1, "Arsenal", "Leeds", (datetime.date.today() + datetime.timedelta(days=3)).isoformat(), "Emirates Stadium", "London")]}
                    if params.get("league") == nations_id:
                        return {"errors": [], "response": [fixture(2, nation_home, "Somebody", nation_date, None, None, 10, 11)]}
                return {"errors": [], "response": []}

            B.call = fake_call
            B.resolve_id = lambda label, country: None
            B.resolve_uefa_id = lambda term, names: nations_id if term == B.NATIONAL_COMPETITIONS[0][0] else None
            B.geocode = lambda c, cc: ((51.5, -0.1), True)
            B.geocode_any = lambda c: ((51.5, -0.1), "gb", True)
            B.download_logos = lambda *a, **k: None
            B.download_comp_logos = lambda *a, **k: None
            B.save_json = lambda *a, **k: None
            be.download_flags = lambda *a, **k: None            # no network
            B.NATION_TEAMS = set(getattr(B, "NATION_TEAMS", set())) | {nation_home}

            B.main()
            raw = open(os.path.join(tmp, "fixtures.js"), encoding="utf-8").read()
            rows = {r["id"]: r for r in json.loads(raw[raw.index("{"):raw.rindex("}") + 1])["fixtures"]}
            self.assertEqual(rows[1]["venue"], "Emirates Stadium")
            want = B.NATION_MATCH_VENUE[nation_key]
            self.assertEqual((rows[2]["venue"], rows[2]["city"]), (want[0], want[1]))
        finally:
            os.chdir(old_cwd)
            sys.path[:] = old_path
            for m in set(sys.modules) - old_mods:
                sys.modules.pop(m, None)
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
