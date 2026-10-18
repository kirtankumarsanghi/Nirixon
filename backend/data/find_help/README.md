# Nirixon Find Help: real PIN coverage

> **Integrated into this repo** (paths differ from the original package):
> - package: `backend/app/core/find_help/` · data: `backend/data/find_help/` · scripts: `backend/scripts/find_help/`
> - route: mounted in `backend/app/main.py` as `GET /api/facilities`; DB path from `NIRIXON_REFERENCE_DB`
>   (default `backend/data/find_help/reference.sqlite`).
> - from `backend/`: `python scripts/find_help/fetch_osm_facilities.py IN-DL IN-RJ IN-TS IN-KA`
>   then `python scripts/find_help/import_reference_data.py`
> - Telangana's OSM area code is `IN-TS` (the package said `IN-TG`, which silently returned 0 rows) — fixed.

Replaces the 5-PIN demo in `lib/facilities.ts` with a real lookup: **any valid Indian PIN → coordinates → nearest facilities**, with honest fallbacks.

## What is real in this folder, and what is not

| Item | Status |
|---|---|
| `data/pincodes.csv` | **Real.** 19,287 PINs (India Post post-office data, Dec 2021 snapshot via the IndiaPIN project) with cleaned coordinates. 19,048 from office coordinates, 239 district-level approximations (`coord_source=district_centroid`). Spot-checked: Abids, AIIMS Delhi, Parel, Jayanagar, Banjara Hills, Chennai GPO, Kolkata, Guwahati all within ~1 km. |
| `data/deic_counts_by_state.csv` | **Real.** Operational DEICs per state/UT, Rajya Sabha Session 262, AU 1065 B(ii). Totals 367. Counts only. |
| Facility listings (names, addresses, phones) | **Not included.** No public source with DEIC addresses/phones is reachable or exists as one file (the state pages I found list districts or counts only). Nothing was invented. Fill it with the two steps below. |

## Setup (about 15 minutes of your time)

Run these **from `backend/`** (already wired into this repo):

```bash
# 1. Pull hospitals/clinics from OpenStreetMap (needs internet; pick states, or omit for all of India)
python scripts/find_help/fetch_osm_facilities.py IN-RJ IN-TS IN-KA

# 2. Build the reference database
python scripts/find_help/import_reference_data.py   # writes data/find_help/reference.sqlite + coverage.csv

# 3. Test
python -m pytest tests/test_find_help.py tests/test_find_help_route.py -q
```

The route is already mounted in `backend/app/main.py`:

```python
from app.core.find_help.router import router as find_help_router
app.include_router(find_help_router)          # GET /api/facilities?pin=302031&age_group=0-5&limit=5
```

Set `NIRIXON_REFERENCE_DB=/path/to/reference.sqlite` (default `backend/data/find_help/reference.sqlite`). It is a separate read-only SQLite file, so it does not touch your app database or migrations, and holds no patient data.

## Adding verified DEICs (the part only a person can do)

OSM gives you broad coverage but **no DEIC/RBSK designation and patchy phone numbers**. DEICs sit at district hospitals; get each state's list from its NHM website or by calling the district health office, then add rows to `data/facilities/deic_verified.csv` (copy the header from `facilities_manual_TEMPLATE.csv`). Only `name`, `pin` (or `lat`/`lng`), `type=DEIC` are required; add `phone` and `verified_at` (YYYY-MM-DD) only for what you actually confirmed. `reports/coverage.csv` shows, per state, how many DEICs you have loaded versus the official count (`deic_gap`).

## Loading facilities for all states

```bash
bash scripts/load_all_states.sh          # all 37 states/UTs from OpenStreetMap, then rebuilds the DB (resumable)
```

For better coverage of government facilities (district hospitals, CHCs, PHCs), also download a directory from data.gov.in / AIKosh (for example "National Hospital Directory with Geo Code", or "All India Health Centres Directory", both under the Open Government Licence, India) and convert it:

```bash
python scripts/import_government_csv.py ~/Downloads/directory.csv --source "data.gov.in National Hospital Directory"
python scripts/import_reference_data.py
```

The adapter auto-detects common column names and prints what it matched (use `--map name="Header"` to override). It was tested on a synthetic file only, because the real files could not be downloaded when this was written: check its printed "matched / not found" lines on your first run. Duplicates across sources are merged by name and location.

## Age-group and developmental ranking

`GET /api/facilities?pin=302031&age_group=0-5&result=refer&limit=10`

* `age_group`: `0-5` or `6-12`. Without it, results are plain nearest-first.
* `result`: `typical`, `monitor` or `refer`. Only adds an `advice` sentence; the list is returned either way (hide or soften it in the UI for `typical`).
* With an age group, within 25 km results are ordered: official DEIC/RBSK first, then name-keyword matches for the age group (0-5: developmental, paediatric; 6-12: developmental, mental health, therapy), then district hospitals/CHCs and related, then general facilities. Nearest first within each group. Each facility carries `specialty` tags and `relevance.tier` (0, 1, 2).
* `nearest_specialist`: if nothing in the list is a developmental fit, the closest one in the state (may be far), else `null`.
* **Specialty tags are guesses from facility names** (and OSM `healthcare:speciality`), not verified services. Only DEIC/RBSK rows you add by hand are authoritative.
* `suggestions`: always returned, even with zero facility data or an unknown PIN. National-programme routes (DEIC at the district hospital, paediatrics OPD, Anganwadi/ASHA for 0-5, school RBSK screening and child guidance for 6-12, helplines), each with a maps-search link built from the PIN's district and a state DEIC note. These are pathways, not named facilities. Show them under or instead of the facility list.
* The database schema gained a `specialty` column: re-run `python scripts/import_reference_data.py` after pulling this change.

## API response

```json
{
  "pin": "302031",
  "resolved": {"district": "Jaipur", "state": "Rajasthan", "lat": 26.89, "lng": 75.90, "approximate": false, "match": "exact"},
  "coverage": "nearby",                       // nearby (<=25 km) | district | state | none
  "facilities": [{"id": 1, "name": "...", "type": "DEIC", "km": 3.2, "phone": null, "address": "...", "source": "...", "verified_at": null}],
  "state_deic": {"state": "Rajasthan", "operational": 12, "source": "Rajya Sabha Session 262, AU 1065 B(ii)"},
  "helplines": [{"name": "Tele-MANAS", "number": "14416"}, {"name": "Childline", "number": "1098"}]
}
```

`approximate: true` means the PIN was missing from the directory or only has a district-level point; show "approximate location" in the UI. `coverage: "none"` means no facility data for that area: show `state_deic` and `helplines` instead of an empty list.

## Known limits

* PIN data is a Dec 2021 snapshot; newer PINs fall back to a prefix-based approximate location.
* 10 PINs (Lakshadweep 6825xx, one Manipur PIN) have no coordinates in the source and resolve approximately.
* Distances are straight-line (haversine), not road distance. Label them "about X km".
* OSM data is crowd-sourced and must carry the attribution "© OpenStreetMap contributors" (ODbL).
* The IndiaPIN repo's own licence file covers its code; the underlying post-office data is published by the Department of Posts. Check the terms before redistributing the CSV publicly.
* UP shows only 6 DEICs in the official count, which looks low for 75 districts; treat as the figure reported, not a verified truth.
