"""Generate localized Module A (early-years) question text and narration maps.

Module A has 40 spoken strings: 36 milestone items, 2 mandatory flags, and
2 sensory flags. English and Hindi already have reviewed narration in
``audio_manifest.json``. This script adds text maps for every other supported
language so the existing on-demand edge-tts path can narrate them too.

Outputs (kept in sync):
  - backend/data/module_a/question_bank_a_<code>.json
  - frontend/public/module-a-<code>.json
  - backend/data/module_a/translation_review.json

The six non-Hindi maps are machine translations and are marked pending
clinical review. Hindi is seeded from the reviewed manifest where present.

Usage:
    python scripts/translate_module_a.py
    python scripts/translate_module_a.py --langs mr,ta
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
_BACKEND = _REPO_ROOT / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

BACKEND_DIR = _BACKEND / "data" / "module_a"
FRONTEND_DIR = _REPO_ROOT / "frontend" / "public"
MANIFEST_PATH = _BACKEND / "data" / "audio_manifest.json"
SUPPORTED = ("hi", "mr", "ta", "te", "bn", "gu", "kn")
MODEL_NAME = "Helsinki-NLP/opus-mt-en-mul"
LANG_TOKEN = {
    "hi": "hin",
    "mr": "mar",
    "ta": "tam",
    "te": "tel",
    "bn": "ben",
    "gu": "guj",
    "kn": "kan",
}


def source_items() -> dict[str, str]:
    from app.core.mandatory_items import MANDATORY_QUESTION_TEXTS
    from app.core.sensory_items import SENSORY_QUESTION_TEXTS
    from data.generator.item_bank import ITEM_BANK

    items: dict[str, str] = {itm.item_id: itm.text for itm in ITEM_BANK}
    items.update(MANDATORY_QUESTION_TEXTS)
    items.update(SENSORY_QUESTION_TEXTS)
    return items


def reviewed_hindi() -> dict[str, str]:
    if not MANIFEST_PATH.exists():
        return {}
    raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    out: dict[str, str] = {}
    for item_id, langs in (raw.get("items") or {}).items():
        entry = (langs or {}).get("hi") or {}
        if entry.get("status") == "reviewed" and entry.get("text"):
            out[item_id] = str(entry["text"])
    return out


def write_map(lang: str, translations: dict[str, str]) -> None:
    payload = json.dumps(translations, ensure_ascii=False, indent=0)
    backend_out = BACKEND_DIR / f"question_bank_a_{lang}.json"
    frontend_out = FRONTEND_DIR / f"module-a-{lang}.json"
    backend_out.parent.mkdir(parents=True, exist_ok=True)
    frontend_out.parent.mkdir(parents=True, exist_ok=True)
    backend_out.write_text(payload, encoding="utf-8")
    frontend_out.write_text(payload, encoding="utf-8")


def translate_missing(
    items: dict[str, str], lang: str, existing: dict[str, str]
) -> dict[str, str]:
    todo = [
        (item_id, text) for item_id, text in items.items() if not existing.get(item_id)
    ]
    if not todo:
        return existing

    import torch
    from transformers import MarianMTModel, MarianTokenizer

    tokenizer = MarianTokenizer.from_pretrained(MODEL_NAME)
    model = MarianMTModel.from_pretrained(MODEL_NAME)
    model.eval()
    tag = f">>{LANG_TOKEN[lang]}<<"
    batch_size = 16
    for start in range(0, len(todo), batch_size):
        chunk = todo[start : start + batch_size]
        batch = [f"{tag} {text}" for _, text in chunk]
        inputs = tokenizer(
            batch, return_tensors="pt", padding=True, truncation=True, max_length=256
        )
        with torch.no_grad():
            generated = model.generate(**inputs, max_new_tokens=128, num_beams=1)
        decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
        for (item_id, _), text in zip(chunk, decoded, strict=False):
            existing[item_id] = text.strip()
        print(f"[{lang}] {min(start + batch_size, len(todo))}/{len(todo)}", flush=True)
    return existing


def main() -> int:
    parser = argparse.ArgumentParser(description="Translate Module A question text")
    parser.add_argument("--langs", default=",".join(SUPPORTED))
    args = parser.parse_args()
    langs = [lang.strip() for lang in args.langs.split(",") if lang.strip()]
    unknown = [lang for lang in langs if lang not in SUPPORTED]
    if unknown:
        raise SystemExit(f"unsupported languages: {', '.join(unknown)}")

    items = source_items()
    hi = reviewed_hindi()
    review: dict[str, str] = {}
    for lang in langs:
        existing = {k: v for k, v in hi.items() if k in items} if lang == "hi" else {}
        translations = translate_missing(items, lang, existing)
        translations = {k: v for k, v in translations.items() if k in items}
        write_map(lang, translations)
        missing = [item_id for item_id in items if not translations.get(item_id)]
        review[lang] = "reviewed_source" if lang == "hi" else "machine_pending_review"
        print(
            f"[{lang}] wrote {len(translations)}/{len(items)}; missing={len(missing)}",
            flush=True,
        )

    BACKEND_DIR.mkdir(parents=True, exist_ok=True)
    (BACKEND_DIR / "translation_review.json").write_text(
        json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
