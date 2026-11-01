"""Record human clinical/linguistic sign-off for a localized question bank.

Usage:
    python scripts/mark_translation_review.py --lang hi --reviewer "Dr. A. Sharma"

The app reads the registry to show reviewed vs pending labels; this script does
not itself validate translation quality.
"""

from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

REGISTRY = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "module_b"
    / "translation_review.json"
)
LANGS = ("en", "hi", "mr", "ta", "te", "bn", "gu", "kn")


def main() -> int:
    parser = argparse.ArgumentParser(description="Record translation review")
    parser.add_argument("--lang", required=True, choices=LANGS)
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--status", default="reviewed", choices=("reviewed", "pending"))
    args = parser.parse_args()

    data = json.loads(REGISTRY.read_text(encoding="utf-8")) if REGISTRY.exists() else {}
    data[args.lang] = {
        "status": args.status,
        "reviewer": args.reviewer if args.status == "reviewed" else None,
        "reviewed_date": (
            date.today().isoformat() if args.status == "reviewed" else None
        ),
    }
    REGISTRY.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"{args.lang}: {args.status} ({args.reviewer})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
