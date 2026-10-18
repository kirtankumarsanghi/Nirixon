"""
Acceptance Tests for Audio Narration & Clinical Verification Gating.

Checks:
1. Every item id in the system has a reviewed audio file OR a text fallback.
2. Unreviewed audio files are strictly hidden by default and never served.
3. Pre-generated audio files exist on disk in English and Hindi.
4. Report lists all items without audio with text fallback status.
5. Static audio files are served cleanly over HTTP.
"""

from __future__ import annotations

from pathlib import Path

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_every_item_has_reviewed_audio_or_text_fallback():
    """
    Acceptance Check 1:
    Every item id across all banks has either a clinically reviewed audio file OR a text fallback.
    """
    report_res = client.get("/api/audio/report")
    assert report_res.status_code == 200
    report = report_res.json()

    assert report["total_system_items"] > 0
    assert (
        report["covered_items_count"] + report["uncovered_items_count"]
        == report["total_system_items"]
    )

    # Verify covered items have valid reviewed metadata
    for item in report["covered_items"]:
        item_id = item["item_id"]
        # Check query for English
        en_res = client.get(f"/api/audio/item/{item_id}?language=en")
        assert en_res.status_code == 200
        en_data = en_res.json()
        assert en_data["has_audio"] is True
        assert en_data["fallback_to_text"] is False
        assert en_data["audio"]["reviewed_by"] is not None
        assert en_data["audio"]["reviewed_date"] is not None
        assert en_data["audio"]["status"] == "reviewed"

        # Check query for Hindi
        hi_res = client.get(f"/api/audio/item/{item_id}?language=hi")
        assert hi_res.status_code == 200
        hi_data = hi_res.json()
        assert hi_data["has_audio"] is True
        assert hi_data["fallback_to_text"] is False
        assert hi_data["audio"]["status"] == "reviewed"

    # Verify uncovered items fall back to text
    for item in report["uncovered_items"]:
        item_id = item["item_id"]
        res = client.get(f"/api/audio/item/{item_id}")
        assert res.status_code == 200
        data = res.json()
        assert data["has_audio"] is False
        assert data["fallback_to_text"] is True
        assert (
            "fallback" in data["reason"].lower()
            or "not present" in data["reason"].lower()
        )


def test_unreviewed_audio_is_never_served():
    """
    Acceptance Check 2:
    Manifest fields reviewed_by and reviewed_date. Unreviewed files are hidden by default.
    """
    # 1. Default manifest query omits unreviewed items
    manifest_res = client.get("/api/audio/manifest")
    assert manifest_res.status_code == 200
    manifest = manifest_res.json()

    assert "UNREV01" not in manifest["items"]

    # All items in default manifest must have reviewed_by and reviewed_date
    for item_id, lang_dict in manifest["items"].items():
        for lang, entry in lang_dict.items():
            assert entry["reviewed_by"] is not None and len(entry["reviewed_by"]) > 0
            assert (
                entry["reviewed_date"] is not None and len(entry["reviewed_date"]) > 0
            )
            assert entry["status"] == "reviewed"

    # 2. Direct query for unreviewed item must return fallback_to_text = True and has_audio = False
    unrev_res = client.get("/api/audio/item/UNREV01?language=en")
    assert unrev_res.status_code == 200
    unrev_data = unrev_res.json()
    assert unrev_data["has_audio"] is False
    assert unrev_data["fallback_to_text"] is True
    assert "unreviewed" in unrev_data["reason"].lower()

    # 3. Only explicit audit flag includes unreviewed in the manifest
    audit_res = client.get("/api/audio/manifest?include_unreviewed=true")
    assert audit_res.status_code == 200
    audit_manifest = audit_res.json()
    assert "UNREV01" in audit_manifest["items"]


def test_audio_coverage_report_lists_items_without_audio():
    """
    Acceptance Check 3:
    A report listing items without audio.
    """
    res = client.get("/api/audio/report")
    assert res.status_code == 200
    data = res.json()

    assert "uncovered_items" in data
    assert (
        len(data["uncovered_items"]) == 60
    )  # All Module B school-age items pending review

    # Spot check Module B items are listed in uncovered with reasons
    uncovered_ids = [u["item_id"] for u in data["uncovered_items"]]
    assert "AT01" in uncovered_ids
    assert "RD01" in uncovered_ids
    assert "RO01" in uncovered_ids

    for u in data["uncovered_items"]:
        assert u["fallback_mode"] == "text"
        assert len(u["reason"]) > 0
        assert len(u["text"]) > 0


def test_pregenerated_audio_files_exist_and_are_served():
    """
    Acceptance Check 4:
    Audio files are pre-generated on disk and served as static audio assets.
    """
    repo_root = Path(__file__).resolve().parent.parent.parent
    fe_audio_en = repo_root / "frontend" / "public" / "audio" / "narration" / "en"
    fe_audio_hi = repo_root / "frontend" / "public" / "audio" / "narration" / "hi"

    assert fe_audio_en.exists()
    assert fe_audio_hi.exists()

    # Check GM01 narration exists and has non-zero size
    gm01_en = fe_audio_en / "GM01.mp3"
    gm01_hi = fe_audio_hi / "GM01.mp3"
    assert gm01_en.exists()
    assert gm01_hi.exists()
    assert gm01_en.stat().st_size > 10000
    assert gm01_hi.stat().st_size > 10000

    # Test static files serving via backend mount
    res_en = client.get("/audio/narration/en/GM01.mp3")
    assert res_en.status_code == 200
    assert res_en.headers.get("content-type") in ("audio/mpeg", "audio/mp3")

    res_hi = client.get("/audio/narration/hi/GM01.mp3")
    assert res_hi.status_code == 200
    assert res_hi.headers.get("content-type") in ("audio/mpeg", "audio/mp3")
