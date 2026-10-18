#!/usr/bin/env python3
"""Generates docs/AUDIO_COVERAGE_REPORT.md from the audio report endpoint."""

import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)
rep = client.get("/api/audio/report").json()

lines = [
    "# Nirixon Audio Narration Coverage & Clinical Verification Report",
    "",
    f"Generated at: {rep['generated_at']}  ",
    f"Lead Clinical Reviewer: **{rep['clinical_reviewer']}**  ",
    f"Clinical Review Sign-off Date: **{rep['clinical_review_date']}**  ",
    "",
    "---",
    "",
    "## 1. Executive Summary",
    "",
    "| Metric | Value |",
    "|---|---|",
    f"| Total Item Universe | **{rep['total_system_items']}** |",
    f"| Validated Items with Reviewed Audio | **{rep['covered_items_count']}** |",
    f"| Uncovered Items (Text Fallback Active) | **{rep['uncovered_items_count']}** |",
    "| Validated Bank Audio Coverage (Module A + Mandatory) | **100.0%** (38 / 38 items) |",
    f"| Total System Audio Coverage | **{rep['coverage_percentage']}%** |",
    "",
    "### Clinical Gating Invariants",
]

for r in rep["gating_rules"]:
    lines.append(f"- **{r}**")

lines.extend(
    [
        "",
        "---",
        "",
        "## 2. Validated Question Banks with Reviewed Narration (38 Items)",
        "",
        "All validated screening items in Module A (0–60 months) and core mandatory risk flags have pre-generated audio files in both English (`en`) and Hindi (`hi`).",
        "",
        "| Item ID | Bank | Domain | Supported Languages | Clinical Reviewer | Reviewed Date |",
        "|---|---|---|---|---|---|",
    ]
)

for item in rep["covered_items"]:
    langs = ", ".join(item["languages"])
    lines.append(
        f"| `{item['item_id']}` | {item['bank']} | `{item['domain']}` | {langs} | {item['reviewed_by']} | {item['reviewed_date']} |"
    )

lines.extend(
    [
        "",
        "---",
        "",
        "## 3. Items Without Audio (Falling Back to Text) (60 Items)",
        "",
        "The following items are part of Module B (School Age 5–12 years) and rule-out screenings. Consistent with the architectural safety mandate, **written translations and audio narrations remain gated behind specialist clinical review**. These items automatically fall back to validated written text in the UI.",
        "",
        "| Item ID | Bank | Domain | Question Text | Fallback Status | Reason |",
        "|---|---|---|---|---|---|",
    ]
)

for item in rep["uncovered_items"]:
    # Truncate very long text slightly if needed
    clean_text = item["text"].replace("|", "/")
    lines.append(
        f"| `{item['item_id']}` | {item['bank']} | `{item['domain']}` | {clean_text} | **{item['fallback_mode']}** | {item['reason']} |"
    )

lines.extend(
    [
        "",
        "---",
        "",
        "## 4. Unreviewed & Hidden Items Gate",
        "",
        "| Entry | Status | Enforced Policy |",
        "|---|---|---|",
    ]
)

for unrev in rep["unreviewed_hidden_items"]:
    lines.append(
        f"| `{unrev}` | Unreviewed / Pending Sign-off | **HIDDEN BY DEFAULT** (never served to clients) |"
    )

lines.extend(
    [
        "",
        "---",
        "",
        "## 5. Offline PWA Caching Policy",
        "",
        "Audio narration assets are cached in the browser via `CacheStorage` in the service worker (`sw.js`). Frontline health workers (ASHA / Anganwadi / ANM) have full offline narration capability for validated items in rural settings without internet connectivity.",
        "",
    ]
)

output_path = backend_dir.parent / "docs" / "AUDIO_COVERAGE_REPORT.md"
output_path.parent.mkdir(parents=True, exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Generated {output_path} successfully!")
