"""Generate localized Module B (school-age) question text.

The adaptive bank ships in English only. This script translates every item with
the multilingual OPUS-MT model (Helsinki-NLP/opus-mt-en-mul) and writes a flat
``item_id -> text`` map consumed by the frontend and by server-side narration.

Outputs (kept in sync):
  - backend/data/module_b/question_bank_b_<code>.json
  - frontend/public/module-b-<code>.json

Machine output is explicitly pending clinical review; see
``backend/data/module_b/translation_review.json``.

Usage:
    python scripts/translate_module_b.py --langs mr,ta,te,bn,gu,kn
    python scripts/translate_module_b.py --langs mr --batch-size 64
    python scripts/translate_module_b.py --check
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CSV_PATH = _REPO_ROOT / "backend" / "data" / "module_b" / "question_bank_b.csv"
BACKEND_DIR = _REPO_ROOT / "backend" / "data" / "module_b"
FRONTEND_DIR = _REPO_ROOT / "frontend" / "public"
SAVE_EVERY_BATCHES = 10
SUPPORTED = ("mr", "ta", "te", "bn", "gu", "kn")
MODEL_NAME = "Helsinki-NLP/opus-mt-en-mul"
LANG_TOKEN = {
    "mr": "mar",
    "ta": "tam",
    "te": "tel",
    "bn": "ben",
    "gu": "guj",
    "kn": "kan",
}
SCRIPT_RANGES = {
    "mr": r"[\u0900-\u097F]",
    "ta": r"[\u0B80-\u0BFF]",
    "te": r"[\u0C00-\u0C7F]",
    "bn": r"[\u0980-\u09FF]",
    "gu": r"[\u0A80-\u0AFF]",
    "kn": r"[\u0C80-\u0CFF]",
}


def output_paths(lang: str) -> tuple[Path, Path]:
    return (
        BACKEND_DIR / f"question_bank_b_{lang}.json",
        FRONTEND_DIR / f"module-b-{lang}.json",
    )


def load_existing(path: Path) -> dict[str, str]:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def write_outputs(lang: str, translations: dict[str, str]) -> None:
    payload = json.dumps(translations, ensure_ascii=False, indent=0)
    backend_out, frontend_out = output_paths(lang)
    backend_out.parent.mkdir(parents=True, exist_ok=True)
    frontend_out.parent.mkdir(parents=True, exist_ok=True)
    backend_out.write_text(payload, encoding="utf-8")
    frontend_out.write_text(payload, encoding="utf-8")


def check_languages(langs: list[str]) -> int:
    missing = [lang for lang in langs if not output_paths(lang)[1].exists()]
    if missing:
        print(f"missing localized maps: {', '.join(missing)}")
        return 1
    print(f"localized maps present: {', '.join(langs)}")
    return 0


def load_rows() -> list[dict[str, str]]:
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def translate_language(
    lang: str,
    rows: list[dict[str, str]],
    *,
    tokenizer,
    model,
    batch_size: int,
) -> int:
    import torch

    backend_out, _ = output_paths(lang)
    translations = load_existing(backend_out)
    todo = [
        row
        for row in rows
        if not translations.get(row["item_id"]) and row.get("text", "").strip()
    ]
    print(f"[{lang}] {len(rows)} items, {len(todo)} to translate", flush=True)
    if not todo:
        write_outputs(lang, translations)
        return 0

    tag = f">>{LANG_TOKEN[lang]}<<"
    started = time.time()
    batches_since_save = 0
    for start in range(0, len(todo), batch_size):
        chunk = todo[start : start + batch_size]
        batch = [f"{tag} {row['text']}" for row in chunk]
        inputs = tokenizer(
            batch, return_tensors="pt", padding=True, truncation=True, max_length=256
        )
        with torch.no_grad():
            generated = model.generate(**inputs, max_new_tokens=128, num_beams=1)
        decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
        for row, text in zip(chunk, decoded, strict=False):
            translations[row["item_id"]] = text.strip()

        batches_since_save += 1
        if batches_since_save >= SAVE_EVERY_BATCHES or start + batch_size >= len(todo):
            write_outputs(lang, translations)
            batches_since_save = 0
            done = min(start + batch_size, len(todo))
            elapsed = max(time.time() - started, 0.01)
            print(
                f"[{lang}] {done}/{len(todo)} ({done / elapsed:.1f} items/s)",
                flush=True,
            )

    # A cheap sanity check: the multilingual model should emit the target
    # script. A low match rate means the map needs human inspection.
    pattern = re.compile(SCRIPT_RANGES[lang])
    sample = list(translations.values())
    matched = sum(1 for text in sample if pattern.search(text))
    rate = matched / len(sample) if sample else 0.0
    print(f"[{lang}] target-script match {rate:.1%}", flush=True)
    write_outputs(lang, translations)
    return 0 if rate >= 0.8 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Translate the Module B bank")
    parser.add_argument("--langs", default=",".join(SUPPORTED))
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    langs = [lang.strip() for lang in args.langs.split(",") if lang.strip()]
    unknown = [lang for lang in langs if lang not in SUPPORTED]
    if unknown:
        raise SystemExit(f"unsupported languages: {', '.join(unknown)}")
    if args.check:
        return check_languages(langs)

    from transformers import MarianMTModel, MarianTokenizer

    print(f"loading {MODEL_NAME}", flush=True)
    tokenizer = MarianTokenizer.from_pretrained(MODEL_NAME)
    model = MarianMTModel.from_pretrained(MODEL_NAME)
    model.eval()

    rows = load_rows()
    failures = 0
    for lang in langs:
        failures += translate_language(
            lang, rows, tokenizer=tokenizer, model=model, batch_size=args.batch_size
        )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
