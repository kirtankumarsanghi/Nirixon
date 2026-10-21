"""
Generate Hindi text for the Module B (school-age) question bank.

The adaptive Module B bank (`question_bank_b.csv`, ~2,400 items) ships in
English only, so Hindi narration had nothing to speak. This script translates
each item offline with Argos Translate (en -> hi) and writes the map the client
uses to speak Hindi in the check-in.

Outputs (kept in sync, source of truth first):
  - backend/data/module_b/question_bank_b_hi.json
  - frontend/public/module-b-hi.json

Translations are machine-produced and require clinical review before
near-clinical use (same gate as the rest of the Module B bank).

Usage:
    python scripts/translate_module_b_hi.py
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent

CSV_PATH = _REPO_ROOT / "backend" / "data" / "module_b" / "question_bank_b.csv"
BACKEND_OUT = _REPO_ROOT / "backend" / "data" / "module_b" / "question_bank_b_hi.json"
FRONTEND_OUT = _REPO_ROOT / "frontend" / "public" / "module-b-hi.json"
SAVE_EVERY = 25


def load_existing() -> dict[str, str]:
    if BACKEND_OUT.exists():
        return json.loads(BACKEND_OUT.read_text(encoding="utf-8"))
    return {}


def write_outputs(translations: dict[str, str]) -> None:
    payload = json.dumps(translations, ensure_ascii=False, indent=0)
    BACKEND_OUT.parent.mkdir(parents=True, exist_ok=True)
    BACKEND_OUT.write_text(payload, encoding="utf-8")
    FRONTEND_OUT.parent.mkdir(parents=True, exist_ok=True)
    FRONTEND_OUT.write_text(payload, encoding="utf-8")


def main() -> int:
    from argostranslate import translate as argos_translate

    rows = list(csv.DictReader(CSV_PATH.open(encoding="utf-8")))
    translations = load_existing()
    todo = [r for r in rows if not translations.get(r["item_id"])]
    print(f"{len(rows)} items, {len(todo)} to translate", flush=True)

    if not todo:
        write_outputs(translations)
        return 0

    for index, row in enumerate(todo, start=1):
        translations[row["item_id"]] = argos_translate.translate(
            row["text"], "en", "hi"
        )
        if index % SAVE_EVERY == 0 or index == len(todo):
            write_outputs(translations)
            print(f"translated {index}/{len(todo)}", flush=True)

    print(f"done: {len(translations)} entries", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
