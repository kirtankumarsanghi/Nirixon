"""Find-help lookup: PIN -> coordinates -> nearest facilities, with honest fallbacks.

Reads a small read-only SQLite reference DB (built by scripts/import_reference_data.py).
No patient data is stored or logged here: the PIN a caregiver types is only used for the query.
"""

from __future__ import annotations

import collections
import math
import sqlite3
import statistics
from urllib.parse import quote_plus

EARTH_KM = 6371.0088
NEARBY_KM = 25.0  # a facility within this distance counts as "nearby"

HELPLINES = [
    {
        "name": "Tele-MANAS",
        "number": "14416",
        "note": "National tele-mental-health helpline",
    },
    {"name": "Childline", "number": "1098", "note": "Child helpline"},
]

AGE_GROUPS = ("0-5", "6-12")
RESULTS = ("typical", "monitor", "refer")

# Which keyword tags (set by the importer from facility names) count as a close match for each age group.
# "therapy" is deliberately NOT a 6-12 primary tag: the pattern matches "physiotherapy", so including it
# ranked ortho/physio clinics as the best age fit ahead of district hospitals (see reports/coverage.csv).
# They stay relevant at tier 1 via ALL_TAGS.
PRIMARY_TAGS = {
    "0-5": {"developmental", "pediatric"},
    "6-12": {"developmental", "mental_health"},
}
ALL_TAGS = {"developmental", "pediatric", "mental_health", "therapy"}
TIER_LABELS = {
    0: "Developmental / early-intervention service",
    1: "Referral hospital or related child-health service",
    2: "General facility",
}

# Trust is provenance, not a quality rating, and it is the FIRST ranking key once a
# screening context exists: an official DEIC 15 km away matters more than an
# unmapped clinic next door. Levels are derived at import time from the source
# (see scripts/find_help/import_reference_data.py: derive_trust) and never invented.
TRUST_ORDER = {"official": 0, "verified": 1, "unverified": 2}
TRUST_LABELS = {
    "official": "Government / programme listing",
    "verified": "Confirmed by a Nirixon reviewer",
    "unverified": "Mapped only — not verified",
}
TRUST_NOTE = (
    "Trust reflects where a listing came from, not a quality rating. Start with the "
    "government listings (DEIC / RBSK / district hospital). Entries marked “mapped only” "
    "are crowd-sourced leads that may be closed, renamed or private — call before travelling."
)
ADVICE = {
    "refer": "The screening suggests a specialist assessment. Contact one of the centres below soon; a DEIC (free, "
    "government) or a district hospital paediatric department is the usual first stop. Ask for a developmental assessment.",
    "monitor": "Keep watching progress and repeat the check-in. If you remain concerned, any centre below can advise; "
    "your paediatrician or the local DEIC can do a fuller assessment.",
    "typical": "No referral is suggested by this screening. These centres are listed for reference if concerns come up later.",
}

FACILITY_TYPES = (
    "DEIC",
    "RBSK",
    "District Hospital",
    "CHC",
    "PHC",
    "Hospital",
    "Clinic",
)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_KM * math.asin(math.sqrt(a))


def connect_readonly(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def resolve_pin(conn: sqlite3.Connection, pin: str) -> dict | None:
    """Exact PIN if known; otherwise an approximate point from PINs sharing the 4- then 3-digit prefix."""
    row = conn.execute("SELECT * FROM pincodes WHERE pin=?", (pin,)).fetchone()
    if row:
        return {
            "pin": pin,
            "district": row["district"],
            "state": row["state"],
            "lat": row["lat"],
            "lng": row["lng"],
            "approximate": row["coord_source"] != "offices",
            "match": "exact",
        }
    for n in (4, 3):
        rows = conn.execute(
            "SELECT * FROM pincodes WHERE pin LIKE ?", (pin[:n] + "%",)
        ).fetchall()
        if rows:
            return {
                "pin": pin,
                "district": statistics.mode(r["district"] for r in rows),
                "state": statistics.mode(r["state"] for r in rows),
                "lat": statistics.median(r["lat"] for r in rows),
                "lng": statistics.median(r["lng"] for r in rows),
                "approximate": True,
                "match": f"prefix{n}",
            }
    return None


def _maps(query: str) -> str:
    return "https://www.google.com/maps/search/?api=1&query=" + quote_plus(query)


def build_suggestions(
    loc: dict | None, age_group: str | None, state_deic: dict | None
) -> list[dict]:
    """Always-available 'where to go' pathways. These are national programme routes (RBSK / DEIC / district hospital),
    not named facilities, so they hold for every PIN even when no facility data is loaded. Nothing here is invented.
    """
    place = (
        ", ".join(x for x in (loc and loc["district"], loc and loc["state"]) if x)
        or "India"
    )
    out = [
        {
            "id": "deic",
            "title": "Visit the District Early Intervention Centre (DEIC)",
            "detail": "Under the government RBSK programme, DEICs at district hospitals assess and support developmental delays, "
            "usually free of charge. Ask the district hospital reception or paediatrics OPD for the DEIC.",
            "maps_url": _maps(f"District Hospital {place}"),
            "phone": None,
        },
        {
            "id": "district_hospital",
            "title": "Go to the District Hospital (paediatrics OPD)",
            "detail": "A paediatrician can examine your child and refer onward to therapy, psychology or a specialist.",
            "maps_url": _maps(f"District Hospital {place}"),
            "phone": None,
        },
    ]
    if age_group == "0-5":
        out.append(
            {
                "id": "anganwadi",
                "title": "Talk to your Anganwadi worker or ASHA",
                "detail": "They can arrange a screening by the RBSK mobile health team and a referral to the DEIC, free of charge.",
                "maps_url": None,
                "phone": None,
            }
        )
    elif age_group == "6-12":
        out.append(
            {
                "id": "school",
                "title": "Ask your child's school about RBSK school health screening",
                "detail": "RBSK teams screen school children. Share your concerns with the class teacher or school counsellor, "
                "who can request an assessment and a referral.",
                "maps_url": None,
                "phone": None,
            }
        )
        out.append(
            {
                "id": "child_guidance",
                "title": "Look for child guidance or child psychology services",
                "detail": "For learning, attention or behaviour concerns, a child psychologist or psychiatrist can assess your child.",
                "maps_url": _maps(f"child psychologist {place}"),
                "phone": None,
            }
        )
    else:
        out.append(
            {
                "id": "chc",
                "title": "Start at your nearest PHC or CHC",
                "detail": "The doctor there can examine your child and refer you to the DEIC or district hospital.",
                "maps_url": _maps(f"community health centre {place}"),
                "phone": None,
            }
        )
    if state_deic is not None:
        n = state_deic["operational"]
        out[0]["note"] = (
            f"{state_deic['state']} reports {n} operational DEIC{'s' if n != 1 else ''}; confirm the location "
            "with your district health office."
            if n
            else f"No DEIC is reported as operational in {state_deic['state']}; go to the district hospital instead."
        )
    out.append(
        {
            "id": "helplines",
            "title": "Not sure where to go? Call a helpline",
            "detail": "Tele-MANAS (24x7 mental-health support) and Childline can guide you to local services.",
            "maps_url": None,
            "phone": "14416",
        }
    )
    return out


def _tags(row: sqlite3.Row) -> set[str]:
    try:
        raw = row["specialty"]
    except (IndexError, KeyError):  # DB built before specialty tags existed
        raw = None
    return {t for t in (raw or "").split(",") if t}


def _column(row: sqlite3.Row, name: str) -> str | None:
    """Column read that survives a reference DB built before the column existed."""
    try:
        return row[name] or None
    except (IndexError, KeyError):
        return None


def trust_of(row: sqlite3.Row) -> str:
    """Trust level for a row. Older reference DBs (no `trust` column) are derived from
    provenance instead of failing, so an existing build keeps working."""
    value = _column(row, "trust")
    if value in TRUST_ORDER:
        return value
    return "verified" if _column(row, "verified_at") else "unverified"


def is_trusted(row: sqlite3.Row) -> bool:
    return trust_of(row) in ("official", "verified")


def tier_of(row: sqlite3.Row, age_group: str | None) -> int:
    """0 = developmental/early-intervention fit, 1 = referral hospital or related, 2 = general. Name-keyword based."""
    tags = _tags(row)
    primary = PRIMARY_TAGS.get(age_group or "", {"developmental"})
    if row["type"] in ("DEIC", "RBSK") or tags & primary:
        return 0
    if row["type"] in ("District Hospital", "CHC") or tags & ALL_TAGS:
        return 1
    return 2


def _shape(row: sqlite3.Row, km: float, age_group: str | None = None) -> dict:
    tier = tier_of(row, age_group)
    trust = trust_of(row)
    return {
        "id": row["id"],
        "name": row["name"],
        "type": row["type"],
        "km": round(km, 1),
        "phone": row["phone"] or None,
        "address": row["address"] or "",
        "district": row["district"],
        "state": row["state"],
        "lat": row["lat"],
        "lng": row["lng"],
        "source": row["source"],
        "verified_at": _column(row, "verified_at"),
        "specialty": sorted(_tags(row)),
        "relevance": {"tier": tier, "label": TIER_LABELS[tier]},
        "trust": {
            "level": trust,
            "rank": TRUST_ORDER[trust],
            "label": TRUST_LABELS[trust],
            "verified_at": _column(row, "verified_at"),
            "verified_by": _column(row, "verified_by"),
            "source": _column(row, "source"),
        },
    }


def _ranked(rows, lat, lng, limit, age_group=None, by_relevance=False):
    scored = [(haversine_km(lat, lng, r["lat"], r["lng"]), r) for r in rows]
    if by_relevance:
        # Provenance first (official > verified > mapped-only), then developmental fit,
        # then official DEIC/RBSK, then distance. Nearest first within each group.
        scored.sort(
            key=lambda t: (
                TRUST_ORDER[trust_of(t[1])],
                tier_of(t[1], age_group),
                t[1]["type"] not in ("DEIC", "RBSK"),
                t[0],
            )
        )
    else:
        scored.sort(key=lambda t: t[0])
    return scored[:limit]


def find_facilities(
    conn: sqlite3.Connection,
    pin: str,
    types: list[str] | None = None,
    limit: int = 10,
    age_group: str | None = None,
    result: str | None = None,
    *,
    loc: dict | None = None,
    verified_only: bool = False,
) -> dict:
    """age_group ("0-5" | "6-12") ranks official/verified developmental services first, then
    referral hospitals, then everything else, nearest first within each group. Without age_group
    the order is plain distance.

    Pass `loc` to search around explicit coordinates (GPS) instead of a PIN.
    Pass `verified_only` to drop mapped-only (unverified) listings entirely.
    """
    loc = loc or resolve_pin(conn, pin)
    response = {
        "pin": pin,
        "age_group": age_group,
        "result": result,
        "resolved": None,
        "coverage": "none",
        "facilities": [],
        "nearest_specialist": None,
        "suggestions": build_suggestions(None, age_group, None),
        "advice": ADVICE.get(result or ""),
        "state_deic": None,
        "helplines": HELPLINES,
        "trust_summary": {},
        "trust_note": TRUST_NOTE,
        "verified_only": verified_only,
    }
    if loc is None:
        return response
    response["resolved"] = {
        k: loc[k] for k in ("district", "state", "lat", "lng", "approximate", "match")
    }
    d = conn.execute(
        "SELECT operational_deics, source FROM deic_counts WHERE state=?",
        (loc["state"],),
    ).fetchone()
    if d:
        response["state_deic"] = {
            "state": loc["state"],
            "operational": d["operational_deics"],
            "source": d["source"],
        }

    response["suggestions"] = build_suggestions(loc, age_group, response["state_deic"])

    tclause, targs = "", []
    if types:
        tclause = f" AND type IN ({','.join('?' * len(types))})"
        targs = list(types)
    rank = bool(age_group)

    # 1) nearby: bounding box (~55 km), keep those within NEARBY_KM, relevance-first when an age group is given
    dlat = 0.5
    dlng = 0.5 / max(math.cos(math.radians(loc["lat"])), 0.2)
    rows = conn.execute(
        "SELECT * FROM facilities WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?"
        + tclause,
        [
            loc["lat"] - dlat,
            loc["lat"] + dlat,
            loc["lng"] - dlng,
            loc["lng"] + dlng,
            *targs,
        ],
    ).fetchall()
    near = [
        r
        for r in rows
        if haversine_km(loc["lat"], loc["lng"], r["lat"], r["lng"]) <= NEARBY_KM
    ]
    if verified_only:
        near = [r for r in near if is_trusted(r)]
    if near:
        response["coverage"] = "nearby"
        response["facilities"] = [
            _shape(r, km, age_group)
            for km, r in _ranked(near, loc["lat"], loc["lng"], limit, age_group, rank)
        ]
    else:
        # 2) same district, 3) same state
        for level, where, args in (
            ("district", "district=? AND state=?", [loc["district"], loc["state"]]),
            ("state", "state=?", [loc["state"]]),
        ):
            rows = conn.execute(
                f"SELECT * FROM facilities WHERE {where}{tclause}", [*args, *targs]
            ).fetchall()
            if verified_only:
                rows = [r for r in rows if is_trusted(r)]
            ranked = _ranked(rows, loc["lat"], loc["lng"], limit, age_group, rank)
            if ranked:
                response["coverage"] = level
                response["facilities"] = [_shape(r, km, age_group) for km, r in ranked]
                break

    # If no developmental/early-intervention fit made the list, surface the closest one in the state (may be far).
    if (
        age_group
        and response["coverage"] != "none"
        and not any(f["relevance"]["tier"] == 0 for f in response["facilities"])
    ):
        cand = conn.execute(
            "SELECT * FROM facilities WHERE state=? AND (type IN ('DEIC','RBSK') OR specialty IS NOT NULL)",
            (loc["state"],),
        ).fetchall()
        cand = [r for r in cand if tier_of(r, age_group) == 0]
        if verified_only:
            cand = [r for r in cand if is_trusted(r)]
        best = _ranked(cand, loc["lat"], loc["lng"], 1)
        if best:
            response["nearest_specialist"] = _shape(best[0][1], best[0][0], age_group)
    response["trust_summary"] = dict(
        collections.Counter(f["trust"]["level"] for f in response["facilities"])
    )
    return response


def _empty_response(label: str, age_group: str | None, result: str | None) -> dict:
    return {
        "pin": label,
        "age_group": age_group,
        "result": result,
        "resolved": None,
        "coverage": "none",
        "facilities": [],
        "nearest_specialist": None,
        "suggestions": build_suggestions(None, age_group, None),
        "advice": ADVICE.get(result or ""),
        "state_deic": None,
        "helplines": HELPLINES,
        "trust_summary": {},
        "trust_note": TRUST_NOTE,
        "verified_only": False,
    }


def resolve_coords(conn: sqlite3.Connection, lat: float, lng: float) -> dict | None:
    """District/state come from the nearest PIN row; the origin stays the caller's point."""
    row = conn.execute(
        "SELECT district, state FROM pincodes "
        "ORDER BY ((lat-?)*(lat-?)) + ((lng-?)*(lng-?)) LIMIT 1",
        (lat, lat, lng, lng),
    ).fetchone()
    if not row:
        return None
    return {
        "district": row["district"],
        "state": row["state"],
        "lat": lat,
        "lng": lng,
        "approximate": False,
        "match": "gps",
    }


def find_facilities_near(
    conn: sqlite3.Connection,
    lat: float,
    lng: float,
    types: list[str] | None = None,
    limit: int = 10,
    age_group: str | None = None,
    result: str | None = None,
    *,
    verified_only: bool = False,
) -> dict:
    """Nearest facilities around a GPS point (same ranking as the PIN path)."""
    label = f"{lat:.4f}, {lng:.4f}"
    point = resolve_coords(conn, lat, lng)
    if point is None:
        return _empty_response(label, age_group, result)
    return find_facilities(
        conn,
        label,
        types,
        limit,
        age_group,
        result,
        loc=point,
        verified_only=verified_only,
    )
