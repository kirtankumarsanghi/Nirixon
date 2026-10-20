"""Tests. The facility rows below are SYNTHETIC test fixtures (names are obviously fake) and are never shipped as data."""

import csv
import os
import subprocess
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # backend/
sys.path.insert(0, ROOT)
from app.core.find_help.service import (
    connect_readonly,
    find_facilities,
    haversine_km,
    resolve_pin,
)  # noqa: E402

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
]


def build_db(tmp_path, facilities):
    data = tmp_path / "data"
    (data / "facilities").mkdir(parents=True)
    for n in ("pincodes.csv", "deic_counts_by_state.csv"):
        (data / n).write_bytes(
            open(os.path.join(ROOT, "data", "find_help", n), "rb").read()
        )
    with open(data / "facilities" / "test.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for r in facilities:
            w.writerow({c: r.get(c, "") for c in COLS})
    out = tmp_path / "ref.sqlite"
    p = subprocess.run(
        [
            sys.executable,
            os.path.join(ROOT, "scripts", "find_help", "import_reference_data.py"),
            "--data",
            str(data),
            "--out",
            str(out),
            "--report",
            str(tmp_path / "cov.csv"),
        ],
        capture_output=True,
        text=True,
    )
    assert p.returncode == 0, p.stderr
    return str(out), p


def test_haversine_known_distance():
    assert (
        1130 < haversine_km(28.6139, 77.2090, 19.0760, 72.8777) < 1200
    )  # Delhi-Mumbai ~1150 km


def test_resolution_exact_and_prefix_and_unknown(tmp_path):
    db, _ = build_db(tmp_path, [])
    c = connect_readonly(db)
    jp = resolve_pin(c, "302001")
    assert (
        jp["district"].lower() == "jaipur"
        and not jp["approximate"]
        and 26.8 < jp["lat"] < 27.0
    )
    near = resolve_pin(
        c, "302099"
    )  # not a real PIN -> approximated from the 3/4-digit prefix
    assert near and near["approximate"] and near["state"] == "Rajasthan"
    assert resolve_pin(c, "999999") is None


def test_no_facilities_gives_state_deic_and_helplines_not_an_error(tmp_path):
    db, p = build_db(tmp_path, [])
    assert "no facilities loaded" in p.stderr
    r = find_facilities(connect_readonly(db), "560029")
    assert r["coverage"] == "none" and r["facilities"] == []
    assert r["state_deic"]["operational"] == 14 and {
        h["number"] for h in r["helplines"]
    } == {"14416", "1098"}


def test_fallback_levels_and_sorting(tmp_path):
    fx = [  # synthetic; lat/lng chosen around Jaipur (26.92, 75.82)
        {
            "name": "TEST Near Hospital",
            "type": "Hospital",
            "lat": "26.95",
            "lng": "75.80",
            "phone": "000",
        },
        {
            "name": "TEST Farther Hospital",
            "type": "Hospital",
            "lat": "27.05",
            "lng": "75.85",
        },
        {
            "name": "TEST Kota Hospital",
            "type": "Hospital",
            "lat": "25.18",
            "lng": "75.83",
        },
        {
            "name": "TEST Early Intervention Centre",
            "type": "",
            "lat": "26.90",
            "lng": "75.79",
        },
    ]
    db, _ = build_db(tmp_path, fx)
    c = connect_readonly(db)
    r = find_facilities(c, "302001")
    assert r["coverage"] == "nearby"
    kms = [f["km"] for f in r["facilities"]]
    assert kms == sorted(kms) and r["facilities"][0]["km"] < 6
    assert any(f["type"] == "DEIC" for f in r["facilities"])  # inferred from the name
    assert only_type(find_facilities(c, "302001", ["DEIC"]), "DEIC")
    # a PIN in Kota region: nothing within 25 km of Jaipur facilities, but Kota facility is nearby there
    k = find_facilities(c, "324001")
    assert (
        k["coverage"] == "nearby" and k["facilities"][0]["name"] == "TEST Kota Hospital"
    )
    # far-away place in the same state with no facility within 25 km -> district/state level fallback
    j = find_facilities(c, "345001")  # Jaisalmer
    assert j["coverage"] in ("district", "state") and j["facilities"]
    # another state with no facilities at all
    assert find_facilities(c, "781001")["coverage"] == "none"


def only_type(resp, t):
    return resp["facilities"] and all(f["type"] == t for f in resp["facilities"])


def test_importer_skips_bad_rows_and_dedupes(tmp_path):
    fx = [
        {"name": "", "lat": "26.9", "lng": "75.8"},  # no name
        {"name": "TEST A", "lat": "0", "lng": "0"},  # outside India
        {"name": "TEST B", "pin": "302001"},  # location from PIN
        {"name": "TEST B", "pin": "302001"},  # duplicate
        {"name": "TEST C", "pin": "000000"},  # unknown pin, no coords
    ]
    db, p = build_db(tmp_path, fx)
    import sqlite3

    n = sqlite3.connect(db).execute("select count(*) from facilities").fetchone()[0]
    assert n == 1
    for k in ("no name", "outside India", "duplicate", "no location"):
        assert k in p.stdout


def test_api_route(tmp_path, monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from app.core.find_help.router import router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    db, _ = build_db(
        tmp_path,
        [{"name": "TEST Hospital", "type": "Hospital", "lat": "26.95", "lng": "75.80"}],
    )
    monkeypatch.setenv("NIRIXON_REFERENCE_DB", db)
    app = FastAPI()
    app.include_router(router)
    c = TestClient(app)
    ok = c.get("/api/facilities", params={"pin": "302001"})
    assert ok.status_code == 200 and ok.json()["coverage"] == "nearby"
    assert c.get("/api/facilities", params={"pin": "12345"}).status_code == 422
    assert c.get("/api/facilities", params={"pin": "012345"}).status_code == 422
    assert (
        c.get("/api/facilities", params={"pin": "302001", "type": "Spa"}).status_code
        == 422
    )
    assert (
        c.get("/api/facilities", params={"pin": "302001", "limit": 99}).status_code
        == 422
    )
    assert (
        c.get("/api/facilities", params={"pin": "999999"}).json()["coverage"] == "none"
    )
    monkeypatch.setenv("NIRIXON_REFERENCE_DB", str(tmp_path / "missing.sqlite"))
    assert c.get("/api/facilities", params={"pin": "302001"}).status_code == 503


def test_osm_parser():
    sys.path.insert(0, os.path.join(ROOT, "scripts", "find_help"))
    from fetch_osm_facilities import rows_from_overpass

    payload = {
        "elements": [
            {
                "type": "node",
                "id": 1,
                "lat": 26.9,
                "lon": 75.8,
                "tags": {
                    "amenity": "hospital",
                    "name": "TEST H",
                    "phone": "+91 1; +91 2",
                    "addr:postcode": "302 001",
                },
            },
            {
                "type": "way",
                "id": 2,
                "center": {"lat": 26.8, "lon": 75.7},
                "tags": {"amenity": "clinic", "name": "TEST C"},
            },
            {
                "type": "node",
                "id": 3,
                "lat": 26.7,
                "lon": 75.6,
                "tags": {"amenity": "hospital"},
            },  # nameless: skipped
        ]
    }
    rows = list(rows_from_overpass(payload, "Rajasthan"))
    assert [r["name"] for r in rows] == ["TEST H", "TEST C"]
    assert (
        rows[0]["pin"] == "302001"
        and rows[0]["phone"] == "+91 1"
        and rows[1]["type"] == "Clinic"
    )
    assert rows[1]["lat"] == 26.8 and rows[0]["verified_at"] == ""


# ---- age-group / developmental ranking (synthetic fixtures) ----
JAIPUR_FX = [  # all around Jaipur (26.92, 75.82)
    {
        "name": "TEST General Clinic",
        "type": "Clinic",
        "lat": "26.921",
        "lng": "75.821",
    },  # ~0.2 km, general
    {
        "name": "TEST Child Guidance and Counselling Centre",
        "type": "Clinic",
        "lat": "26.95",
        "lng": "75.80",
    },  # mental_health
    {
        "name": "TEST Paediatric Hospital",
        "type": "Hospital",
        "lat": "26.93",
        "lng": "75.83",
    },  # pediatric
    {
        "name": "TEST District Hospital",
        "type": "",
        "lat": "26.90",
        "lng": "75.85",
    },  # referral
    {
        "name": "TEST Early Intervention Centre",
        "type": "",
        "lat": "26.99",
        "lng": "75.78",
    },  # DEIC, farther
]


def names(r):
    return [f["name"] for f in r["facilities"]]


def test_specialty_tags_and_age_group_ranking(tmp_path):
    db, _ = build_db(tmp_path, JAIPUR_FX)
    c = connect_readonly(db)
    plain = find_facilities(c, "302001")
    assert names(plain)[0] == "TEST General Clinic"  # no age group: pure distance
    a = find_facilities(c, "302001", age_group="0-5", result="refer")
    assert (
        names(a)[0] == "TEST Early Intervention Centre"
    )  # DEIC first despite being farther
    assert names(a).index("TEST Paediatric Hospital") < names(a).index(
        "TEST Child Guidance and Counselling Centre"
    )
    assert names(a)[-1] == "TEST General Clinic"
    assert a["facilities"][0]["relevance"]["tier"] == 0 and a["advice"]
    b = find_facilities(c, "302001", age_group="6-12")
    assert names(b).index("TEST Child Guidance and Counselling Centre") < names(
        b
    ).index("TEST Paediatric Hospital")
    assert (
        "mental_health"
        in next(f for f in b["facilities"] if "Guidance" in f["name"])["specialty"]
    )


def test_nearest_specialist_when_none_in_list(tmp_path):
    fx = [
        {
            "name": "TEST General Clinic",
            "type": "Clinic",
            "lat": "26.921",
            "lng": "75.821",
        },
        {
            "name": "TEST Early Intervention Centre",
            "type": "",
            "lat": "26.2",
            "lng": "73.0",
        },
    ]  # Jodhpur side, far
    db, _ = build_db(tmp_path, fx)
    r = find_facilities(connect_readonly(db), "302001", age_group="0-5")
    assert r["coverage"] == "nearby" and names(r) == ["TEST General Clinic"]
    assert (
        r["nearest_specialist"]["name"] == "TEST Early Intervention Centre"
        and r["nearest_specialist"]["km"] > 100
    )


def test_api_age_group_validation(tmp_path, monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from app.core.find_help.router import router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    db, _ = build_db(tmp_path, JAIPUR_FX)
    monkeypatch.setenv("NIRIXON_REFERENCE_DB", db)
    app = FastAPI()
    app.include_router(router)
    c = TestClient(app)
    ok = c.get(
        "/api/facilities",
        params={"pin": "302001", "age_group": "0-5", "result": "refer"},
    ).json()
    assert (
        ok["age_group"] == "0-5"
        and ok["facilities"][0]["name"] == "TEST Early Intervention Centre"
    )
    assert (
        c.get(
            "/api/facilities", params={"pin": "302001", "age_group": "13-18"}
        ).status_code
        == 422
    )
    assert (
        c.get("/api/facilities", params={"pin": "302001", "result": "bad"}).status_code
        == 422
    )


def test_suggestions_always_present(tmp_path):
    db, _ = build_db(tmp_path, [])  # no facilities loaded at all
    c = connect_readonly(db)
    r = find_facilities(c, "302001", age_group="0-5")
    assert r["coverage"] == "none" and r["facilities"] == []
    ids = [x["id"] for x in r["suggestions"]]
    assert "deic" in ids and "anganwadi" in ids and "helplines" in ids
    assert (
        "Jaipur" in r["suggestions"][0]["maps_url"]
        and "Rajasthan" in r["suggestions"][0]["note"]
    )
    assert "school" in [
        x["id"] for x in find_facilities(c, "302001", age_group="6-12")["suggestions"]
    ]
    assert find_facilities(c, "999999")[
        "suggestions"
    ]  # unknown PIN still gets guidance


def test_government_csv_adapter(tmp_path):
    src = tmp_path / "dir.csv"
    src.write_text(
        "Hospital Name,Latitude,Longitude,Pincode,Hospital Category,Telephone\n"
        "TEST Civil Hosp,75.80,26.95,302001,District Hospital,0141-000\n"  # lat/lng swapped
        "TEST Community Centre,26.90,75.79,,Community Health Centre,\n",
        encoding="utf-8",
    )
    subprocess.run(
        [
            sys.executable,
            os.path.join(ROOT, "scripts", "find_help", "import_government_csv.py"),
            str(src),
            "--out",
            str(tmp_path / "gov.csv"),
        ],
        check=True,
        capture_output=True,
    )
    rows = list(csv.DictReader(open(tmp_path / "gov.csv")))
    assert (
        rows[0]["type"] == "District Hospital"
        and float(rows[0]["lat"]) == 26.95
        and rows[0]["pin"] == "302001"
    )
    assert rows[1]["type"] == "CHC" and rows[1]["verified_at"] == ""
    db, _ = build_db(tmp_path, [dict(r) for r in rows])
    assert {
        f["type"] for f in find_facilities(connect_readonly(db), "302001")["facilities"]
    } == {"District Hospital", "CHC"}


# ---- provenance / trust (synthetic fixtures) ----

# The clinic is much closer; the official centre is farther. Distance alone would
# rank the clinic first, which is exactly the behaviour this model is meant to fix.
TRUST_FX = [
    {
        "name": "TEST Unverified Clinic",
        "type": "Clinic",
        "lat": "26.921",
        "lng": "75.821",
    },
    {
        "name": "TEST Early Intervention Centre",
        "type": "",
        "lat": "26.99",
        "lng": "75.78",
        "operator_type": "government",
        "phone": "0141-0000000",
    },
]


def test_trust_derived_from_provenance_not_from_the_name(tmp_path):
    """A crowd-sourced row is unverified even when its name reads like a district hospital."""
    import sqlite3

    fx = [
        {
            "name": "TEST Mapped Hospital",
            "type": "Hospital",
            "lat": "26.95",
            "lng": "75.80",
        },
        {
            "name": "TEST Confirmed Clinic",
            "type": "Clinic",
            "lat": "26.94",
            "lng": "75.81",
            "verified_at": "2026-03-20",
            "verified_by": "Nirixon reviewer",
        },
        {
            "name": "TEST Govt District Hospital",
            "type": "District Hospital",
            "lat": "26.93",
            "lng": "75.82",
            "operator_type": "government",
        },
        {
            "name": "TEST Mapped District Hospital",
            "type": "District Hospital",
            "lat": "26.92",
            "lng": "75.83",
        },
        {
            # OSM carries operator:type=government, but the record itself is
            # crowd-sourced: it must NOT be promoted to official.
            "name": "TEST OSM Govt Hospital",
            "type": "Hospital",
            "lat": "26.91",
            "lng": "75.84",
            "operator_type": "government",
            "source": "OpenStreetMap (ODbL)",
        },
    ]
    db, _ = build_db(tmp_path, fx)
    levels = dict(
        sqlite3.connect(db).execute("SELECT name, trust FROM facilities").fetchall()
    )
    assert levels["TEST Mapped Hospital"] == "unverified"
    assert levels["TEST Confirmed Clinic"] == "verified"
    assert levels["TEST Govt District Hospital"] == "official"
    assert (
        levels["TEST Mapped District Hospital"] == "unverified"
    )  # name does not upgrade it
    # A crowd-sourced record's own operator tag cannot upgrade it either.
    assert levels["TEST OSM Govt Hospital"] == "unverified"


def test_official_listing_outranks_a_closer_mapped_clinic(tmp_path):
    db, _ = build_db(tmp_path, TRUST_FX)
    c = connect_readonly(db)
    # No screening context: plain nearest-first is unchanged.
    assert names(find_facilities(c, "302001"))[0] == "TEST Unverified Clinic"
    # Screening context: provenance comes first.
    a = find_facilities(c, "302001", age_group="0-5", result="refer")
    assert names(a)[0] == "TEST Early Intervention Centre"
    assert a["facilities"][0]["trust"]["level"] == "official"
    assert a["facilities"][-1]["trust"]["level"] == "unverified"
    assert a["trust_summary"] == {"official": 1, "unverified": 1}
    assert "call before travelling" in a["trust_note"]


def test_verified_only_drops_mapped_listings(tmp_path):
    db, _ = build_db(tmp_path, TRUST_FX)
    c = connect_readonly(db)
    only = find_facilities(c, "302001", age_group="0-5", verified_only=True)
    assert names(only) == ["TEST Early Intervention Centre"]
    assert only["verified_only"] is True
    assert only["trust_summary"] == {"official": 1}


def test_reference_db_without_trust_column_still_works(tmp_path):
    """An already-built reference DB keeps working: trust is derived from verified_at."""
    import sqlite3

    db, _ = build_db(
        tmp_path,
        [
            {
                "name": "TEST Confirmed Clinic",
                "type": "Clinic",
                "lat": "26.94",
                "lng": "75.81",
                "verified_at": "2026-03-20",
            },
            {
                "name": "TEST Mapped Clinic",
                "type": "Clinic",
                "lat": "26.95",
                "lng": "75.82",
            },
        ],
    )
    con = sqlite3.connect(db)
    con.executescript(
        "CREATE TABLE facilities_old AS SELECT id,name,type,address,state,district,pin,lat,lng,"
        "phone,operator_type,source,source_id,verified_at,specialty FROM facilities;"
        "DROP TABLE facilities;"
        "ALTER TABLE facilities_old RENAME TO facilities;"
    )
    con.commit()
    con.close()
    r = find_facilities(connect_readonly(db), "302001", age_group="0-5")
    levels = {f["name"]: f["trust"]["level"] for f in r["facilities"]}
    assert levels["TEST Confirmed Clinic"] == "verified"
    assert levels["TEST Mapped Clinic"] == "unverified"


def test_api_verified_only_param(tmp_path, monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from app.core.find_help.router import router
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    db, _ = build_db(tmp_path, TRUST_FX)
    monkeypatch.setenv("NIRIXON_REFERENCE_DB", db)
    app = FastAPI()
    app.include_router(router)
    c = TestClient(app)
    allr = c.get("/api/facilities", params={"pin": "302001"}).json()
    assert len(allr["facilities"]) == 2 and allr["trust_summary"]
    filt = c.get(
        "/api/facilities", params={"pin": "302001", "verified_only": "true"}
    ).json()
    assert [f["name"] for f in filt["facilities"]] == ["TEST Early Intervention Centre"]
    assert filt["verified_only"] is True


def test_mohfw_arcgis_rows_map_to_official_facilities():
    """The government-directory extractor is pure/offline: no network in this test."""
    sys.path.insert(0, os.path.join(ROOT, "scripts", "find_help"))
    from import_mohfw_arcgis import to_row

    feature = {
        "attributes": {
            "objectid": 7,
            "facilityname": "Uthangarai",
            "facilitytype": "Community Health Centre",
            "landline": "04341-222043",
            "address": "Government Hospital, Uthangarai",
            "street": "",
            "landmark": "",
            "locality": "",
            "subdistrict": "Uthangarai",
            "district": "Krishnagiri",
            "state": "Tamil Nadu",
            "posatalcode": "635207",
        },
        "geometry": {"x": 78.535451, "y": 12.266359},
    }
    row = to_row(feature)
    assert row is not None
    # A bare place name gains its designation so a caregiver can read it.
    assert row["name"] == "Uthangarai Community Health Centre"
    assert row["type"] == "CHC"
    assert row["pin"] == "635207" and row["phone"] == "04341-222043"
    assert row["operator_type"] == "government"
    assert "MoHFW" in row["source"]
    # Published directory, NOT a human-verified record.
    assert row["verified_at"] == "" and row["verified_by"] == ""

    # Maternal & child-health facilities are tagged for the 0-5 ranking.
    feature["attributes"].update(
        {"facilitytype": "Maternity Home", "facilityname": "TEST Maternity"}
    )
    assert to_row(feature)["specialty"] == "pediatric"

    # Missing name or geometry is skipped, never invented.
    assert to_row({"attributes": {}, "geometry": {}}) is None
