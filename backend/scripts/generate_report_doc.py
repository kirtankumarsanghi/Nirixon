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
    f"| Clinically reviewed items (pre-generated clips) | **{rep['covered_items_count']}** |",
    f"| Narrated on demand in Hindi (Module B adaptive bank) | **{rep.get('ondemand_hindi_items_count', 0)}** |",
    f"| Uncovered items (written-text fallback) | **{rep['uncovered_items_count']}** |",
    f"| Reviewed-narration coverage of the whole universe | **{rep['coverage_percentage']}%** |",
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
        f"## 2. Validated Question Banks with Reviewed Narration ({rep['covered_items_count']} Items)",
        "",
        "All validated screening items in Module A (0–60 months), the mandatory risk flags and the"
        " curated Module B bank have pre-generated audio files in both English (`en`) and Hindi (`hi`).",
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
        "## 3. Narrated On Demand (Module B Adaptive Bank)",
        "",
        f"The school-age engine serves **{rep.get('ondemand_hindi_items_count', 0)}** adaptive items from"
        " `backend/data/module_b/question_bank_b.csv`. That bank is English-only and far too large to"
        " pre-record, so each Hindi clip is synthesized once on first play with the neural hi-IN voice"
        " and cached on disk. The Hindi text is machine-translated and **pending clinical review**, and"
        " those clip entries are returned flagged `unreviewed`.",
    ]
)

lines.extend(
    [
        "",
        "---",
        "",
        f"## 4. Items Without Audio (Written-Text Fallback) ({rep['uncovered_items_count']} Items)",
        "",
        "These items have neither a reviewed clip nor an on-demand narration, so the UI falls back to"
        " validated written text.",
        "",
        "| Item ID | Bank | Domain | Question Text | Fallback Status | Reason |",
        "|---|---|---|---|---|---|",
    ]
)

if not rep["uncovered_items"]:
    lines.append("| _(none)_ | — | — | — | — | — |")

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
        "## 5. Unreviewed & Hidden Items Gate",
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
