"""
Evidence schemas: response models for GET /api/evidence.

All values are read verbatim from the offline ML evaluation artifacts
(ml/artifacts/metrics.json and ml/artifacts/module_b_router/router_metrics.json).
Nothing here is fabricated or recomputed — the endpoint only surfaces what the
evaluation already produced.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class EvidenceClassMetrics(BaseModel):
    """Per-class precision / recall / F1 from the Module A held-out test set."""

    precision: float
    recall: float
    f1: float
    support: float


class EvidenceModuleA(BaseModel):
    """Module A (0-60mo) production model evaluation — XGBoost held-out test."""

    model_name: str
    n_test: int
    confusion_matrix: list[list[int]]
    confusion_matrix_labels: list[str]
    macro_f1: float
    macro_auroc: float
    macro_auprc: float
    accuracy: float
    refer_recall: float
    refer_precision: float
    refer_specificity: float
    monitor_recall: float
    typical_recall: float
    class_metrics: dict[str, EvidenceClassMetrics]
    latency_p50_ms: float
    latency_p95_ms: float
    latency_p99_ms: float


class EvidenceModuleB(BaseModel):
    """Module B (school-age) router evaluation — held-out test (blend/clf)."""

    n_test: int
    safety_recall: float
    safety_precision: float
    n_safety: int
    any_true_domain_hit_rate: float
    domain_micro_precision: float
    domain_micro_recall: float
    domain_micro_f1: float
    ml_only_safety_recall: float
    handwritten_notes: int
    handwritten_any_domain_hit_rate: float | None = None
    handwritten_micro_f1: float | None = None


class EvidenceResponse(BaseModel):
    generated_at: str
    disclaimer: str
    module_a: EvidenceModuleA
    module_b: EvidenceModuleB
    dataset_note: str = Field(
        default="Metrics are offline evaluation artifacts and are not live clinical outcomes."
    )
