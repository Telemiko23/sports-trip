"""Matching, adapter and snapshot tests for the ticket enrichment. Run:  py -m unittest discover -s tests/py -v

Everything here is synthetic. A passing run proves the matching rules, failure handling and the allowlist - it is NOT evidence
of a live provider integration (no authenticated call has been made; see TICKETS.md).
"""
import json
import os
import sys
import tempfile
import unittest
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "tickets"))

import adapter as A   # noqa: E402
import build_offers as B   # noqa: E402
import matching as MT   # noqa: E402
from matching import Candidate, Occurrence   # noqa: E402


def occ(**kw):
    base = dict(id=102, sport="football", date="2026-10-10", home="Arsenal", away="Leeds", comp="Premier League", city="London", venue="Emirates Stadium", time="12:30")
    base.update(kw)
    return Occurrence(**base)


def cand(**kw):
    base = dict(external_id="E1", sport="football", date="2026-10-10", home="Arsenal FC", away="Leeds United", comp="Premier League", city="London", venue="Emirates Stadium", time="12:30",
                url="https://www.sportsevents365.com/e/1", min_price=61.5, currency="EUR", fetched_at="2026-10-02T10:00:00Z", quantity_basis="per-ticket", fees_included=True, scope="occurrence")
    base.update(kw)
    return Candidate(**base)


class Matching(unittest.TestCase):
    def test_exact_with_accents_aliases_and_club_noise(self):
        r = MT.match_occurrence(occ(home="Atlético Madrid", away="Man United"), [cand(home="Atletico de Madrid".replace("de ", ""), away="Manchester United FC")])
        self.assertEqual(r.status, "exact")

    def test_exact_basic(self):
        self.assertEqual(MT.match_occurrence(occ(), [cand()]).status, "exact")

    def test_a_short_shared_name_is_not_completed_by_a_suffix(self):
        self.assertNotEqual(MT.match_occurrence(occ(home="Manchester", away="Leeds"), [cand(home="Manchester City", away="Leeds United")]).status, "exact")

    def test_never_title_similarity_alone(self):
        r = MT.match_occurrence(occ(), [cand(home="Arsenal Women", away="Leeds United Women")])
        self.assertNotIn(r.status, ("exact", "reviewed"))          # women's squad is a different event

    def test_youth_and_reserve_never_cross(self):
        self.assertNotEqual(MT.match_occurrence(occ(), [cand(home="Arsenal U21", away="Leeds United U21")]).status, "exact")
        self.assertNotEqual(MT.match_occurrence(occ(), [cand(home="Arsenal II", away="Leeds United")]).status, "exact")

    def test_reversed_orientation_is_not_exact_unless_neutral(self):
        self.assertEqual(MT.match_occurrence(occ(), [cand(home="Leeds United", away="Arsenal")]).status, "ambiguous")
        self.assertEqual(MT.match_occurrence(occ(neutral=True), [cand(home="Leeds United", away="Arsenal")]).status, "exact")

    def test_postponed_date_goes_to_review_not_to_a_price(self):
        r = MT.match_occurrence(occ(), [cand(date="2026-10-17")])
        self.assertEqual(r.status, "ambiguous"); self.assertIn("date-differs", r.reasons)

    def test_repeated_fixture_two_candidates_is_ambiguous(self):
        r = MT.match_occurrence(occ(), [cand(external_id="E1"), cand(external_id="E2")])
        self.assertEqual(r.status, "ambiguous"); self.assertEqual(len(r.alternatives), 2)

    def test_same_teams_in_another_competition_is_not_exact(self):
        self.assertEqual(MT.match_occurrence(occ(), [cand(comp="League Cup")]).status, "ambiguous")

    def test_sponsor_named_venue_alone_does_not_block_when_city_agrees(self):
        self.assertEqual(MT.match_occurrence(occ(venue="Emirates Stadium"), [cand(venue="Ashburton Grove")]).status, "exact")

    def test_wrong_city_and_venue_blocks(self):
        self.assertNotEqual(MT.match_occurrence(occ(), [cand(city="Manchester", venue="Etihad")]).status, "exact")

    def test_time_far_apart_is_not_exact(self):
        self.assertNotEqual(MT.match_occurrence(occ(), [cand(time="20:00")]).status, "exact")

    def test_non_football_never_auto_published(self):
        o = occ(id=9101, sport="tennis", home="", away="", title="Sample Indoors - Day 1", comp="ATP Tour")
        r = MT.match_occurrence(o, [cand(sport="tennis", home="", away="", name="Sample Indoors")])
        self.assertNotIn(r.status, ("exact", "reviewed"))

    def test_reviewed_mapping_wins_and_carries_its_scope(self):
        o = occ(id=9101, sport="tennis", home="", away="", title="Sample Indoors - Day 1")
        r = MT.match_occurrence(o, [cand(external_id="T1", sport="tennis", home="", away="")], {"reviewed": {"9101": {"external_id": "T1", "scope": "parent-event"}}})
        self.assertEqual((r.status, r.scope), ("reviewed", "parent-event"))

    def test_mapping_that_disagrees_with_the_schedule_is_quarantined(self):
        r = MT.match_occurrence(occ(), [cand(external_id="E1", date="2026-10-24")], {"reviewed": {"102": {"external_id": "E1"}}})
        self.assertEqual(r.status, "conflict")

    def test_mapping_not_deleted_when_the_feed_omits_the_event(self):
        r = MT.match_occurrence(occ(), [], {"reviewed": {"102": {"external_id": "E1"}}})
        self.assertEqual(r.status, "conflict"); self.assertIn("mapped-event-missing-from-feed", r.reasons)

    def test_rejected_pair_is_never_matched_again(self):
        self.assertEqual(MT.match_occurrence(occ(), [cand()], {"rejected": {"102": ["E1"]}}).status, "none")


class FakeHttp:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request, timeout=30):
        self.requests.append(request)
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def ok(body):
    return 200, {}, json.dumps(body).encode("utf-8")


CFG = {"base_url": "https://api.example.invalid", "events_path": "/events", "credentials_env": {"user": "U", "password": "P", "api_key": "K"},
       "field_map": {"items": "events", "id": "id", "start": "date", "home": "home", "away": "away", "url": "eventUrl"}, "page_size": 2, "price_basis": {"quantity_basis": "per-ticket", "fees_included": True, "scope": "occurrence"}}
ENV = {"U": "user", "P": "pw-secret-value", "K": "key-secret-value"}


def provider(http, **kw):
    return A.SportsEvents365(dict(CFG, **kw), env=ENV, opener=http, sleep=lambda s: None)


class Adapter(unittest.TestCase):
    def test_missing_credentials_report_names_only(self):
        with self.assertRaises(A.NotConfigured) as cm:
            A.SportsEvents365(CFG, env={})
        msg = str(cm.exception)
        self.assertIn("U", cm.exception.missing); self.assertNotIn("secret", msg)

    def test_placeholder_config_is_not_configured(self):
        with self.assertRaises(A.NotConfigured):
            A.SportsEvents365(dict(CFG, base_url="https://REPLACE-ME"), env=ENV)

    def test_basic_auth_from_env_and_pagination_all_or_nothing(self):
        http = FakeHttp(ok({"events": [{"id": 1, "eventUrl": "https://x"}, {"id": 2}]}), ok({"events": [{"id": 3}]}))
        out = provider(http).fetch_events({"from": "2026-10-01", "to": "2026-10-31"})
        self.assertEqual([c.external_id for c in out], ["1", "2", "3"])
        self.assertTrue(http.requests[0].headers["Authorization"].startswith("Basic "))

    def test_429_is_retried_with_backoff_then_succeeds(self):
        http = FakeHttp((429, {"Retry-After": "1"}, b""), ok({"events": []}))
        self.assertEqual(provider(http).fetch_events({"from": "a", "to": "b"}), [])
        self.assertEqual(len(http.requests), 2)

    def test_auth_failure_is_never_retried_and_never_looks_like_empty_inventory(self):
        http = FakeHttp((401, {}, b""))
        with self.assertRaises(A.ProviderError) as cm:
            provider(http).fetch_events({"from": "a", "to": "b"})
        self.assertEqual(cm.exception.kind, "auth"); self.assertEqual(len(http.requests), 1)

    def test_rate_limit_exhaustion_is_reported_as_such(self):
        http = FakeHttp(*[(429, {}, b"")] * 4)
        with self.assertRaises(A.ProviderError) as cm:
            provider(http).fetch_events({"from": "a", "to": "b"})
        self.assertEqual(cm.exception.kind, "rate_limit")

    def test_network_errors_are_transient_and_a_mid_pagination_failure_aborts_everything(self):
        http = FakeHttp(ok({"events": [{"id": 1}, {"id": 2}]}), urllib.error.URLError("down"), urllib.error.URLError("down"), urllib.error.URLError("down"), urllib.error.URLError("down"))
        with self.assertRaises(A.ProviderError) as cm:
            provider(http).fetch_events({"from": "a", "to": "b"})
        self.assertEqual(cm.exception.kind, "transient")

    def test_schema_drift_is_an_error_not_an_empty_list(self):
        with self.assertRaises(A.ProviderError) as cm:
            provider(FakeHttp(ok({"unexpected": True}))).fetch_events({"from": "a", "to": "b"})
        self.assertEqual(cm.exception.kind, "schema")

    def test_error_messages_never_contain_secrets_or_urls(self):
        http = FakeHttp((403, {}, b"nope"))
        try:
            provider(http).fetch_events({"from": "a", "to": "b"})
        except A.ProviderError as e:
            text = str(e)
            self.assertNotIn("secret", text); self.assertNotIn("example.invalid", text)


class Snapshot(unittest.TestCase):
    CONF = {"allowed_hosts": ["sportsevents365.com"], "ttl_minutes": 60, "activation": {"price_display_verified": False}}

    def run_build(self, cands, conf=None, mock=False, occs=None, mappings=None):
        path = tempfile.mktemp(suffix=".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump([c.__dict__ for c in cands], f, default=str)
        try:
            return B.build(conf or self.CONF, A.FixtureProvider(path), occs or [occ()], mappings or {}, {}, {"from": "a", "to": "b"}, mock=mock)
        finally:
            os.unlink(path)

    def test_prices_are_stripped_until_activation_is_verified(self):
        snap, _ = self.run_build([cand()])
        self.assertFalse(snap["priceDisplay"])
        o = snap["offers"]["102"]
        self.assertEqual(o["status"], "link-only"); self.assertNotIn("amount", o)

    def test_prices_published_only_with_full_basis_after_activation_and_never_from_a_mock(self):
        conf = dict(self.CONF, activation={"price_display_verified": True})
        snap, _ = self.run_build([cand()], conf)
        self.assertEqual(snap["offers"]["102"]["status"], "priced"); self.assertEqual(snap["offers"]["102"]["amount"], 61.5)
        mocked, _ = self.run_build([cand()], conf, mock=True)
        self.assertFalse(mocked["priceDisplay"]); self.assertNotIn("amount", mocked["offers"]["102"])
        unknown_fees, _ = self.run_build([cand(fees_included=None)], conf)
        self.assertEqual(unknown_fees["offers"]["102"]["status"], "link-only")
        wrong_scope, _ = self.run_build([cand(scope="parent-event")], conf)
        self.assertIn(wrong_scope["offers"]["102"]["status"], ("priced", "link-only"))

    def test_explicit_zero_availability_is_no_offers_not_an_absence(self):
        snap, _ = self.run_build([cand(available_categories=0)])
        self.assertEqual(snap["offers"]["102"]["status"], "no-offers")

    def test_unsafe_event_links_are_not_published(self):
        snap, review = self.run_build([cand(url="https://evil.example/x")])
        self.assertEqual(snap["offers"], {}); self.assertEqual(review["summary"]["unsafe-link"], 1)
        snap2, _ = self.run_build([cand(url="http://www.sportsevents365.com/e/1")])
        self.assertEqual(snap2["offers"], {})

    def test_ambiguous_and_conflicts_go_to_the_review_report_only(self):
        snap, review = self.run_build([cand(external_id="E1"), cand(external_id="E2")])
        self.assertEqual(snap["offers"], {})
        self.assertEqual(review["items"][0]["status"], "ambiguous")

    def test_validator_rejects_anything_outside_the_allowlist(self):
        good = {"schema": 1, "provider": "p", "generatedAt": "x", "ttlMinutes": 60, "priceDisplay": False, "offers": {}}
        self.assertTrue(B.validate_snapshot(good))
        for bad in (dict(good, extra=1), dict(good, priceDisplay="yes"), dict(good, ttlMinutes=0), dict(good, ttlMinutes=99999),
                    dict(good, offers={"1": {"match": "exact", "status": "link-only", "scope": "occurrence", "fetchedAt": "x", "url": "https://a", "apiKey": "k"}}),
                    dict(good, offers={"1": {"match": "fuzzy", "status": "link-only", "scope": "occurrence", "fetchedAt": "x", "url": "https://a"}}),
                    dict(good, offers={"1": {"match": "exact", "status": "priced", "scope": "occurrence", "amount": 5, "currency": "EUR", "quantityBasis": "per-ticket", "feesIncluded": True, "fetchedAt": "x", "url": "https://a"}}),
                    dict(good, priceDisplay=True, offers={"1": {"match": "exact", "status": "priced", "scope": "occurrence", "amount": 5, "currency": "EUR", "fetchedAt": "x", "url": "https://a"}}),
                    dict(good, offers={"1": {"match": "exact", "status": "link-only", "scope": "occurrence", "fetchedAt": "x", "url": "https://a/?token=abc"}})):
            with self.assertRaises(ValueError):
                B.validate_snapshot(bad)

    def test_atomic_write_keeps_the_previous_file_when_replacing_fails(self):
        from unittest import mock
        d = tempfile.mkdtemp()
        p = os.path.join(d, "offers.json")
        B.atomic_write(p, "old")
        with mock.patch("os.replace", side_effect=OSError("disk")):
            with self.assertRaises(OSError):
                B.atomic_write(p, "new")
        self.assertEqual(open(p, encoding="utf-8").read(), "old")
        self.assertEqual([f for f in os.listdir(d) if f.endswith(".tmp")], [])

    def test_main_without_config_or_credentials_changes_nothing(self):
        d = tempfile.mkdtemp()
        out = os.path.join(d, "offers.json")
        self.assertEqual(B.main(["--config", os.path.join(d, "none.json"), "--out", out, "--review-dir", d]), 0)
        self.assertFalse(os.path.exists(out))
        cfg = os.path.join(d, "config.json")
        json.dump(CFG, open(cfg, "w"))
        for k in ("U", "P", "K"):
            os.environ.pop(k, None)
        self.assertEqual(B.main(["--config", cfg, "--out", out, "--review-dir", d]), 0)
        self.assertFalse(os.path.exists(out))

    def test_mock_provider_cannot_write_the_public_path(self):
        self.assertEqual(B.main(["--fixture-candidates", os.path.join(HERE, "none.json"), "--config", os.path.join(HERE, "x.json")]), 2)


if __name__ == "__main__":
    unittest.main()
