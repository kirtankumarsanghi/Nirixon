#!/usr/bin/env python3
"""Build data/reference.sqlite from the CSVs in data/. Idempotent: rebuilds from scratch every run.

  python scripts/import_reference_data.py [--data data] [--out data/reference.sqlite] [--report reports/coverage.csv]

Inputs
  data/pincodes.csv                 pin,district,state,lat,lng,coord_source,n_offices
  data/deic_counts_by_state.csv     state,operational_deics,source
  data/facilities/*.csv             name,type,address,state,district,pin,lat,lng,phone,operator_type,source,source_id,verified_at[,specialty]
                                    (every *.csv in the folder; *TEMPLATE* files are skipped)

Rules
  * Nothing is invented. Rows without a name, or without a usable location (lat/lng or a known pin), are skipped and counted.
  * state/district are always taken from the nearest PIN centroid, so OSM/manual spelling differences cannot break matching.
  * If lat/lng are blank but pin is known, the PIN centroid is used.
  * verified_at stays empty unless the source file provides it.
"""

from __future__ import annotations

import argparse
import collections
import csv
import glob
import math
import os
import re
import sqlite3
import sys
from pathlib import Path

# backend/scripts/find_help/ -> backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_ROOT / "data" / "find_help"

TYPES = ("DEIC", "RBSK", "District Hospital", "CHC", "PHC", "Hospital", "Clinic")
LAT, LNG = (6.0, 37.5), (68.0, 98.0)


def infer_type(name: str, given: str) -> str:
    g = (given or "").strip()
    if g in TYPES and g not in ("Hospital", "Clinic"):
        return g
    n = (name or "").lower()
    if re.search(r"\bdeic\b|early intervention", n):
        return "DEIC"
    if re.search(r"\brbsk\b", n):
        return "RBSK"
    if re.search(
        r"district (civil |general )?hospital|civil hospital|general hospital|sadar hospital|zila",
        n,
    ):
        return "District Hospital"
    if re.search(r"community health cent|\bchc\b", n):
        return "CHC"
    if re.search(r"primary health cent|\bphc\b", n):
        return "PHC"
    return (
        g
        if g in TYPES
        else ("Clinic" if (given or "").lower() == "clinic" else "Hospital")
    )


# Keyword tags: derived ONLY from the facility name and an optional specialty text (OSM healthcare:speciality).
# They are a hint ("looks like a child/developmental service"), never a verification.
TAG_PATTERNS = {
    "developmental": r"early intervention|\bdeic\b|child development|development(al)? (cent|clinic)|autis|cerebral palsy|special (child|needs|school|education)|disabilit|divyang|intellectual|learning|neurodevelop",
    "pediatric": r"p(a)?ediatric|\bchild(ren)?\b|\bkids?\b|shishu|neonat|\bnicu\b|mother (and|&) child|women (and|&) child",
    "mental_health": r"psychiatr|mental|psycholog|counsel+ing|child guidance|behaviou?r|de-?addiction|neuro",
    "therapy": r"speech|hearing|audiolog|occupational|physiotherap|physio\b|therapy|rehabilit",
}


def infer_specialty(name: str, extra: str = "") -> str:
    text = f"{name or ''} {extra or ''}".lower()
    return ",".join(t for t, pat in TAG_PATTERNS.items() if re.search(pat, text))


def num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


class PinGrid:
    """Nearest PIN centroid lookup with a 0.5-degree grid."""

    def __init__(self, pins):
        self.cells = collections.defaultdict(list)
        for p in pins:
            self.cells[(int(p["lat"] // 0.5), int(p["lng"] // 0.5))].append(p)

    def nearest(self, lat, lng, max_ring=40):
        ci, cj = int(lat // 0.5), int(lng // 0.5)
        cos = math.cos(math.radians(lat))

        def dist(p):
            return (p["lat"] - lat) ** 2 + ((p["lng"] - lng) * cos) ** 2

        found = []
        for ring in range(max_ring + 1):
            for i in range(ci - ring, ci + ring + 1):
                for j in range(cj - ring, cj + ring + 1):
                    if max(abs(i - ci), abs(j - cj)) == ring:
                        found += self.cells.get((i, j), ())
            if found and ring >= 1:
                # first hit may be at the edge of its cell; the ring just searched covers any closer point
                return min(found, key=dist)
        return min(found, key=dist) if found else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(DATA_DIR))
    ap.add_argument("--out", default=str(DATA_DIR / "reference.sqlite"))
    ap.add_argument("--report", default=str(DATA_DIR / "coverage.csv"))
    a = ap.parse_args()

    pins = []
    with open(os.path.join(a.data, "pincodes.csv"), newline="") as f:
        for r in csv.DictReader(f):
            pins.append(
                {
                    "pin": r["pin"],
                    "district": r["district"],
                    "state": r["state"],
                    "lat": float(r["lat"]),
                    "lng": float(r["lng"]),
                    "coord_source": r["coord_source"],
                    "n_offices": int(r["n_offices"]),
                }
            )
    by_pin = {p["pin"]: p for p in pins}
    grid = PinGrid(pins)

    deic = []
    with open(os.path.join(a.data, "deic_counts_by_state.csv"), newline="") as f:
        deic = [
            (r["state"], int(r["operational_deics"]), r["source"])
            for r in csv.DictReader(f)
        ]

    fac, skipped, seen = [], collections.Counter(), set()
    for path in sorted(glob.glob(os.path.join(a.data, "facilities", "*.csv"))):
        if "TEMPLATE" in os.path.basename(path).upper():
            continue
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                name = (r.get("name") or "").strip()
                if not name:
                    skipped["no name"] += 1
                    continue
                lat, lng = num(r.get("lat")), num(r.get("lng"))
                pin = (r.get("pin") or "").strip()
                if lat is None or lng is None:
                    if pin in by_pin:
                        lat, lng = by_pin[pin]["lat"], by_pin[pin]["lng"]
                    else:
                        skipped["no location"] += 1
                        continue
                if not (LAT[0] <= lat <= LAT[1] and LNG[0] <= lng <= LNG[1]):
                    skipped["outside India"] += 1
                    continue
                near = grid.nearest(lat, lng)
                if near is None:
                    skipped["no nearby PIN"] += 1
                    continue
                key = (name.lower(), round(lat, 3), round(lng, 3))
                if key in seen:
                    skipped["duplicate"] += 1
                    continue
                seen.add(key)
                fac.append(
                    (
                        name,
                        infer_type(name, r.get("type")),
                        (r.get("address") or "").strip(),
                        near["state"],
                        near["district"],
                        pin if pin in by_pin else near["pin"],
                        lat,
                        lng,
                        (r.get("phone") or "").strip() or None,
                        (r.get("operator_type") or "").strip() or None,
                        (r.get("source") or os.path.basename(path)).strip(),
                        (r.get("source_id") or "").strip() or None,
                        (r.get("verified_at") or "").strip() or None,
                        infer_specialty(name, r.get("specialty")) or None,
                    )
                )

    tmp = a.out + ".tmp"
    if os.path.exists(tmp):
        os.remove(tmp)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    c = sqlite3.connect(tmp)
    c.executescript("""
    CREATE TABLE pincodes(pin TEXT PRIMARY KEY, district TEXT, state TEXT, lat REAL, lng REAL, coord_source TEXT, n_offices INTEGER);
    CREATE TABLE deic_counts(state TEXT PRIMARY KEY, operational_deics INTEGER, source TEXT);
    CREATE TABLE facilities(id INTEGER PRIMARY KEY, name TEXT, type TEXT, address TEXT, state TEXT, district TEXT, pin TEXT,
        lat REAL, lng REAL, phone TEXT, operator_type TEXT, source TEXT, source_id TEXT, verified_at TEXT, specialty TEXT);
    CREATE INDEX ix_pin_prefix ON pincodes(pin);
    CREATE INDEX ix_fac_geo ON facilities(lat, lng);
    CREATE INDEX ix_fac_area ON facilities(state, district);
    """)
    c.executemany(
        "INSERT INTO pincodes VALUES(?,?,?,?,?,?,?)",
        [
            (
                p["pin"],
                p["district"],
                p["state"],
                p["lat"],
                p["lng"],
                p["coord_source"],
                p["n_offices"],
            )
            for p in pins
        ],
    )
    c.executemany("INSERT INTO deic_counts VALUES(?,?,?)", deic)
    c.executemany(
        "INSERT INTO facilities(name,type,address,state,district,pin,lat,lng,phone,operator_type,source,source_id,verified_at,specialty) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        fac,
    )
    c.commit()
    c.close()
    os.replace(tmp, a.out)

    # coverage report: loaded vs official DEIC count
    stats = collections.defaultdict(lambda: collections.Counter())
    for f_ in fac:
        s = stats[f_[3]]
        s["facilities"] += 1
        s["with_phone"] += bool(f_[8])
        s["verified"] += bool(f_[12])
        s["deic_loaded"] += f_[1] == "DEIC"
    os.makedirs(os.path.dirname(a.report) or ".", exist_ok=True)
    with open(a.report, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(
            [
                "state",
                "pins",
                "facilities",
                "with_phone",
                "verified",
                "deic_loaded",
                "deic_official",
                "deic_gap",
            ]
        )
        pc = collections.Counter(p["state"] for p in pins)
        for st, n, _ in sorted(deic):
            s = stats[st]
            w.writerow(
                [
                    st,
                    pc[st],
                    s["facilities"],
                    s["with_phone"],
                    s["verified"],
                    s["deic_loaded"],
                    n,
                    max(n - s["deic_loaded"], 0),
                ]
            )
    print(
        f"pincodes {len(pins)} | facilities {len(fac)} | skipped {dict(skipped) or 0} | db {a.out} | report {a.report}"
    )
    if not fac:
        print(
            "NOTE: no facilities loaded yet. Find Help will show state DEIC counts + helplines only.\n"
            "      Run scripts/fetch_osm_facilities.py and/or add verified rows to data/facilities/.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
