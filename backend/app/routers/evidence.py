"""
Evidence Router: GET /api/evidence endpoint.

Surfaces the offline ML evaluation artifacts (Module A metrics.json and Module B
router_metrics.json) to the frontend Evidence view. Read-only and additive:
it never touches model artifacts, thresholds or inference. Values are passed
through verbatim from the JSON artifacts.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, status

from app.schemas.evidence import (
    EvidenceClassMetrics,
    EvidenceModuleA,
    EvidenceModuleB,
    EvidenceResponse,
)

router = APIRouter(prefix="/api/evidence", tags=["evidence"])

_ARTIFACT_ROOT = Path(__file__).resolve().parents[2] / "ml" / "artifacts"
_MODULE_A_PATH = _ARTIFACT_ROOT / "metrics.json"
_MODULE_B_PATH = _ARTIFACT_ROOT / "module_b_router" / "router_metrics.json"

_DISCLAIMER = (
    "Model evaluation metrics from held-out test data — for transparency and "
    "discussion, not a measure of live clinical performance."
)


def _load_json(path: Path) -> dict | list:
    if not path.is_file():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Evaluation artifact not available: {path.name}",
        )
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:  # pragma: no cover - defensive
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Could not read evaluation artifact {path.name}: {exc}",
        ) from exc


def _build_module_a(data: dict) -> EvidenceModuleA:
    selection = data.get("model_selection", {})
    winner = selection.get("winner", "xgboost")
    test = data.get("test_metrics", {}).get(winner, {})
    report = test.get("classification_report_dict", {})
    sens_spec = test.get("sensitivity_specificity", {})
    latency = data.get("latency_benchmark", {}).get(winner, {})

    class_metrics: dict[str, EvidenceClassMetrics] = {}
    for label in ("Typical", "Monitor", "Refer"):
        row = report.get(label, {})
        class_metrics[label] = EvidenceClassMetrics(
            precision=float(row.get("precision", 0.0)),
            recall=float(row.get("recall", 0.0)),
            f1=float(row.get("f1-score", 0.0)),
            support=float(row.get("support", 0.0)),
        )

    macro = report.get("macro avg", {})
    n_test = int(round(float(macro.get("support", 0.0))))

    return EvidenceModuleA(
        model_name=winner,
        n_test=n_test,
        confusion_matrix=test.get("confusion_matrix", []),
        confusion_matrix_labels=test.get(
            "confusion_matrix_labels", ["Typical", "Monitor", "Refer"]
        ),
        macro_f1=float(test.get("macro_f1", 0.0)),
        macro_auroc=float(test.get("macro_auroc", 0.0)),
        macro_auprc=float(test.get("macro_auprc", 0.0)),
        accuracy=float(report.get("accuracy", 0.0)),
        refer_recall=float(sens_spec.get("Refer", {}).get("sensitivity", 0.0)),
        refer_precision=float(class_metrics["Refer"].precision),
        refer_specificity=float(sens_spec.get("Refer", {}).get("specificity", 0.0)),
        monitor_recall=float(sens_spec.get("Monitor", {}).get("sensitivity", 0.0)),
        typical_recall=float(sens_spec.get("Typical", {}).get("sensitivity", 0.0)),
        class_metrics=class_metrics,
        latency_p50_ms=float(latency.get("p50_ms", 0.0)),
        latency_p95_ms=float(latency.get("p95_ms", 0.0)),
        latency_p99_ms=float(latency.get("p99_ms", 0.0)),
    )


def _build_module_b(data: list[dict]) -> EvidenceModuleB:
    # Entries are a list of {name, mode, ...}. Production headline numbers come
    # from the held-out "test(all, unseen)" blend (hybrid) and clf (ML-only) rows.
    def find(name: str, mode: str) -> dict:
        for row in data:
            if (
                isinstance(row, dict)
                and row.get("name") == name
                and row.get("mode") == mode
            ):
                return row
        return {}

    blend = find("test(all, unseen)", "blend")
    clf = find("test(all, unseen)", "clf")

    return EvidenceModuleB(
        n_test=int(blend.get("n", 0)),
        safety_recall=float(blend.get("safety_R", 0.0)),
        safety_precision=float(blend.get("safety_P", 0.0)),
        n_safety=int(blend.get("n_safety", 0)),
        any_true_domain_hit_rate=float(blend.get("any_true_domain_flagged", 0.0)),
        domain_micro_precision=float(blend.get("domain_micro_P", 0.0)),
        domain_micro_recall=float(blend.get("domain_micro_R", 0.0)),
        domain_micro_f1=float(blend.get("domain_micro_F1", 0.0)),
        ml_only_safety_recall=float(clf.get("safety_R", 0.0)),
        handwritten_notes=0,
    )


@router.get("", response_model=EvidenceResponse)
@router.get("/", response_model=EvidenceResponse, include_in_schema=False)
def get_evidence() -> EvidenceResponse:
    module_a = _build_module_a(_load_json(_MODULE_A_PATH))
    raw_b = _load_json(_MODULE_B_PATH)
    module_b = _build_module_b(raw_b if isinstance(raw_b, list) else [])
    return EvidenceResponse(
        generated_at=datetime.now(UTC).isoformat(),
        disclaimer=_DISCLAIMER,
        module_a=module_a,
        module_b=module_b,
    )
