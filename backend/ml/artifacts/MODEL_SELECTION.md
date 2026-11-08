# Model Selection Report

## Decision

**Production model: `xgboost`**

Selection criteria: highest validation-set macro AUPRC. If XGBoost and Random Forest within 0.005 AUPRC, prefer Random Forest (lower latency, lower memory). Logistic Regression wins only if it strictly outperforms both tree models.

## Validation AUPRC (model selection set)

| Model | Val Macro AUPRC |
|---|---|
| xgboost | 0.9594 **(SELECTED)** |
| ensemble | 0.9587 |
| random_forest | 0.9494 |
| logistic_regression | 0.9459 |

## Test Set Metrics (final holdout, touched once)

### logistic_regression

- Macro AUPRC: **0.9346**
- Refer AUPRC: **0.9091** ← primary metric
- Macro F1:    0.8732
- Macro AUROC: 0.9711

### random_forest

- Macro AUPRC: **0.9454**
- Refer AUPRC: **0.9340** ← primary metric
- Macro F1:    0.8875
- Macro AUROC: 0.9760

### xgboost (production)

- Macro AUPRC: **0.9542**
- Refer AUPRC: **0.9415** ← primary metric
- Macro F1:    0.8917
- Macro AUROC: 0.9787

### ensemble

- Macro AUPRC: **0.9532**
- Refer AUPRC: **0.9387** ← primary metric
- Macro F1:    0.8879
- Macro AUROC: 0.9789

## Inference Latency (single-row, sequential)

| Model | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|
| logistic_regression | 7.92 | 8.98 | 10.10 |
| random_forest | 31.82 | 34.02 | 35.21 |
| xgboost | 13.40 | 16.12 | 16.83 |
| ensemble | 74.23 | 86.38 | 91.23 |

> Latency is measured as sequential single-row `predict_proba()` calls, reflecting the Clinician Sandbox / What-If re-score use case, not batch throughput. n=200 calls per model.
