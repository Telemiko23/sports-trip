"""Provider adapter: the ONLY place that talks to a ticket provider, authenticates, or sees a raw response.

Provider-neutral contract:  Provider.fetch_events(window) -> list[Candidate]   (see matching.Candidate)
Everything that leaves this module is an allowlisted, typed Candidate; raw responses stay in memory and are never logged,
committed or published. Secrets come ONLY from environment variables (names configured in config.json) - never from a file
in the repository, a command-line argument, a URL, or a log line.

SportsEvents365 is implemented against what the public documentation describes (Basic auth + apiKey, event URL, minimum price with
currency, available-categories quantity, city/date filtering). The exact paths and field names are NOT verified for this
account (the documentation could not be retrieved and no authenticated call has been made): they live in config.json under
`field_map` so they can be corrected from one real authorized response without touching code. Until that is done the
live path stays disabled (see TICKETS.md, "Activation checklist").
"""
import base64
import json
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from matching import Candidate


class ProviderError(Exception):
    """kind: 'config' | 'auth' | 'rate_limit' | 'transient' | 'schema'  - a failure is never reported as 'no inventory'."""

    def __init__(self, kind, message):
        super().__init__(message)
        self.kind = kind


class NotConfigured(Exception):
    """Credentials/config absent: live pricing stays OFF. Carries only variable NAMES, never values."""

    def __init__(self, missing):
        super().__init__("not configured: missing " + ", ".join(missing))
        self.missing = missing


def now_iso(clock=None):
    return (clock or (lambda: datetime.now(timezone.utc)))().strftime("%Y-%m-%dT%H:%M:%SZ")


def dig(obj, path):
    """Read a dotted path ('minTicketPrice.price') from nested dicts; missing -> None."""
    cur = obj
    for part in (path or "").split("."):
        if not part:
            return None
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def default_opener(request, timeout=30):
    try:
        with urllib.request.urlopen(request, timeout=timeout) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), e.read() if hasattr(e, "read") else b""


class Provider:
    is_mock = False
    id = "provider"

    def fetch_events(self, window):
        raise NotImplementedError


class SportsEvents365(Provider):
    id = "sportsevents365"

    def __init__(self, config, env=None, opener=None, sleep=time.sleep, clock=None, max_retries=3):
        self.cfg = config
        self.env = os.environ if env is None else env
        self.opener = opener or default_opener
        self.sleep = sleep
        self.clock = clock
        self.max_retries = max_retries
        creds = config.get("credentials_env", {})
        missing = [name for name in (creds.get("user"), creds.get("password"), creds.get("api_key")) if not name or not self.env.get(name)]
        for k in ("base_url", "events_path"):
            if not config.get(k) or "REPLACE" in str(config.get(k)):
                missing.append("config." + k)
        if missing:
            raise NotConfigured(missing)
        raw = f"{self.env[creds['user']]}:{self.env[creds['password']]}".encode("utf-8")
        self._auth = "Basic " + base64.b64encode(raw).decode("ascii")       # encoding, NOT encryption: never printed or stored
        self._api_key = self.env[creds["api_key"]]

    # -- one request with bounded retries; auth/rate-limit/transient are distinguished, never conflated with "empty" --
    def _get(self, url):
        delay = 1.0
        for attempt in range(self.max_retries + 1):
            req = urllib.request.Request(url, headers={"Authorization": self._auth, "Accept": "application/json", "User-Agent": "tosport-tickets/1"})
            try:
                status, headers, body = self.opener(req)
            except (urllib.error.URLError, TimeoutError, OSError):
                status, headers, body = 0, {}, b""
            if status == 200:
                try:
                    return json.loads(body.decode("utf-8"))
                except (ValueError, UnicodeDecodeError):
                    raise ProviderError("schema", "response was not JSON")
            if status in (401, 403):
                raise ProviderError("auth", f"authentication/entitlement refused (HTTP {status})")      # never retried: retrying can lock the account
            if status == 429 or status >= 500 or status == 0:
                if attempt >= self.max_retries:
                    raise ProviderError("rate_limit" if status == 429 else "transient", f"gave up after {attempt + 1} attempts (HTTP {status})")
                retry_after = headers.get("Retry-After") if isinstance(headers, dict) else None
                wait = float(retry_after) if retry_after and str(retry_after).replace(".", "", 1).isdigit() else delay
                self.sleep(min(wait, 60) + random.uniform(0, 0.25))
                delay = min(delay * 2, 30)
                continue
            raise ProviderError("schema", f"unexpected HTTP {status}")
        raise ProviderError("transient", "unreachable")

    def fetch_events(self, window):
        """window: {'from': 'YYYY-MM-DD', 'to': 'YYYY-MM-DD', 'cities': [..] (optional)}. All pages or nothing."""
        fm = self.cfg.get("field_map", {})
        base = self.cfg["base_url"].rstrip("/") + "/" + self.cfg["events_path"].lstrip("/")
        out, seen = [], set()
        fetched_at = now_iso(self.clock)
        for city in window.get("cities") or [None]:
            page = 1
            while True:
                q = {"apiKey": self._api_key, "dateFrom": window["from"], "dateTo": window["to"], "page": page}
                q.update({k: v for k, v in (self.cfg.get("extra_params") or {}).items()})
                if city:
                    q["city"] = city
                data = self._get(base + "?" + urllib.parse.urlencode(q))
                items = dig(data, fm.get("items", "events")) if isinstance(data, dict) else data
                if not isinstance(items, list):
                    raise ProviderError("schema", "no event list at field_map.items")
                for it in items:
                    c = self._candidate(it, fm, fetched_at)
                    if c and c.external_id not in seen:
                        seen.add(c.external_id)
                        out.append(c)
                if len(items) < int(self.cfg.get("page_size", 50)) or page >= int(self.cfg.get("max_pages", 40)):
                    break
                page += 1
        return out

    def _candidate(self, it, fm, fetched_at):
        if not isinstance(it, dict):
            return None
        ext = dig(it, fm.get("id", "id"))
        if ext is None:
            return None
        price = dig(it, fm.get("min_price", "minTicketPrice.price"))
        cur = dig(it, fm.get("currency", "minTicketPrice.currency"))
        try:
            price = float(price) if price is not None else None
        except (TypeError, ValueError):
            price = None
        avail = dig(it, fm.get("available_categories", "availableCategoriesQuantity"))
        start = str(dig(it, fm.get("start", "date")) or "")
        return Candidate(
            external_id=str(ext), sport=str(dig(it, fm.get("sport", "sport")) or "").lower(), date=start[:10], time=start[11:16] if len(start) >= 16 else "",
            home=str(dig(it, fm.get("home", "homeTeam")) or ""), away=str(dig(it, fm.get("away", "awayTeam")) or ""), name=str(dig(it, fm.get("name", "name")) or ""),
            comp=str(dig(it, fm.get("competition", "tournament")) or ""), city=str(dig(it, fm.get("city", "city")) or ""), venue=str(dig(it, fm.get("venue", "venue")) or ""),
            url=str(dig(it, fm.get("url", "eventUrl")) or ""), min_price=price, currency=str(cur or "").upper(),
            # fee treatment / quantity basis are only trusted when the config says how the provider states them (verified during activation)
            fees_included=self.cfg.get("price_basis", {}).get("fees_included"), quantity_basis=self.cfg.get("price_basis", {}).get("quantity_basis"),
            scope=self.cfg.get("price_basis", {}).get("scope"), available_categories=int(avail) if isinstance(avail, (int, float)) else None, fetched_at=fetched_at)


class FixtureProvider(Provider):
    """TESTS / PREVIEWS ONLY. Reads recorded or synthetic candidates from a local JSON file; its output must never be published."""
    is_mock = True
    id = "fixture"

    def __init__(self, path):
        self.path = path

    def fetch_events(self, window):
        with open(self.path, encoding="utf-8") as f:
            rows = json.load(f)
        return [Candidate(**{k: v for k, v in r.items() if k in Candidate.__dataclass_fields__}) for r in rows]
