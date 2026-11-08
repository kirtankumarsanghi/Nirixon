# Model Selection Report

## Decision

**Production model: `random_forest`**

Selection criteria: highest validation-set macro AUPRC. If XGBoost and Random Forest within 0.005 AUPRC, prefer Random Forest (lower latency, lower memory). Logistic Regression wins only if it strictly outperforms both tree models.

## Validation AUPRC (model selection set)

| Model | Val Macro AUPRC |
|---|---|
| ensemble | 0.9328 |
| xgboost | 0.9310 |
| random_forest | 0.9267 **(SELECTED)** |
| logistic_regression | 0.9066 |

## Test Set Metrics (final holdout, touched once)

### logistic_regression

- Macro AUPRC: **0.9088**
- Refer AUPRC: **0.8573** ← primary metric
- Macro F1:    0.8598
- Macro AUROC: 0.9619

### random_forest (production)

- Macro AUPRC: **0.9503**
- Refer AUPRC: **0.9412** ← primary metric
- Macro F1:    0.9017
- Macro AUROC: 0.9763

### xgboost

- Macro AUPRC: **0.9532**
- Refer AUPRC: **0.9463** ← primary metric
- Macro F1:    0.9006
- Macro AUROC: 0.9760

### ensemble

- Macro AUPRC: **0.9526**
- Refer AUPRC: **0.9422** ← primary metric
- Macro F1:    0.9004
- Macro AUROC: 0.9778

## Inference Latency (single-row, sequential)

| Model | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|
| logistic_regression | 7.98 | 9.24 | 10.71 |
| random_forest | 32.67 | 41.36 | 50.91 |
| xgboost | 12.96 | 15.42 | 16.37 |
| ensemble | 71.50 | 84.02 | 90.49 |

> Latency is measured as sequential single-row `predict_proba()` calls, reflecting the Clinician Sandbox / What-If re-score use case, not batch throughput. n=200 calls per model.
