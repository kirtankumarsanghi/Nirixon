#!/usr/bin/env python3
"""Import the MoHFW public health-facility directory into data/find_help/facilities/.

Source
  Esri India Living Atlas, layer "India Healthcare Facility" (public, no auth):
  https://livingatlas.esri.in/server1/rest/services/Health/IN_HealthcareFacility/MapServer/0
  Published attribution: "Esri India, Open Data portal, Govt. of India."
  The layer describes itself as the MoHFW (2021) list of primary health centres,
  sub-centres, community health centres, district/state hospitals with geo-location.

Why this exists
  OpenStreetMap gives broad coverage but no authoritative designation, so every
  OSM row is (correctly) "unverified". This directory carries a facility TYPE and
  a government source, which is what lets Find Help rank real PHC/CHC/district
  hospitals above unmapped clinics.

Trust
  Rows are written with operator_type=government and a source string naming MoHFW,
  so the importer marks them `official`. verified_at is left empty: this is a
  published directory, NOT a human phone-verified record.

Usage (from backend/)
    python scripts/find_help/import_mohfw_arcgis.py
    python scripts/find_help/import_reference_data.py

The script is resumable per page and rewrites the CSV atomically on success.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
import time
from pathlib import Path

import httpx

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "find_help"
DEFAULT_OUT = DATA_DIR / "facilities" / "mohfw_health_facilities.csv"

SERVICE = (
    "https://livingatlas.esri.in/server1/rest/services/Health/"
    "IN_HealthcareFacility/MapServer/0/query"
)
OUT_FIELDS = (
    "objectid,facilityname,facilitytype,landline,address,street,landmark,"
    "locality,subdistrict,district,state,posatalcode"
)
SOURCE = "MoHFW healthcare facilities 2021 (Esri India Living Atlas)"
PAGE = 2000
RETRIES = 3

# The importer understands seven facility types. Everything else is mapped to the
# closest one; sub-centres deliberately become "Clinic" rather than overstating
# them as PHCs.
TYPE_MAP = {
    "primary health centre": "PHC",
    "urban health centre": "PHC",
    "urban health posts": "PHC",
    "community health centre": "CHC",
    "district hospital": "District Hospital",
    "subdistrict hospital": "Hospital",
    "referral hospital": "Hospital",
    "medical colleges hospital": "Hospital",
    "eye hospital": "Hospital",
    "esi": "Hospital",
    "hospital": "Hospital",
    "sth": "Hospital",
    "clinic": "Clinic",
    "dispensary": "Clinic",
    "m & cw centre": "Clinic",
    "maternity home": "Clinic",
    "post partum unit": "Clinic",
    "sub centre": "Clinic",
    "hsc": "Clinic",
    "others": "Clinic",
}

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
    "verified_by",
    "specialty",
]


def fetch_page(client: httpx.Client, offset: int) -> list[dict]:
    params = {
        "where": "1=1",
        "outFields": OUT_FIELDS,
        "returnGeometry": "true",
        "outSR": "4326",
        "geometryPrecision": "6",
        "orderByFields": "objectid ASC",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE),
        "f": "json",
    }
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            r = client.get(SERVICE, params=params)
            r.raise_for_status()
            payload = r.json()
            if "error" in payload:
                raise RuntimeError(payload["error"])
            return payload.get("features", [])
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"page at offset {offset} failed: {last}")


def to_row(feature: dict) -> dict | None:
    a = feature.get("attributes") or {}
    g = feature.get("geometry") or {}
    name = (a.get("facilityname") or "").strip()
    raw_type = (a.get("facilitytype") or "").strip()
    lat, lng = g.get("y"), g.get("x")
    if not name or lat is None or lng is None:
        return None

    # Many names are bare place names ("Uthangarai"); append the designation when
    # the name itself doesn't already say what the place is.
    if raw_type and not any(
        k in name.lower()
        for k in (
            "hospital",
            "centre",
            "center",
            "clinic",
            "phc",
            "chc",
            "uphc",
            "dispensary",
            "maternity",
            "nursing home",
            "sub centre",
            "health",
        )
    ):
        name = f"{name} {raw_type}"

    # Maternal & child-health facilities are the relevant primary-care entry point
    # for a 0-5 screening, so tag them for the age-group ranking.
    low_type = raw_type.lower()
    specialty = ""
    if any(k in low_type for k in ("m & cw", "maternity", "post partum")):
        specialty = "pediatric"

    parts = [
        (a.get("address") or "").strip(),
        (a.get("street") or "").strip(),
        (a.get("landmark") or "").strip(),
        (a.get("locality") or "").strip(),
    ]
    # Drop duplicated fragments (the source repeats the name inside address).
    seen: list[str] = []
    for part in parts:
        low = part.lower()
        if part and low != name.lower() and low not in (p.lower() for p in seen):
            seen.append(part)

    return {
        "name": name,
        "type": TYPE_MAP.get(low_type, "Clinic"),
        "address": ", ".join(seen),
        "state": (a.get("state") or "").strip(),
        "district": (a.get("district") or "").strip(),
        "pin": (a.get("posatalcode") or "").strip(),
        "lat": f"{float(lat):.6f}",
        "lng": f"{float(lng):.6f}",
        "phone": (a.get("landline") or "").strip(),
        "operator_type": "government",
        "source": SOURCE,
        "source_id": str(a.get("objectid") or ""),
        "verified_at": "",
        "verified_by": "",
        "specialty": specialty,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--limit", type=int, default=0, help="Stop after N rows (testing)")
    args = ap.parse_args()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_suffix(".csv.tmp")

    client = httpx.Client(
        timeout=90,
        follow_redirects=True,
        headers={"User-Agent": "nirixon-find-help/1.0"},
    )

    total = written = skipped = 0
    offset = 0
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLS)
        writer.writeheader()
        while True:
            features = fetch_page(client, offset)
            if not features:
                break
            for feature in features:
                total += 1
                row = to_row(feature)
                if row is None:
                    skipped += 1
                    continue
                writer.writerow(row)
                written += 1
            offset += len(features)
            print(
                f"  fetched {offset} (written {written}, skipped {skipped})", flush=True
            )
            if args.limit and written >= args.limit:
                break
            if len(features) < PAGE:
                break
            time.sleep(0.1)

    os.replace(tmp, out)
    print(f"source features {total} | written {written} | skipped {skipped} | {out}")
    if written == 0:
        print("No rows written — check the service.", file=sys.stderr)
        return 1
    print("Next: python scripts/find_help/import_reference_data.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
