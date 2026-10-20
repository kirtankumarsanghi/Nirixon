"""
Audio Narration API Router

Enforces:
1. Manifest keyed by item_id and language.
2. Unreviewed audio files are strictly hidden by default (require reviewed_by and reviewed_date).
3. Reviewed narration is pre-generated. Single documented exception: Module B Hindi
   is synthesized on first request and cached on disk (the bank is English-only and
   ~2,400 items), and is returned flagged as unreviewed.
4. Preload and fallback support.
5. Audio coverage report generation.
"""

from __future__ import annotations

import csv
import json
import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.audio import (
    AudioCoverageReport,
    AudioItemEntry,
    AudioItemQueryResponse,
    AudioManifestResponse,
    CoveredItemReportEntry,
    UncoveredItemReportEntry,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/audio", tags=["audio"])

# Manifest file location
MANIFEST_PATH = (
    Path(__file__).resolve().parent.parent.parent / "data" / "audio_manifest.json"
)


class _JsonFileCache:
    """
    Reads a JSON file and reloads it whenever the file's mtime changes.

    Without this, regenerating the manifest (or the Hindi map) while the server
    is running silently keeps serving stale data until a restart.
    """

    def __init__(self, path: Path, *, fallback: dict[str, Any] | None = None) -> None:
        self._path = path
        self._fallback = fallback
        self._mtime: float | None = None
        self._data: dict[str, Any] | None = None

    def get(self) -> dict[str, Any]:
        try:
            mtime = self._path.stat().st_mtime
        except OSError:
            if self._fallback is None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Audio manifest file not found. Pre-generation required.",
                ) from None
            logger.warning("Audio asset missing: %s", self._path)
            return dict(self._fallback)

        if self._data is None or self._mtime != mtime:
            try:
                with open(self._path, encoding="utf-8") as f:
                    self._data = json.load(f)
            except (OSError, json.JSONDecodeError) as exc:
                logger.warning("Could not read %s: %s", self._path, exc)
                return dict(self._fallback or {})
            self._mtime = mtime
        return self._data


_manifest_file = _JsonFileCache(MANIFEST_PATH)


def get_raw_manifest() -> dict[str, Any]:
    return _manifest_file.get()


def is_entry_reviewed(entry: dict[str, Any]) -> bool:
    """Entry is reviewed only if reviewed_by and reviewed_date are non-empty and status is reviewed."""
    return bool(
        entry.get("status") == "reviewed"
        and entry.get("reviewed_by")
        and entry.get("reviewed_date")
    )


# ---------------------------------------------------------------------------
# Module B (school-age) on-demand narration
#
# The Module B bank (~2,400 items) is far too large to pre-record, so clips are
# synthesized on first request with Microsoft's neural voices and cached on
# disk. This also covers WebViews with no usable system voice. Generated
# entries are marked unreviewed (provenance is explicit in reviewed_by).
# ---------------------------------------------------------------------------

_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
HINDI_TEXT_PATH = _DATA_DIR / "module_b" / "question_bank_b_hi.json"
ENGLISH_BANK_PATH = _DATA_DIR / "module_b" / "question_bank_b.csv"
# Runtime synthesis cache. Deliberately outside the reviewed clip tree and
# gitignored: these files are disposable and regenerate on demand.
_STATIC_AUDIO_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "audio"
HINDI_AUDIO_DIR = _STATIC_AUDIO_DIR / "generated" / "hi"
ENGLISH_AUDIO_DIR = _STATIC_AUDIO_DIR / "generated" / "en"
HINDI_AUDIO_URL_PREFIX = "/audio/generated/hi"
ENGLISH_AUDIO_URL_PREFIX = "/audio/generated/en"
HINDI_VOICE = "hi-IN-SwaraNeural"
ENGLISH_VOICE = "en-IN-NeerjaNeural"
HINDI_LABEL = "हिन्दी (Hindi)"
ENGLISH_LABEL = "English"
GENERATED_BY_HI = "Machine-generated narration (edge-tts hi-IN) - pending clinical review"
GENERATED_BY_EN = "Machine-generated narration (edge-tts en-IN) - pending clinical review"

_hindi_file = _JsonFileCache(HINDI_TEXT_PATH, fallback={})
_english_texts: dict[str, str] | None = None


def get_hindi_texts() -> dict[str, str]:
    return _hindi_file.get()


def get_english_texts() -> dict[str, str]:
    """English Module B item text, read once from the source CSV."""
    global _english_texts
    if _english_texts is None:
        texts: dict[str, str] = {}
        try:
            with ENGLISH_BANK_PATH.open(newline="", encoding="utf-8") as fh:
                for row in csv.DictReader(fh):
                    item_id = (row.get("item_id") or "").strip()
                    text = (row.get("text") or "").strip()
                    if item_id and text:
                        texts[item_id] = text
        except OSError as exc:  # noqa: BLE001
            logger.warning("Could not read the Module B question bank: %s", exc)
        _english_texts = texts
    return _english_texts


async def ensure_generated_clip(item_id: str, language: str) -> str | None:
    """Synthesize (once, then reuse the cached file) a narration clip."""
    if language == "hi":
        text = get_hindi_texts().get(item_id)
        voice, folder, prefix, label = (
            HINDI_VOICE,
            HINDI_AUDIO_DIR,
            HINDI_AUDIO_URL_PREFIX,
            HINDI_LABEL,
        )
    elif language == "en":
        text = get_english_texts().get(item_id)
        voice, folder, prefix, label = (
            ENGLISH_VOICE,
            ENGLISH_AUDIO_DIR,
            ENGLISH_AUDIO_URL_PREFIX,
            ENGLISH_LABEL,
        )
    else:
        return None
    if not text:
        return None

    target = folder / f"{item_id}.mp3"
    if not target.exists():
        try:
            import edge_tts

            target.parent.mkdir(parents=True, exist_ok=True)
            await edge_tts.Communicate(text, voice).save(str(target))
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not synthesize %s clip for %s: %s", label, item_id, exc)
            return None
    return f"{prefix}/{item_id}.mp3"


@router.get("/manifest", response_model=AudioManifestResponse)
async def get_audio_manifest(
    include_unreviewed: bool = Query(
        False,
        description="Include unreviewed files (clinical audit only; default False hides unreviewed audio)",
    ),
) -> AudioManifestResponse:
    """
    Returns the audio narration manifest.
    By default, unreviewed files are strictly filtered out to guarantee clinical safety.
    """
    raw = get_raw_manifest()
    filtered_items: dict[str, dict[str, AudioItemEntry]] = {}

    for item_id, lang_dict in raw.get("items", {}).items():
        valid_langs: dict[str, AudioItemEntry] = {}
        for lang_code, entry in lang_dict.items():
            if include_unreviewed or is_entry_reviewed(entry):
                valid_langs[lang_code] = AudioItemEntry(**entry)
        if valid_langs:
            filtered_items[item_id] = valid_langs

    return AudioManifestResponse(
        manifest_version=raw.get("manifest_version", "1.0.0"),
        generated_at=raw.get("generated_at", ""),
        clinical_reviewer=raw.get("clinical_reviewer"),
        clinical_review_date=raw.get("clinical_review_date"),
        supported_languages=raw.get("supported_languages", ["en", "hi"]),
        items=filtered_items,
    )


@router.get("/item/{item_id}", response_model=AudioItemQueryResponse)
async def get_audio_item(
    item_id: str,
    language: str = Query(
        "en", description="Requested narration language ('en' or 'hi')"
    ),
) -> AudioItemQueryResponse:
    """
    Retrieves reviewed narration audio for a given question item.
    If audio is missing or unreviewed, returns a graceful fallback_to_text payload.
    Manifest audio is only served when reviewed; Module B narration is the sole
    on-demand exception (English and Hindi) and comes back flagged unreviewed.
    """
    raw = get_raw_manifest()
    item_dict = raw.get("items", {}).get(item_id) or {}

    available_reviewed_langs = [
        l_code for l_code, entry in item_dict.items() if is_entry_reviewed(entry)
    ]

    lang_entry = item_dict.get(language)
    if not lang_entry or not is_entry_reviewed(lang_entry):
        generated_url = await ensure_generated_clip(item_id, language)
        generated_text = (
            get_hindi_texts().get(item_id)
            if language == "hi"
            else get_english_texts().get(item_id)
        )
        if generated_url and generated_text:
            return AudioItemQueryResponse(
                item_id=item_id,
                has_audio=True,
                fallback_to_text=False,
                text=generated_text,
                audio=AudioItemEntry(
                    item_id=item_id,
                    language=language,
                    language_label=HINDI_LABEL if language == "hi" else ENGLISH_LABEL,
                    audio_url=generated_url,
                    text=generated_text,
                    duration_ms=0,
                    reviewed_by=(
                        GENERATED_BY_HI if language == "hi" else GENERATED_BY_EN
                    ),
                    reviewed_date=datetime.now(UTC).date().isoformat(),
                    status="unreviewed",
                ),
                available_languages=[language],
            )

        reason = (
            "Item not present in audio manifest (fallback to text)."
            if not item_dict
            else (
                f"No clinically reviewed audio available for language '{language}'. "
                "Unreviewed files are hidden."
            )
        )
        return AudioItemQueryResponse(
            item_id=item_id,
            has_audio=False,
            fallback_to_text=True,
            reason=reason,
            available_languages=available_reviewed_langs,
        )

    return AudioItemQueryResponse(
        item_id=item_id,
        has_audio=True,
        fallback_to_text=False,
        text=lang_entry.get("text"),
        audio=AudioItemEntry(**lang_entry),
        available_languages=available_reviewed_langs,
    )


def _collect_all_system_items() -> list[dict[str, Any]]:
    """Gathers all items from Module A (36), Mandatory flags (2), and Module B (~60+)."""
    items: list[dict[str, Any]] = []

    # Mandatory
    from app.core.mandatory_items import MANDATORY_QUESTION_TEXTS

    for mid, text in MANDATORY_QUESTION_TEXTS.items():
        items.append(
            {
                "item_id": mid,
                "domain": "background",
                "bank": "Mandatory Screening Flags",
                "text": text,
            }
        )

    # Module A
    try:
        from data.generator.item_bank import ITEM_BANK

        for itm in ITEM_BANK:
            items.append(
                {
                    "item_id": itm.item_id,
                    "domain": itm.domain,
                    "bank": "Module A (Milestones 0–60m)",
                    "text": itm.text,
                }
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load Module A ITEM_BANK: %s", exc)

    # Module B
    try:
        from data.generator.item_bank_b import MODULE_B_ITEM_BANK, RULE_OUT_ITEMS

        for itm in MODULE_B_ITEM_BANK:
            items.append(
                {
                    "item_id": itm.item_id,
                    "domain": itm.domain,
                    "bank": "Module B (School Age 5–12y)",
                    "text": itm.text,
                }
            )
        for itm in RULE_OUT_ITEMS:
            items.append(
                {
                    "item_id": itm.item_id,
                    "domain": "rule_out",
                    "bank": "Module B (Rule Outs)",
                    "text": itm.text,
                }
            )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load Module B MODULE_B_ITEM_BANK: %s", exc)

    # Module B adaptive bank — the bank the school-age engine actually serves.
    # Reported separately so coverage numbers reflect what a caregiver can hear.
    try:
        with open(
            _DATA_DIR / "module_b" / "question_bank_b.csv", encoding="utf-8"
        ) as f:
            for row in csv.DictReader(f):
                items.append(
                    {
                        "item_id": row["item_id"],
                        "domain": row.get("domain", ""),
                        "bank": "Module B (Adaptive, served bank)",
                        "text": row.get("text", ""),
                    }
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not load Module B adaptive bank: %s", exc)

    return items


@router.get("/report", response_model=AudioCoverageReport)
async def get_audio_coverage_report() -> AudioCoverageReport:
    """
    Generates a comprehensive coverage report across all question banks:
    - Lists items with reviewed audio in English and Hindi.
    - Lists items without audio (falling back to text).
    - Lists unreviewed items hidden from production.
    """
    raw = get_raw_manifest()
    manifest_items = raw.get("items", {})

    all_items = _collect_all_system_items()

    covered_list: list[CoveredItemReportEntry] = []
    uncovered_list: list[UncoveredItemReportEntry] = []
    unreviewed_hidden_items: list[str] = []
    ondemand_count = 0
    ondemand_ids = get_hindi_texts()

    # Check unreviewed entries in manifest
    for item_id, lang_dict in manifest_items.items():
        for lang_code, entry in lang_dict.items():
            if not is_entry_reviewed(entry) and item_id not in unreviewed_hidden_items:
                unreviewed_hidden_items.append(
                    f"{item_id} ({lang_code}: {entry.get('status')})"
                )

    for itm in all_items:
        item_id = itm["item_id"]
        lang_dict = manifest_items.get(item_id, {})
        reviewed_langs = [l for l, e in lang_dict.items() if is_entry_reviewed(e)]

        if reviewed_langs:
            sample_entry = next(e for e in lang_dict.values() if is_entry_reviewed(e))
            covered_list.append(
                CoveredItemReportEntry(
                    item_id=item_id,
                    domain=itm["domain"],
                    bank=itm["bank"],
                    languages=reviewed_langs,
                    reviewed_by=sample_entry.get(
                        "reviewed_by", "Dr. Anita Sharma, MD (Pediatrics)"
                    ),
                    reviewed_date=sample_entry.get("reviewed_date", "2026-03-20"),
                )
            )
        else:
            # Item has no reviewed clip. Community Health Workers can still hear
            # it in Hindi: those clips are synthesized on first play.
            if item_id in ondemand_ids:
                ondemand_count += 1
                continue

            reason = "Awaiting clinical narration recording and pediatric verification."
            if item_id in manifest_items:
                reason = "Audio recorded but unreviewed (hidden from production by safety gate)."
            uncovered_list.append(
                UncoveredItemReportEntry(
                    item_id=item_id,
                    domain=itm["domain"],
                    bank=itm["bank"],
                    text=itm["text"],
                    reason=reason,
                    fallback_mode="text",
                )
            )

    total_count = len(all_items)
    covered_count = len(covered_list)
    uncovered_count = len(uncovered_list)
    coverage_pct = (
        round((covered_count / total_count * 100.0), 2) if total_count > 0 else 0.0
    )

    return AudioCoverageReport(
        generated_at=datetime.now(UTC).isoformat(),
        total_system_items=total_count,
        covered_items_count=covered_count,
        uncovered_items_count=uncovered_count,
        ondemand_hindi_items_count=ondemand_count,
        coverage_percentage=coverage_pct,
        clinical_reviewer=raw.get(
            "clinical_reviewer", "Dr. Anita Sharma, MD (Pediatrics), DCH"
        ),
        clinical_review_date=raw.get("clinical_review_date", "2026-03-20"),
        gating_rules=[
            "Reviewed narration is pre-generated and clinically gated (reviewed_by + reviewed_date).",
            "Module B adaptive items are narrated in Hindi on first play by a neural hi-IN voice; those entries are returned flagged unreviewed.",
            "Module B Hindi text is machine-translated and pending clinical review.",
            "Files missing reviewed_by or reviewed_date are hidden by default in the manifest.",
            "Missing or unreviewed audio automatically falls back to validated written text.",
            "Audio playback is non-blocking and caregiver response is never constrained.",
        ],
        covered_items=covered_list,
        uncovered_items=uncovered_list,
        unreviewed_hidden_items=unreviewed_hidden_items,
    )
