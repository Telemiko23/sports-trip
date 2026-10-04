"""Build tickets/offers.json - the public-safe, ALLOWLISTED derived snapshot the static site reads lazily.

    py tickets/build_offers.py [--config tickets/config.json] [--out tickets/offers.json] [--review-dir tickets/_review]
                               [--fixture-candidates path.json --mock]   (tests/previews only)

Behaviour that matters (documented in TICKETS.md):
  * No credentials / no config  -> prints which variable NAMES are missing and exits 0 WITHOUT touching offers.json. Live pricing stays OFF.
  * Provider failure (auth / rate limit / transient / schema) -> exit code 3, the previous offers.json is left exactly as it was
    (the page expires old quotes by itself); a failure is never written as "no inventory".
  * All pages are fetched and matched first; the file is validated and then replaced atomically (never half-written).
  * Numeric prices are written only when config.activation.price_display_verified is true; otherwise amounts are omitted and
    offers are link-only. Mock providers can never write the public path.
  * Ambiguous / conflicting / unmatched candidates go to the INTERNAL review report (gitignored), not to the public file.
"""
import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from adapter import FixtureProvider, NotConfigured, ProviderError, SportsEvents365, now_iso   # noqa: E402
from matching import Occurrence, match_occurrence   # noqa: E402

SCHEMA = 1
OFFER_KEYS = {"match", "status", "scope", "amount", "currency", "quantityBasis", "feesIncluded", "fetchedAt", "expiresAt", "url", "externalId"}
TOP_KEYS = {"schema", "provider", "generatedAt", "ttlMinutes", "priceDisplay", "offers"}
STATUSES = {"priced", "link-only", "no-offers"}
MATCHES = {"exact", "reviewed"}
SCOPES = {"occurrence", "parent-event", "session", "pass"}
MAX_OFFERS = 20000
FORBIDDEN_FRAGMENTS = ("password", "secret", "apikey", "api_key", "token", "authorization")


def host_allowed(url, allowed):
    try:
        p = urlparse(url)
    except ValueError:
        return False
    host = (p.hostname or "").lower()
    return p.scheme == "https" and not p.username and any(host == h or host.endswith("." + h) for h in allowed)


def validate_snapshot(doc):
    """Raises ValueError on anything the page must never receive. Used before every publish and by the tests."""
    if not isinstance(doc, dict) or set(doc) - TOP_KEYS or doc.get("schema") != SCHEMA:
        raise ValueError("bad top level")
    if not isinstance(doc.get("offers"), dict) or len(doc["offers"]) > MAX_OFFERS:
        raise ValueError("bad offers")
    if not isinstance(doc.get("priceDisplay"), bool):
        raise ValueError("priceDisplay must be a boolean")
    ttl = doc.get("ttlMinutes")
    if not isinstance(ttl, (int, float)) or not 0 < ttl <= 1440:
        raise ValueError("ttlMinutes out of range")
    blob = json.dumps(doc).lower()
    if any(f in blob for f in FORBIDDEN_FRAGMENTS):
        raise ValueError("snapshot contains a credential-looking field")
    for oid, o in doc["offers"].items():
        if not str(oid).isdigit() or not isinstance(o, dict) or set(o) - OFFER_KEYS:
            raise ValueError(f"bad offer {oid}")
        if o.get("match") not in MATCHES or o.get("status") not in STATUSES or o.get("scope") not in SCOPES:
            raise ValueError(f"bad offer enum {oid}")
        if o["status"] == "priced":
            if not doc["priceDisplay"]:
                raise ValueError("priced offer while priceDisplay is off")
            if not (isinstance(o.get("amount"), (int, float)) and o["amount"] > 0) or not o.get("currency") or o.get("quantityBasis") != "per-ticket" or o.get("feesIncluded") not in (True, False):
                raise ValueError(f"priced offer {oid} lacks a complete price basis")
        elif "amount" in o:
            raise ValueError("amount on a non-priced offer")
        if not o.get("fetchedAt") or not str(o.get("url", "")).startswith("https://"):
            raise ValueError(f"offer {oid} lacks fetchedAt/https url")
    return True


def load_fixtures(path):
    raw = open(path, encoding="utf-8").read()
    return json.loads(raw[raw.index("{"):raw.rindex("}") + 1])


def occurrences(data):
    """Same occurrence ids as the site (multi-day events -> eventId*100+n)."""
    out = []
    for r in data.get("fixtures", []):
        if not r.get("dt") or r.get("id") is None:
            continue
        sport = {"": "football", None: "football", "tennis": "tennis", "darts": "darts", "f1": "f1"}.get(r.get("sport"), r.get("sport") or "football")
        s, e = str(r["dt"])[:10], r.get("date_to") or str(r["dt"])[:10]
        if sport == "football":
            time = str(r["dt"])[11:16] if r.get("status") != "TBD" and len(str(r["dt"])) >= 16 else ""
            out.append(Occurrence(id=r["id"], sport=sport, date=s, home=r.get("home") or "", away=r.get("away") or "", title=r.get("title") or "", comp=r.get("comp") or "",
                                  city=r.get("city") or "", venue=r.get("venue") or "", time=time))
        else:
            from datetime import date, timedelta
            d0, d1 = date.fromisoformat(s), date.fromisoformat(e)
            multi = d1 > d0
            n, d = 0, d0
            while d <= d1 and n < 60:
                n += 1
                out.append(Occurrence(id=r["id"] * 100 + n if multi else r["id"], sport=sport, date=d.isoformat(), title=r.get("title") or "", comp=r.get("comp") or "",
                                      city=r.get("city") or "", venue=r.get("venue") or "", parent_id=r["id"] if multi else 0))
                d += timedelta(days=1)
    return out


def build(config, provider, occs, mappings, aliases, window, clock=None, mock=False):
    """-> (snapshot dict, review dict). Pure given its inputs (provider does the I/O)."""
    cands = provider.fetch_events(window)
    activation = config.get("activation", {})
    price_ok = bool(activation.get("price_display_verified")) and not mock
    allowed = config.get("allowed_hosts", [])
    ttl = config.get("ttl_minutes", 60)
    offers, review = {}, {"generatedAt": now_iso(clock), "provider": provider.id, "candidates": len(cands), "summary": {}, "items": []}
    counts = {"exact": 0, "reviewed": 0, "ambiguous": 0, "none": 0, "conflict": 0, "published": 0, "priced": 0, "link-only": 0, "no-offers": 0, "unsafe-link": 0}
    for occ in occs:
        res = match_occurrence(occ, cands, mappings, aliases)
        counts[res.status] = counts.get(res.status, 0) + 1
        if res.status not in ("exact", "reviewed"):
            if res.status in ("ambiguous", "conflict"):
                review["items"].append({"occurrence": occ.id, "title": occ.title or f"{occ.home} - {occ.away}", "date": occ.date, "status": res.status, "reasons": res.reasons,
                                        "candidates": [{"id": c.external_id, "name": c.name or f"{c.home} - {c.away}", "date": c.date} for c in ([res.candidate] if res.candidate else res.alternatives)]})
            continue
        c = res.candidate
        if not host_allowed(c.url, allowed):
            counts["unsafe-link"] += 1
            review["items"].append({"occurrence": occ.id, "status": "unsafe-link", "reasons": ["event url missing or host not in allowed_hosts"], "candidates": [{"id": c.external_id}]})
            continue
        offer = {"match": res.status, "scope": res.scope, "fetchedAt": c.fetched_at, "url": c.url, "externalId": c.external_id}
        explicit_zero = c.available_categories == 0
        if explicit_zero:
            offer["status"] = "no-offers"
        elif price_ok and c.min_price and c.currency and res.scope == "occurrence" and c.quantity_basis == "per-ticket" and c.fees_included in (True, False):
            offer.update({"status": "priced", "amount": round(c.min_price, 2), "currency": c.currency, "quantityBasis": "per-ticket", "feesIncluded": c.fees_included})
        else:
            offer["status"] = "link-only"
        counts[offer["status"]] += 1
        counts["published"] += 1
        offers[str(occ.id)] = offer
    review["summary"] = counts
    snap = {"schema": SCHEMA, "provider": provider.id, "generatedAt": now_iso(clock), "ttlMinutes": ttl, "priceDisplay": price_ok, "offers": offers}
    validate_snapshot(snap)
    return snap, review


def atomic_write(path, text):
    d = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=d, prefix=".offers-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
    ap.add_argument("--fixtures", default=os.path.join(HERE, "..", "fixtures.js"))
    ap.add_argument("--mappings", default=os.path.join(HERE, "mappings.json"))
    ap.add_argument("--aliases", default=os.path.join(HERE, "aliases.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "offers.json"))
    ap.add_argument("--review-dir", default=os.path.join(HERE, "_review"))
    ap.add_argument("--fixture-candidates", help="TESTS/PREVIEWS ONLY: a local candidates file instead of the provider")
    ap.add_argument("--mock", action="store_true")
    args = ap.parse_args(argv)
    sys.stdout.reconfigure(encoding="utf-8")

    config = load_json(args.config, None)
    if config is None and not args.fixture_candidates:
        print("tickets: no config.json - live pricing stays OFF (copy tickets/config.example.json and follow TICKETS.md). offers.json untouched.")
        return 0
    config = config or {}
    try:
        provider = FixtureProvider(args.fixture_candidates) if args.fixture_candidates else SportsEvents365(config)
    except NotConfigured as e:
        print("tickets: " + str(e) + " - live pricing stays OFF. offers.json untouched.")
        return 0
    if provider.is_mock and os.path.abspath(args.out) == os.path.abspath(os.path.join(HERE, "offers.json")):
        print("tickets: refusing to write mock data to the public offers.json (use --out elsewhere).")
        return 2

    data = load_fixtures(args.fixtures)
    occs = occurrences(data)
    dates = sorted(o.date for o in occs)
    window = {"from": dates[0], "to": dates[-1], "cities": None} if dates else {"from": "", "to": ""}
    mappings = load_json(args.mappings, {})
    aliases = load_json(args.aliases, {})
    try:
        snap, review = build(config, provider, occs, mappings, aliases, window, mock=provider.is_mock)
    except ProviderError as e:
        print(f"tickets: provider failure ({e.kind}): {e} - previous offers.json kept untouched.")
        return 3
    os.makedirs(args.review_dir, exist_ok=True)
    atomic_write(os.path.join(args.review_dir, "report.json"), json.dumps(review, ensure_ascii=False, indent=1))
    atomic_write(args.out, json.dumps(snap, ensure_ascii=False, indent=1, sort_keys=True))
    s = review["summary"]
    print(f"tickets: published {s['published']} offers ({s['priced']} priced, {s['link-only']} link-only, {s['no-offers']} no-offers); "
          f"review: {s['ambiguous']} ambiguous, {s['conflict']} conflicts, {s['unsafe-link']} unsafe links. priceDisplay={snap['priceDisplay']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
