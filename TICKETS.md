# TICKETS — Sports Events 365 enrichment

> **PAUSED (2026-10-03):** no further ticket work until the owner has met the affiliate manager and decided whether this integration is relevant at all. Nothing here is wired to production data; the layer is inert without `tickets/offers.json`.
> What the affiliate panel showed (owner screenshots): the programme runs on **Post Affiliate Pro** (campaigns, banners/links with target URLs on **sportsevents365.fr** as well as `.com`, ad channels, SubId tracking, a Deeplink generator, commission 8% / 7% per sale). It showed **no API, feed or price data**. If work resumes: add every real landing domain to `ALLOWED_HOSTS` (`js/tickets.js`) and `allowed_hosts` (config), take a link from the Deeplink generator to confirm the format, verify attribution in Reports → Raw Clicks, and only link to URLs that exist in the panel (no invented slugs).

**Status (2026-10-02): the product shell, adapter, matching, review report, state contract, expiry and tests are built and
verified with synthetic data. Live numeric pricing is OFF and has NOT been verified against the provider.** Nothing in this
repository claims this account has API access. No credential value belongs in this file or anywhere in the repository.

## 1. What exists

| Piece | File | Notes |
| --- | --- | --- |
| Offer-state resolver + UI renderers | `js/tickets.js` | Pure, unit-tested with a fake clock. Lazy-loads `tickets/offers.json`. |
| UI states on cards, event dialog, trip entries | `js/ui.js` (`ticketChip`), `app.js` | Quiet when nothing is known; a failure never affects search, plan or trip. |
| Provider adapter (SportsEvents365) | `tickets/adapter.py` | Basic auth + apiKey from **environment variables only**; bounded retries; auth/rate-limit/transient/schema failures are distinct. |
| Matching | `tickets/matching.py` | Strict, never fuzzy-title-only; reviewed mappings; quarantine. |
| Snapshot builder + validator | `tickets/build_offers.py` | Allowlisted fields only; atomic publish; refuses mock data on the public path. |
| Review report (internal) | `tickets/_review/report.json` (gitignored) | Ambiguous / conflicting / unsafe-link candidates with reasons. |
| Reviewed mappings, aliases | `tickets/mappings.json`, `tickets/aliases.json` | Owner/reviewer-maintained; never auto-deleted. |
| Config template | `tickets/config.example.json` | No secrets; `credentials_env` holds variable **names**. |
| CI job (manual only) | `.github/workflows/update-tickets.yml` | `workflow_dispatch` only; no schedule until activation. |
| Tests | `tests/unit/tickets.test.js`, `tests/py/test_tickets.py`, `tests/e2e/tickets.spec.mjs` | Mock offers via route interception; **not evidence of a live integration.** |

The event schedule providers remain canonical. Ticket enrichment never changes fixture IDs, never removes an event, and an
event without a commercial match behaves exactly as before.

## 2. Access discovery (what was actually checked)

* The repository and the process environment were searched (names only, values never printed) for Sports Events 365
  references: **none found** — no key names, no config.
* Affiliate approval is a fact told by the owner. **API/feed entitlement, credentials, caching/display terms, market
  restrictions, deep-link template, fee treatment and refresh limits are all unverified.** The public documentation was not
  retrievable (HTTP 403 during research) and no authenticated call has been made. No retail page is scraped and no unrelated
  affiliate-panel credentials are used as guesses.

| Status field | Value |
| --- | --- |
| Affiliate account / approval | confirmed by owner (not independently verified) |
| API or approved-feed entitlement | **unknown** |
| Credentials available to this work | **none** |
| Approved deep-link / tracking mechanism | **unknown** (attribution is treated as **unverified**) |
| What the price includes (fees), quantity, market, currency | **unknown** |
| Caching / redistribution / refresh limits | **unknown** |
| Live numeric prices in production | **OFF** until every activation check below passes |

## 3. The state contract (what a traveler sees)

`js/tickets.js → resolve()` returns exactly one state per occurrence. A number appears **only** in the first row.

| State | Card | Details |
| --- | --- | --- |
| **priced** — exact/reviewed match, scope = this occurrence, fresh quote, per-ticket basis, known fee basis, safe approved link, `priceDisplay: true` | **החל מ־€X לכרטיס · Sports Events 365** | Timestamp, “minimum for one ticket”, fee basis (and “ייתכנו תוספות חובה” when fees are not included), **בדיקת כרטיסים אצל הספק**, commission disclosure |
| **link** — event link verified, price absent/unclear (prices off, fee basis unknown, pass/session/parent scope, bad amount) | **מחיר אצל הספק** | Provider link; for a parent-event link: **בדיקת כרטיסים לאירוע** + “יש לבחור שם את היום או המושב” |
| **expired** — quote older than the validity window (or refresh failed) | **מחיר עדכני אצל הספק** | Number hidden; verified link kept; `fetchedAt` is never reset |
| **none** — provider explicitly reported no current offers (fresh) | **אין כרגע הצעות אצל הספק** | “Does not mean sold out everywhere” |
| **unmatched** — no reliable match / no data | nothing on the card | Dialog: “מידע על כרטיסים לא זמין כרגע” + why; adding to the trip still works |
| **ambiguous** — conflicting or wrong-day/session candidate | nothing on the card | No number, no link; quarantined in the internal review report |

Never shown: urgency, “last tickets”, discount percentages, “sold out”, “ללא עלות נוספת”, a converted currency, a market-wide
“cheapest” claim, group totals, or a per-day price derived from a multi-day pass. Display rounding is upward only (`Math.ceil` to
the cent); the original amount is kept in the snapshot.

### Freshness (the validity window is NOT an invented SLA)

* The window is `ttlMinutes` in the snapshot. **Production value = whatever the provider requires and the collection cadence can
  support** (to be set from the contract during activation). Tests use 60 minutes with a fake clock; that is a test setting.
* Expiry is evaluated on every render with the **current clock** against the quote's own `fetchedAt` (and an optional earlier
  `expiresAt`), so a stale CDN copy, an old open tab or a stopped CI job cannot keep a price alive. The page also schedules a
  re-render at the next expiry and when a hidden tab becomes visible again. `fetch` uses `cache: 'no-store'`, and HTTP
  caching never extends validity. A `fetchedAt` in the future (beyond a 5-minute skew) is treated as not fresh.

## 4. Matching rules (correctness before coverage)

Automated match for **football** requires all of: same sport · both participants equal after accent/alias/club-prefix
normalisation (one generic suffix such as “United” is tolerated only for distinctive names — “Manchester” never completes to
“Manchester City”) · same home/away orientation (reversed only at a neutral venue) · the same local calendar date · the same
squad category (men / women / youth / reserve) · no contradiction on competition, time (> 3 h) or city **and** venue · exactly one
satisfying candidate. Two candidates = repeated fixture → review. A near-miss (same teams, other date = possible postponement)
→ review, never a price. **Non-football (tournament days, sessions, passes) is matched only through a reviewed mapping** that
states the ticket scope (`occurrence`, `session`, `parent-event`, `pass`); a pass is never priced per day; a parent-event link
carries no day price.

Mappings (`tickets/mappings.json`):

```json
{ "reviewed": { "<occurrenceId>": { "external_id": "<provider id>", "scope": "parent-event", "reviewed_by": "...", "reviewed_at": "YYYY-MM-DD" } },
  "rejected": { "<occurrenceId>": ["<provider id>", "..."] } }
```

A reviewed mapping is re-validated against the current schedule on every run. If the mapped event disappears from the provider
feed or the schedule changed (date etc.), the pair is **quarantined as `conflict` in the review report** — the mapping is not
deleted and no price is published for it.

## 5. Configuration, secrets and activation

**Secrets** go only into repository/CI secret storage (or local environment variables) — never into a prompt, file, URL,
client code, fixture, log, source map or public JSON:

* Repository secrets: `SE365_USER`, `SE365_PASSWORD`, `SE365_API_KEY` (names are configurable in `credentials_env`).
* Repository variable (non-secret): `TICKETS_CONFIG` = the JSON from `tickets/config.example.json` filled in (paths/field names
  verified from a real response, `price_basis`, `allowed_hosts`, `ttl_minutes`, `activation`).
* Local run: set the three variables in your shell, put the config at `tickets/config.json` (gitignored), then
  `py tickets/build_offers.py`. Basic-auth encoding is not encryption; the header is built in memory and never printed.

**Failure behaviour of `build_offers.py`**

| Situation | Result |
| --- | --- |
| No config / missing credentials | Prints the missing variable **names**, exit 0, `offers.json` untouched, live pricing OFF |
| 401/403 | Exit 3, **no retry**, previous snapshot kept; reported as an auth/entitlement problem |
| 429 | Bounded exponential backoff (honours `Retry-After`, capped), then exit 3 as rate-limit |
| 5xx / network | Bounded retries, then exit 3 as transient |
| Response shape differs | Exit 3 as schema drift — **never treated as “no inventory”** |
| Failure mid-pagination | Whole run aborted; nothing is published half-way |
| Provider genuinely lists an event with zero availability | `no-offers` for that matched event only |
| Mock provider requested for the public path | Refused (exit 2) |

The snapshot is validated (`validate_snapshot`: allowlisted keys, enums, positive amounts, no credential-looking text, priced
offers only when `priceDisplay` is true and the basis is complete) and written atomically (temp file + `os.replace`).
`priceDisplay` is `true` only when `config.activation.price_display_verified` is `true`; otherwise amounts are **omitted** from the
public file and offers are link-only.

### Activation checklist (all must pass with an **authorized live sample** before `price_display_verified` becomes `true`)

1. Owner confirms **API or approved feed/export entitlement**, and credentials are stored as secrets.
2. One real authorized response is captured privately; `field_map` and `price_basis` are corrected from it. Raw responses are
   never committed.
3. **Price basis verified**: the amount equals the retail price reachable from the outbound link (not a partner net/wholesale
   amount); per-ticket quantity basis; which fees/delivery are included; currency and market. Unknown → leave `null` (link-only).
4. **Caching/display/redistribution** terms allow publishing a derived public snapshot at the chosen cadence; set `ttl_minutes`
   from the provider's requirement and the actual cadence (no invented SLA).
5. **Deep-link + attribution**: an approved link template/tracking mechanism; confirm attribution with the provider's supported
   test method **without placing an order**. Without test evidence attribution stays marked unverified.
6. **Market/geography**: if prices depend on the end user's country, resolve the contract first. Do not use the CI runner's IP or
   collect visitor IPs as a proxy.
7. `py -m unittest discover -s tests/py`, `npm run test:unit`, and `npx playwright test tests/e2e/tickets.spec.mjs` pass.
8. Review `tickets/_review/report.json`; resolve ambiguous/conflicting items via `mappings.json`.
9. Only then enable a schedule in `.github/workflows/update-tickets.yml`.

**Remaining inputs from the owner (one list):**
(a) confirmation of API/feed entitlement and how to obtain credentials securely; (b) an approved deep-link example and tracking
mechanism, plus language/currency/market configuration; (c) what the minimum price includes (ticket/delivery/service fees),
applicable quantities, caching/display/redistribution permissions and refresh limits. Missing items block only the **live** price
check; everything else is built.

If permitted cadence/geography cannot yield trustworthy advertised prices, keep price-free provider links and prepare a minimal
server-side refresh design for approval — no backend or paid service is introduced implicitly.

## 6. Disclosure and links

* Near every ticket action: “הרכישה מתבצעת אצל הספק. ייתכן ש-ToSport תקבל עמלה אם תרכשו דרך הקישור.” + a “מידע נוסף” disclosure
  (commission does not influence ranking; checkout is at the provider; minimum ≠ market-wide cheapest; fee basis; freshness).
* Outbound links: HTTPS only, host on the allowlist (`ALLOWED_HOSTS` in `js/tickets.js` **and** `allowed_hosts` in the build
  config — provisional until the owner confirms the provider's real domains), no user-info/look-alike hosts,
  `rel="sponsored noopener noreferrer"`, `target="_blank"`. Official ticket links from the schedule feed (`tickets_url`) stay and are
  shown as “אתר הכרטיסים הרשמי”.
* Affiliate commission is **not** an input to ranking or visibility; ticket availability influences nothing until it is actually
  known and stated plainly.
* Analytics: `ticket_link_click` (kind, provider, state, scope, sport) and `ticket_data_state` (loaded/none/unavailable, priced?) —
  never URLs, amounts or affiliate parameters.

## 7. Reproducible checks (no credentials needed)

```
py -m unittest discover -s tests/py          # matching, adapter failure modes, snapshot allowlist, atomic write
npm run test:unit                              # resolver, fake-clock expiry, link safety, rendering
npx playwright test tests/e2e/tickets.spec.mjs # every state in the browser, expiry on an open page, optional-data failures
py tickets/build_offers.py                     # without config: prints that live pricing is OFF, changes nothing
```
