#!/usr/bin/env python3
"""Download hospitals and clinics in India from OpenStreetMap (Overpass API) into data/facilities/osm_<state>.csv.

Run this ON YOUR OWN MACHINE (needs internet). It is polite: one state at a time, with retries and a pause.

  python scripts/fetch_osm_facilities.py                   # all states
  python scripts/fetch_osm_facilities.py IN-RJ IN-TG       # only these (ISO 3166-2 codes)
  Resumable: states already downloaded are skipped; add --force to refetch.

Data (c) OpenStreetMap contributors, ODbL. Keep the attribution in your app (e.g. footer: "Facility data (c) OpenStreetMap contributors").
OSM listings are crowd-sourced: names/locations are usually right, phone numbers are patchy, and nothing here is "verified".
Rows are written with an empty verified_at so the UI can say so.
"""
from __future__ import annotations

import argparse, csv, json, os, sys, time, urllib.parse, urllib.request
from pathlib import Path

# backend/scripts/find_help/ -> backend/
BACKEND_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_ROOT / "data" / "find_help"
FACILITIES_DIR = DATA_DIR / "facilities"

ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
STATES = {
    "IN-AN": "Andaman And Nicobar Islands", "IN-AP": "Andhra Pradesh", "IN-AR": "Arunachal Pradesh", "IN-AS": "Assam",
    "IN-BR": "Bihar", "IN-CH": "Chandigarh", "IN-CT": "Chhattisgarh", "IN-DH": "Dadra and Nagar Haveli and Daman and Diu",
    "IN-DL": "Delhi", "IN-GA": "Goa", "IN-GJ": "Gujarat", "IN-HP": "Himachal Pradesh", "IN-HR": "Haryana",
    "IN-JH": "Jharkhand", "IN-JK": "Jammu And Kashmir", "IN-KA": "Karnataka", "IN-KL": "Kerala", "IN-LA": "Ladakh",
    "IN-LD": "Lakshadweep", "IN-MH": "Maharashtra", "IN-ML": "Meghalaya", "IN-MN": "Manipur", "IN-MP": "Madhya Pradesh",
    "IN-MZ": "Mizoram", "IN-NL": "Nagaland", "IN-OD": "Odisha", "IN-PB": "Punjab", "IN-PY": "Puducherry",
    # OSM tags Telangana as IN-TS (not the ISO 3166-2 "IN-TG"); the wrong code silently returns 0 rows.
    "IN-RJ": "Rajasthan", "IN-SK": "Sikkim", "IN-TS": "Telangana", "IN-TN": "Tamil Nadu", "IN-TR": "Tripura",
    "IN-UK": "Uttarakhand", "IN-UP": "Uttar Pradesh", "IN-WB": "West Bengal",
}
COLS = ["name", "type", "address", "state", "district", "pin", "lat", "lng", "phone", "operator_type", "source", "source_id", "verified_at", "specialty"]


def query(code: str) -> str:
    return (f'[out:json][timeout:300];area["ISO3166-2"="{code}"]->.a;'
            f'(nwr["amenity"~"^(hospital|clinic)$"](area.a););out center tags;')


def fetch(code: str, tries: int = 4) -> dict:
    data = urllib.parse.urlencode({"data": query(code)}).encode()
    last = None
    for i in range(tries):
        for ep in ENDPOINTS:
            try:
                req = urllib.request.Request(ep, data=data, headers={"User-Agent": "nirixon-find-help/1.0 (student project)"})
                with urllib.request.urlopen(req, timeout=330) as r:
                    return json.load(r)
            except Exception as e:  # noqa: BLE001
                last = e
        time.sleep(15 * (i + 1))
    raise RuntimeError(f"{code}: {last}")


def address(t: dict) -> str:
    if t.get("addr:full"): return t["addr:full"]
    parts = [t.get(k) for k in ("addr:housename", "addr:housenumber", "addr:street", "addr:suburb", "addr:city", "addr:district", "addr:state") if t.get(k)]
    return ", ".join(parts)


def rows_from_overpass(payload: dict, state: str):
    for el in payload.get("elements", []):
        t = el.get("tags") or {}
        name = (t.get("name") or t.get("name:en") or "").strip()
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        if not name or lat is None or lng is None: continue
        pin = (t.get("addr:postcode") or "").replace(" ", "")
        yield {
            "name": name, "type": "Clinic" if t.get("amenity") == "clinic" else "Hospital", "address": address(t),
            "state": state, "district": "", "pin": pin if pin.isdigit() and len(pin) == 6 else "",
            "lat": round(lat, 6), "lng": round(lng, 6),
            "phone": (t.get("phone") or t.get("contact:phone") or "").split(";")[0].strip(),
            "operator_type": t.get("operator:type") or t.get("ownership") or "",
            "source": "OpenStreetMap (ODbL)", "source_id": f'{el["type"]}/{el["id"]}', "verified_at": "",
            "specialty": (t.get("healthcare:speciality") or "").replace(";", " "),
        }


def main():
    force = "--force" in sys.argv
    codes = [a for a in sys.argv[1:] if not a.startswith("--")] or list(STATES)
    out_dir = FACILITIES_DIR
    os.makedirs(out_dir, exist_ok=True)
    for code in codes:
        if code not in STATES: print(f"skip unknown code {code}"); continue
        out = str(out_dir / f"osm_{code.lower()}.csv")
        if os.path.exists(out) and not force:
            print(f"{code} already fetched ({out}); skipping (use --force to refetch)"); continue
        print(f"{code} {STATES[code]} ...", end=" ", flush=True)
        try:
            rows = list(rows_from_overpass(fetch(code), STATES[code]))
        except Exception as e:  # noqa: BLE001
            print(f"FAILED ({e})"); continue
        with open(out, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=COLS); w.writeheader(); w.writerows(rows)
        print(f"{len(rows)} named facilities -> {out}" + ("   <-- 0 rows: check the ISO code" if not rows else ""))
        time.sleep(10)


if __name__ == "__main__":
    main()
