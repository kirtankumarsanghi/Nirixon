# Model Selection Report

## Decision

**Production model: `xgboost`**

Selection criteria: highest validation-set macro AUPRC. If XGBoost and Random Forest within 0.005 AUPRC, prefer Random Forest (lower latency, lower memory). Logistic Regression wins only if it strictly outperforms both tree models.

## Validation AUPRC (model selection set)

| Model | Val Macro AUPRC |
|---|---|
| xgboost | 0.9282 **(SELECTED)** |
| random_forest | 0.9225 |
| logistic_regression | 0.7387 |

## Test Set Metrics (final holdout, touched once)

### logistic_regression

- Macro AUPRC: **0.7996**
- Refer AUPRC: **0.8450** ← primary metric
- Macro F1:    0.7208
- Macro AUROC: 0.9044

### random_forest

- Macro AUPRC: **0.9384**
- Refer AUPRC: **0.8978** ← primary metric
- Macro F1:    0.8931
- Macro AUROC: 0.9867

### xgboost (production)

- Macro AUPRC: **0.9180**
- Refer AUPRC: **0.8907** ← primary metric
- Macro F1:    0.9002
- Macro AUROC: 0.9775

## Inference Latency (single-row, sequential)

| Model | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|
| logistic_regression | 10.51 | 13.70 | 19.45 |
| random_forest | 88.32 | 103.92 | 109.17 |
| xgboost | 14.30 | 27.01 | 36.93 |

> Latency is measured as sequential single-row `predict_proba()` calls, reflecting the Clinician Sandbox / What-If re-score use case, not batch throughput. n=200 calls per model.
