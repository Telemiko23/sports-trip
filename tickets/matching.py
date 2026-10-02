"""Event matching: ToSport occurrence  <->  provider event.   Correctness before coverage.

A price is never attached because two titles look alike. An automated match needs, together:
  * the same sport,
  * BOTH participants matching (after accent/alias/club-prefix normalisation) in the same home/away orientation,
  * the same local calendar date (a different date is a postponement candidate -> review, never a price),
  * the same category (men's / women's / youth / reserve squads never cross),
  * no contradiction on competition, city or venue when both sides state one,
  * exactly ONE provider candidate satisfying all of the above (two = a repeated fixture -> review).
Anything weaker is 'ambiguous' (quarantined into the internal review report, no public price/link) or 'none'.
A reviewed mapping (explicit external id) wins over heuristics, but is re-validated against the current schedule; a mapping
that now disagrees with the occurrence is quarantined, never silently trusted and never silently deleted.
Tournament days/sessions/passes are only matched through reviewed mappings that declare the ticket scope.
"""
import re
import unicodedata
from dataclasses import dataclass, field

CLUB_NOISE = {"fc", "afc", "cf", "sc", "ac", "as", "cd", "ud", "sv", "fk", "sk", "bk", "if", "ssc", "us", "rc", "ogc", "club", "the"}
# squad-category markers: a candidate carrying a marker the occurrence lacks (or vice versa) is a different team
CATEGORY_MARKERS = {
    "women": "women", "womens": "women", "ladies": "women", "femenino": "women", "feminin": "women", "frauen": "women", "w": "women",
    "u17": "youth", "u18": "youth", "u19": "youth", "u20": "youth", "u21": "youth", "u23": "youth", "youth": "youth", "academy": "youth", "juniors": "youth",
    "ii": "reserve", "b": "reserve", "reserves": "reserve", "2": "reserve",
}
DEFAULT_ALIASES = {
    "man utd": "manchester united", "man united": "manchester united", "man city": "manchester city", "spurs": "tottenham hotspur", "tottenham": "tottenham hotspur",
    "wolves": "wolverhampton wanderers", "newcastle": "newcastle united", "west ham": "west ham united", "brighton": "brighton and hove albion",
    "inter": "internazionale", "inter milan": "internazionale", "psg": "paris saint germain", "paris sg": "paris saint germain", "bayern": "bayern munich",
    "atletico madrid": "atletico madrid", "atletico": "atletico madrid", "dortmund": "borussia dortmund", "leipzig": "rb leipzig",
}


def fold(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode("ascii").lower()
    s = s.replace("&", " and ")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", s)).strip()


def split_team(name, aliases=None):
    """-> (normalised core name, category). Category markers are removed from the name and reported separately."""
    toks = fold(name).split()
    category = "men"
    core = []
    for t in toks:
        if t in CATEGORY_MARKERS and (core or len(toks) == 1):
            category = CATEGORY_MARKERS[t]
        elif t in CLUB_NOISE and len(toks) > 1:
            continue
        else:
            core.append(t)
    key = " ".join(core)
    amap = dict(DEFAULT_ALIASES)
    if aliases:
        amap.update({fold(k): fold(v) for k, v in aliases.items()})
    return amap.get(key, key), category


@dataclass
class Occurrence:
    id: int
    sport: str                      # registry id (football, tennis, ...)
    date: str                       # venue-local calendar date YYYY-MM-DD
    home: str = ""
    away: str = ""
    title: str = ""
    comp: str = ""
    city: str = ""
    venue: str = ""
    time: str = ""                  # HH:MM local, '' when unpublished
    parent_id: int = 0
    neutral: bool = False


@dataclass
class Candidate:
    external_id: str
    sport: str = ""
    date: str = ""
    home: str = ""
    away: str = ""
    name: str = ""
    comp: str = ""
    city: str = ""
    venue: str = ""
    time: str = ""
    url: str = ""
    min_price: float = None
    currency: str = ""
    fees_included: object = None
    quantity_basis: str = None
    scope: str = None
    available_categories: int = None
    fetched_at: str = ""
    raw: dict = field(default_factory=dict, repr=False)


@dataclass
class Result:
    status: str                     # exact | reviewed | ambiguous | none | rejected | conflict
    candidate: Candidate = None
    reasons: list = field(default_factory=list)
    alternatives: list = field(default_factory=list)
    scope: str = "occurrence"


GENERIC_SUFFIX = {"united", "city", "town", "rovers", "athletic", "wanderers", "albion", "county", "hotspur", "wednesday", "orient", "villa", "palace", "forest"}
# a short core that is itself a place/qualifier shared by several clubs must never be completed by a suffix ("Manchester" is not "Manchester City")
SHARED_CORES = {"manchester", "sheffield", "bristol", "real", "atletico", "dynamo", "sporting", "borussia", "nottingham", "west", "inter", "st", "saint", "newcastle",
                "leicester", "birmingham", "norwich", "ipswich", "cardiff", "swansea", "stoke", "derby", "bradford", "hull", "oxford", "cambridge", "lincoln", "dundee", "olympique"}


def team_equal(a, b):
    """Strict equality, or equality up to ONE generic club suffix ("Leeds" == "Leeds United") when the short form is a distinctive name."""
    if not a or not b:
        return False
    if a == b:
        return True
    short, long_ = (a, b) if len(a) < len(b) else (b, a)
    if short in SHARED_CORES or len(short) < 4:
        return False
    return long_.startswith(short + " ") and long_[len(short) + 1:] in GENERIC_SUFFIX


def _same(a, b):
    return bool(a) and bool(b) and fold(a) == fold(b)


def _contradicts(a, b, aliases=None):
    """True only when both sides state a value and they differ (a missing value is unknown, not a contradiction)."""
    return bool(fold(a)) and bool(fold(b)) and fold(a) != fold(b)


def _minutes(hhmm):
    m = re.match(r"^(\d\d):(\d\d)$", hhmm or "")
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def participants_match(occ, cand, aliases=None):
    """('same'|'reversed'|'no', category-equal)."""
    oh, oc1 = split_team(occ.home, aliases)
    oa, oc2 = split_team(occ.away, aliases)
    ch, cc1 = split_team(cand.home, aliases)
    ca, cc2 = split_team(cand.away, aliases)
    if not (oh and oa and ch and ca):
        return "no", False
    cat_ok = (oc1, oc2) == (cc1, cc2)
    if team_equal(oh, ch) and team_equal(oa, ca):
        return "same", cat_ok
    if team_equal(oh, ca) and team_equal(oa, ch):
        return "reversed", cat_ok
    return "no", cat_ok


def evaluate(occ, cand, aliases=None):
    """Strict check of one candidate against one occurrence -> (level, reasons). level: exact | partial | no."""
    reasons = []
    if occ.sport != cand.sport:
        return "no", ["sport-differs"]
    if occ.sport != "football":
        return "partial", ["non-football-needs-reviewed-mapping"]
    pm, cat_ok = participants_match(occ, cand, aliases)
    if pm == "no":
        return "no", ["participants-differ"]
    if not cat_ok:
        return "no", ["category-differs"]
    if pm == "reversed" and not occ.neutral:
        return "partial", ["home-away-reversed"]
    if cand.date != occ.date:
        return "partial", ["date-differs"]
    if _contradicts(occ.comp, cand.comp, aliases):
        return "partial", ["competition-differs"]
    om, cm = _minutes(occ.time), _minutes(cand.time)
    if om is not None and cm is not None and abs(om - cm) > 180:
        return "partial", ["time-differs"]
    if _contradicts(occ.venue, cand.venue) and _contradicts(occ.city, cand.city):
        return "partial", ["place-differs"]
    return "exact", reasons


def match_occurrence(occ, candidates, mappings=None, aliases=None):
    """mappings: {"reviewed": {occ_id: {external_id, scope, ...}}, "rejected": {occ_id: [external_id, ...]}}"""
    mappings = mappings or {}
    by_id = {c.external_id: c for c in candidates}
    rejected = set(str(x) for x in (mappings.get("rejected", {}).get(str(occ.id), [])))

    rev = mappings.get("reviewed", {}).get(str(occ.id))
    if rev:
        c = by_id.get(str(rev.get("external_id")))
        scope = rev.get("scope", "occurrence")
        if c is None:
            return Result("conflict", None, ["mapped-event-missing-from-feed"], scope=scope)           # absence is NOT a reason to delete the mapping
        if occ.sport == "football" and scope == "occurrence":
            level, why = evaluate(occ, c, aliases)
            if level != "exact":
                return Result("conflict", c, ["mapping-disagrees-with-schedule"] + why, scope=scope)    # quarantine, report, do not publish
        elif c.date and occ.sport == "football" and c.date != occ.date:
            return Result("conflict", c, ["mapping-date-differs"], scope=scope)
        return Result("reviewed", c, ["reviewed-mapping"], scope=scope)

    pool = [c for c in candidates if c.external_id not in rejected]
    exact, partial = [], []
    for c in pool:
        level, why = evaluate(occ, c, aliases)
        if level == "exact":
            exact.append(c)
        elif level == "partial":
            partial.append((c, why))
    if len(exact) == 1:                      # a near-miss elsewhere (e.g. the same teams on another date) does not undo a strict match
        return Result("exact", exact[0], [])
    if len(exact) >= 2:
        return Result("ambiguous", None, ["repeated-fixture-multiple-candidates"], alternatives=exact)
    if partial:
        return Result("ambiguous", None, sorted({r for _, why in partial for r in why}), alternatives=[c for c, _ in partial])
    return Result("none", None, ["no-candidate"])

