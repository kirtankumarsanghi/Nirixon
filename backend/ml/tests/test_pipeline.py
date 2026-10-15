import json
import re
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ML_DIR.parent
ARTIFACTS_DIR = ML_DIR / "artifacts"
METRICS_JSON_PATH = ARTIFACTS_DIR / "metrics.json"
MODEL_SELECTION_MD_PATH = ARTIFACTS_DIR / "MODEL_SELECTION.md"
ML_README_PATH = ML_DIR / "README.md"
GENERATOR_README_PATH = BACKEND_DIR / "data" / "generator" / "README.md"


def collect_all_numeric_tokens(obj) -> set[str]:
    tokens = set()
    if isinstance(obj, (int, float)):
        val = float(obj)
        tokens.add(str(obj))
        tokens.add(f"{val:.4f}")
        tokens.add(f"{val:.3f}")
        tokens.add(f"{val:.2f}")
        tokens.add(f"{val:.1f}")
        tokens.add(f"{val * 100:.2f}")
        tokens.add(f"{val * 100:.1f}")
        tokens.add(f"{val * 100:.0f}")
        tokens.add(f"{val:.0f}")
    elif isinstance(obj, str):
        for num in re.findall(r"\b\d+\.?\d*\b", obj):
            tokens.add(num)
    elif isinstance(obj, dict):
        for v in obj.values():
            tokens.update(collect_all_numeric_tokens(v))
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            tokens.update(collect_all_numeric_tokens(item))
    return tokens


def collect_all_floats(obj) -> set[float]:
    floats = set()
    if isinstance(obj, (int, float)):
        val = float(obj)
        floats.add(round(val, 4))
        floats.add(round(val * 100, 2))
        floats.add(round(val * 100, 1))
        floats.add(round(val, 2))
        floats.add(round(val, 1))
    elif isinstance(obj, str):
        for num in re.findall(r"\b\d+\.?\d*\b", obj):
            try:
                val = float(num)
                floats.add(round(val, 4))
                floats.add(round(val, 2))
            except ValueError:
                pass
    elif isinstance(obj, dict):
        for v in obj.values():
            floats.update(collect_all_floats(v))
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            floats.update(collect_all_floats(item))
    return floats


def test_master_metrics_file_exists_and_complete():
    assert METRICS_JSON_PATH.exists(), f"metrics.json missing at {METRICS_JSON_PATH}"
    with open(METRICS_JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    required_sections = [
        "metadata",
        "dataset_generation",
        "validation_macro_auprc",
        "test_metrics",
        "latency_benchmark",
        "model_selection",
        "ablation_study",
        "fairness_check",
        "subgroup_sensitivity",
        "rule_baseline_comparison",
        "stress_tests",
    ]
    for section in required_sections:
        assert (
            section in data
        ), f"Required section '{section}' missing from metrics.json"

    # Verify production winner
    assert data["model_selection"]["winner"] == "xgboost"
    assert "xgboost" in data["test_metrics"]
    assert "macro_auprc" in data["test_metrics"]["xgboost"]


def test_no_document_table_shows_number_not_in_metrics_file():
    assert METRICS_JSON_PATH.exists()
    with open(METRICS_JSON_PATH, encoding="utf-8") as f:
        metrics_data = json.load(f)

    valid_tokens = collect_all_numeric_tokens(metrics_data)
    valid_floats = collect_all_floats(metrics_data)

    exempt_tokens = {
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12",
        "13",
        "14",
        "15",
        "16",
        "17",
        "18",
        "19",
        "20",
        "21",
        "22",
        "24",
        "27",
        "28",
        "30",
        "33",
        "36",
        "42",
        "48",
        "54",
        "60",
        "100",
    }

    doc_paths = [MODEL_SELECTION_MD_PATH, ML_README_PATH, GENERATOR_README_PATH]

    for path in doc_paths:
        assert path.exists(), f"Document {path} does not exist"
        text = path.read_text(encoding="utf-8")

        table_lines = [
            line
            for line in text.splitlines()
            if line.strip().startswith("|")
            and not re.match(r"^\|\s*[-:]+\s*\|", line.strip())
        ]
        assert len(table_lines) > 0, f"Expected tables in {path.name}"

        for line in table_lines:
            nums = re.findall(r"\b\d+\.?\d*\b", line)
            for n in nums:
                if n in exempt_tokens or n in valid_tokens:
                    continue
                try:
                    val = float(n)
                    matched = any(
                        abs(val - vf) < 0.005
                        or abs(val * 100 - vf) < 0.05
                        or abs(val - vf * 100) < 0.05
                        or abs(val - round(vf, 2)) < 0.01
                        or abs(val - round(vf, 4)) < 0.001
                        for vf in valid_floats
                    )
                    assert matched, (
                        f"Consistency violation in {path.name}: number '{n}' on line '{line.strip()}' "
                        f"does not exist in metrics.json!"
                    )
                except ValueError:
                    pass
