"""
Stage 2 — Age-Feature Ablation Study

Trains a second copy of the winning model WITHOUT corrected_age_months
and compares its AUPRC to the full model's. The point isn't to prove
age doesn't matter (it obviously does - milestones are age-staggered by
design) - it's to prove the model is reading real developmental signal
from the item answers themselves, not just quietly proxying age and
ignoring the items.

Honest caveat, stated in the design doc and repeated here: item
DIFFICULTY is itself staggered by age (an item's typical_age_months in
Stage 1's item bank), so this measures the effect of explicit age
ACCESS, not a full separation of age from developmental signal. Even
with age removed, the model can still infer roughly how old a child is
from which items they're passing - that's expected, not a bug.
"""

from __future__ import annotations

from columns import AGE_COLUMN, reorder_proba
from evaluation.metrics import compute_metrics
from sklearn.base import clone


def run_ablation(model_pipeline, X_train, y_train, X_test, y_test, feature_columns: list[str]) -> dict:
    if AGE_COLUMN not in feature_columns:
        raise ValueError(f"{AGE_COLUMN} not in feature_columns - nothing to ablate.")

    reduced_features = [c for c in feature_columns if c != AGE_COLUMN]

    # Clone the winning model's hyperparameters but retrain on the reduced
    # feature set (a fresh ColumnTransformer inside the cloned pipeline
    # will simply have no age column to scale).
    from models.model_comparison import build_preprocessor

    ablated_pipeline = clone(model_pipeline)
    ablated_pipeline.set_params(preprocess=build_preprocessor(reduced_features))
    ablated_pipeline.fit(X_train[reduced_features], y_train)

    proba = ablated_pipeline.predict_proba(X_test[reduced_features])
    proba = reorder_proba(proba, ablated_pipeline.classes_)
    preds_idx = proba.argmax(axis=1)

    from columns import LABEL_ORDER
    preds = [LABEL_ORDER[i] for i in preds_idx]

    ablated_metrics = compute_metrics(y_test, preds, proba)

    return {
        "ablated_metrics": ablated_metrics,
        "reduced_features": reduced_features,
    }


def print_ablation_comparison(full_metrics: dict, ablation_result: dict) -> None:
    full_auprc = full_metrics["macro_auprc"]
    ablated_auprc = ablation_result["ablated_metrics"]["macro_auprc"]
    drop = full_auprc - ablated_auprc

    print(f"\n{'='*60}\nAge-Feature Ablation Study\n{'='*60}")
    print(f"Full model macro AUPRC (with age):    {full_auprc:.4f}")
    print(f"Ablated model macro AUPRC (no age):    {ablated_auprc:.4f}")
    print(f"Drop from removing age:                {drop:.4f}")
    print(
        "\nInterpretation: a large drop means the model leans heavily on "
        "age access; a small drop is evidence it's reading real item-level "
        "signal, not just proxying age. Remember: item difficulty is itself "
        "age-staggered by design, so this isn't a full separation of age "
        "from developmental signal - just a check on explicit age access."
    )
