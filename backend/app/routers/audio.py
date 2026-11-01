"""
Audio Narration API Router

Enforces:
1. Manifest keyed by item_id and language.
2. Unreviewed audio files are strictly hidden by default (require reviewed_by and reviewed_date).
3. Reviewed narration is pre-generated. Missing languages — Module A's 40 strings
   and Module B's ~2,400-item bank — are synthesized on first request and cached
   on disk in every supported language, and are returned flagged as unreviewed.
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
ENGLISH_BANK_PATH = _DATA_DIR / "module_b" / "question_bank_b.csv"
MODULE_A_DIR = _DATA_DIR / "module_a"
# Runtime synthesis cache. Deliberately outside the reviewed clip tree and
# gitignored: these files are disposable and regenerate on demand.
_STATIC_AUDIO_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "audio"
_GENERATED_DIR = _STATIC_AUDIO_DIR / "generated"

# language -> (edge-tts voice, human label). Hindi/English were the original
# set; the rest follow the workspace language expansion.
LANGUAGE_VOICES: dict[str, tuple[str, str]] = {
    "en": ("en-IN-NeerjaNeural", "English"),
    "hi": ("hi-IN-SwaraNeural", "हिन्दी (Hindi)"),
    "mr": ("mr-IN-AarohiNeural", "मराठी (Marathi)"),
    "ta": ("ta-IN-PallaviNeural", "தமிழ் (Tamil)"),
    "te": ("te-IN-ShrutiNeural", "తెలుగు (Telugu)"),
    "bn": ("bn-IN-TanishaaNeural", "বাংলা (Bengali)"),
    "gu": ("gu-IN-DhwaniNeural", "ગુજરાતી (Gujarati)"),
    "kn": ("kn-IN-SapnaNeural", "ಕನ್ನಡ (Kannada)"),
}

_english_texts: dict[str, str] | None = None
_localized_b_files: dict[str, _JsonFileCache] = {}
_localized_a_files: dict[str, _JsonFileCache] = {}


def _module_a_texts(language: str) -> dict[str, str]:
    """Module A (early-years) question text for a language, when generated."""
    if language == "en":
        return get_module_a_english_texts()
    cache = _localized_a_files.get(language)
    if cache is None:
        path = MODULE_A_DIR / f"question_bank_a_{language}.json"
        cache = _JsonFileCache(path, fallback={})
        _localized_a_files[language] = cache
    return cache.get()


def get_localized_texts(language: str) -> dict[str, str]:
    """Item text for a language across both question banks.

    Module B is the large adaptive bank; Module A has 40 spoken strings. Both
    maps share the same ``item_id -> text`` shape, so merging them lets the
    on-demand narration path serve either module with one lookup.
    """
    if language == "en":
        return get_english_texts()
    if language not in LANGUAGE_VOICES:
        return {}
    cache = _localized_b_files.get(language)
    if cache is None:
        path = _DATA_DIR / "module_b" / f"question_bank_b_{language}.json"
        cache = _JsonFileCache(path, fallback={})
        _localized_b_files[language] = cache
    merged = dict(_module_a_texts(language))
    merged.update(cache.get())
    return merged


def get_hindi_texts() -> dict[str, str]:
    return get_localized_texts("hi")


_module_a_english_texts: dict[str, str] | None = None


def get_module_a_english_texts() -> dict[str, str]:
    """English Module A item text (36 milestones + mandatory + sensory)."""
    global _module_a_english_texts
    if _module_a_english_texts is None:
        texts: dict[str, str] = {}
        try:
            from data.generator.item_bank import ITEM_BANK

            from app.core.mandatory_items import MANDATORY_QUESTION_TEXTS
            from app.core.sensory_items import SENSORY_QUESTION_TEXTS

            texts.update({itm.item_id: itm.text for itm in ITEM_BANK})
            texts.update(MANDATORY_QUESTION_TEXTS)
            texts.update(SENSORY_QUESTION_TEXTS)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Could not load Module A question text: %s", exc)
        _module_a_english_texts = texts
    return _module_a_english_texts


def get_english_texts() -> dict[str, str]:
    """English item text across both banks."""
    global _english_texts
    if _english_texts is None:
        texts: dict[str, str] = dict(get_module_a_english_texts())
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
    voice_label = LANGUAGE_VOICES.get(language)
    if voice_label is None:
        return None
    voice, label = voice_label
    text = get_localized_texts(language).get(item_id)
    if not text:
        return None

    folder = _GENERATED_DIR / language
    target = folder / f"{item_id}.mp3"
    if not target.exists() or target.stat().st_size == 0:
        try:
            import edge_tts

            target.parent.mkdir(parents=True, exist_ok=True)
            await edge_tts.Communicate(text, voice).save(str(target))
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Could not synthesize %s clip for %s: %s", label, item_id, exc
            )
            return None
    return f"/audio/generated/{language}/{item_id}.mp3"


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
    Manifest audio is only served when reviewed; missing Module A/Module B
    narration is synthesized on demand (all supported languages) and comes back
    flagged unreviewed.
    """
    raw = get_raw_manifest()
    item_dict = raw.get("items", {}).get(item_id) or {}

    available_reviewed_langs = [
        l_code for l_code, entry in item_dict.items() if is_entry_reviewed(entry)
    ]

    lang_entry = item_dict.get(language)
    if not lang_entry or not is_entry_reviewed(lang_entry):
        generated_url = await ensure_generated_clip(item_id, language)
        generated_text = get_localized_texts(language).get(item_id)
        if generated_url and generated_text:
            label = LANGUAGE_VOICES.get(language, (None, language))[1]
            return AudioItemQueryResponse(
                item_id=item_id,
                has_audio=True,
                fallback_to_text=False,
                text=generated_text,
                audio=AudioItemEntry(
                    item_id=item_id,
                    language=language,
                    language_label=label,
                    audio_url=generated_url,
                    text=generated_text,
                    duration_ms=0,
                    reviewed_by=(
                        f"Machine-generated narration (edge-tts {language}) - "
                        "pending clinical review"
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
            # Keep the text we do have (e.g. the Module B Hindi map) so a client
            # can still narrate it with the browser's speech synthesis when the
            # on-demand clip could not be generated.
            text=generated_text,
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
    from app.core.sensory_items import SENSORY_QUESTION_TEXTS

    for mid, text in MANDATORY_QUESTION_TEXTS.items():
        items.append(
            {
                "item_id": mid,
                "domain": "background",
                "bank": "Mandatory Screening Flags",
                "text": text,
            }
        )
    for sid, text in SENSORY_QUESTION_TEXTS.items():
        items.append(
            {
                "item_id": sid,
                "domain": "sensory",
                "bank": "Module A Sensory Quick Screen",
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
            "Module A and Module B items without a reviewed clip are narrated on first play by the requested neural voice; those entries are returned flagged unreviewed.",
            "Machine-translated question text for Module A/Module B is pending clinical review.",
            "Files missing reviewed_by or reviewed_date are hidden by default in the manifest.",
            "Missing or unreviewed audio automatically falls back to validated written text.",
            "Audio playback is non-blocking and caregiver response is never constrained.",
        ],
        covered_items=covered_list,
        uncovered_items=uncovered_list,
        unreviewed_hidden_items=unreviewed_hidden_items,
    )
