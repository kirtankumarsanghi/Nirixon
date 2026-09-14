# Model Selection Report

## Decision

**Production model: `random_forest`**

Selection criteria: highest validation-set macro AUPRC. If XGBoost and Random Forest within 0.005 AUPRC, prefer Random Forest (lower latency, lower memory). Logistic Regression wins only if it strictly outperforms both tree models.

## Validation AUPRC (model selection set)

| Model | Val Macro AUPRC |
|---|---|
| random_forest | 0.9361 **(SELECTED)** |
| xgboost | 0.9282 |
| logistic_regression | 0.7387 |

## Test Set Metrics (final holdout, touched once)

### logistic_regression

- Macro AUPRC: **0.7996**
- Refer AUPRC: **0.8450** ← primary metric
- Macro F1:    0.7208
- Macro AUROC: 0.9044

### random_forest (production)

- Macro AUPRC: **0.9393**
- Refer AUPRC: **0.8981** ← primary metric
- Macro F1:    0.8955
- Macro AUROC: 0.9881

### xgboost

- Macro AUPRC: **0.9180**
- Refer AUPRC: **0.8907** ← primary metric
- Macro F1:    0.9002
- Macro AUROC: 0.9775

## Inference Latency (single-row, sequential)

| Model | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|
| logistic_regression | 6.42 | 8.93 | 11.06 |
| random_forest | 57.32 | 79.56 | 103.55 |
| xgboost | 12.08 | 17.05 | 27.73 |

> Latency is measured as sequential single-row `predict_proba()` calls, reflecting the Clinician Sandbox / What-If re-score use case, not batch throughput. n=1000 calls per model.
