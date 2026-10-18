#!/usr/bin/env python3
"""Convert a government facility-directory CSV (e.g. data.gov.in "National Hospital Directory" or the
"All India Health Centres Directory") into data/facilities/<name>.csv in this project's schema.

  python scripts/import_government_csv.py path/to/directory.csv --source "data.gov.in National Hospital Directory"
  python scripts/import_government_csv.py file.csv --map name="Hospital Name" lat=Latitude lng=Longitude

Column names are auto-detected from common spellings; the script prints what it matched and what it could not.
Use --map COL=Header to override. state/district are re-derived from the nearest PIN by import_reference_data.py.
Nothing is invented: rows without a name or usable coordinates/PIN are left for the importer to skip and count.
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from pathlib import Path

# backend/scripts/find_help/ -> backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]
FACILITIES_DIR = BACKEND_ROOT / "data" / "find_help" / "facilities"

COLS = [
    "name",
    "type",
    "address",
    "state",
    "district",
    "pin",
    "lat",
    "lng",
    "phone",
    "operator_type",
    "source",
    "source_id",
    "verified_at",
    "specialty",
]
CANDIDATES = {
    "name": [
        "hospital_name",
        "facility_name",
        "health_facility_name",
        "name_of_facility",
        "name",
    ],
    "lat": ["latitude", "lat", "y"],
    "lng": ["longitude", "lng", "long", "lon", "x"],
    "pin": ["pincode", "pin_code", "pin", "postal_code", "postcode"],
    "address": [
        "address_original_first_box",
        "address",
        "full_address",
        "location",
        "street",
    ],
    "phone": [
        "telephone",
        "phone",
        "phone_number",
        "mobile_number",
        "contact_number",
        "contact",
    ],
    "type": [
        "facility_type",
        "hospital_category",
        "hospital_care_type",
        "category",
        "type",
    ],
    "operator_type": [
        "ownership",
        "hospital_category",
        "ownership_authority",
        "operator",
    ],
    "specialty": [
        "specialties",
        "specialities",
        "specialization",
        "services",
        "facilities",
        "systems_of_medicine",
    ],
    "source_id": ["facility_id", "hospital_id", "id", "sr_no"],
}


def norm(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (h or "").strip().lower()).strip("_")


def map_type(raw: str) -> str:
    t = (raw or "").lower()
    if re.search(r"district", t):
        return "District Hospital"
    if re.search(r"community health|\bchc\b", t):
        return "CHC"
    if re.search(r"primary health|\bphc\b|\buphc\b", t):
        return "PHC"
    if re.search(r"clinic|dispensar|sub.?cent", t):
        return "Clinic"
    return "Hospital"


def fnum(x):
    try:
        return float(str(x).strip())
    except ValueError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv_path")
    ap.add_argument("--source", default="Government open data (data.gov.in)")
    ap.add_argument("--out")
    ap.add_argument("--map", nargs="*", default=[])
    a = ap.parse_args()
    override = dict(m.split("=", 1) for m in a.map)
    with open(a.csv_path, newline="", encoding="utf-8-sig", errors="replace") as f:
        rd = csv.DictReader(f)
        headers = {norm(h): h for h in (rd.fieldnames or [])}
        col = {}
        for field, cands in CANDIDATES.items():
            if field in override:
                col[field] = override[field]
                continue
            col[field] = next((headers[c] for c in cands if c in headers), None)
        print("matched:", {k: v for k, v in col.items() if v})
        print("not found:", [k for k, v in col.items() if not v])
        if not col["name"]:
            sys.exit("Could not find a name column; pass --map name=<header>.")
        out = a.out or str(
            FACILITIES_DIR
            / (
                "gov_"
                + re.sub(
                    r"[^a-z0-9]+",
                    "_",
                    os.path.basename(a.csv_path).lower().rsplit(".", 1)[0],
                )
                + ".csv"
            )
        )
        os.makedirs(os.path.dirname(out), exist_ok=True)
        n = 0
        with open(out, "w", newline="", encoding="utf-8") as g:
            w = csv.DictWriter(g, fieldnames=COLS)
            w.writeheader()
            for r in rd:

                def get(k, r=r):  # bind the current row
                    return (r.get(col[k]) or "").strip() if col.get(k) else ""

                lat, lng = fnum(get("lat")), fnum(get("lng"))
                if lat is not None and lng is not None and lat > 37.5 and lng < 37.5:
                    lat, lng = lng, lat  # swapped columns
                pin = re.sub(r"\D", "", get("pin"))
                rawtype = get("type")
                w.writerow(
                    {
                        "name": get("name"),
                        "type": map_type(rawtype or get("name")),
                        "address": get("address"),
                        "pin": pin if len(pin) == 6 else "",
                        "lat": "" if lat is None else lat,
                        "lng": "" if lng is None else lng,
                        "phone": get("phone").split(",")[0].split(";")[0].strip(),
                        "operator_type": get("operator_type"),
                        "source": a.source,
                        "source_id": get("source_id"),
                        "verified_at": "",
                        "specialty": " ".join(
                            x for x in (rawtype, get("specialty")) if x
                        ),
                    }
                )
                n += 1
    print(f"{n} rows -> {out}. Now run: python scripts/import_reference_data.py")


if __name__ == "__main__":
    main()
