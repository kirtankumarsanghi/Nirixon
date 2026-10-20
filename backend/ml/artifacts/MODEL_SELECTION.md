# Model Selection Report

## Decision

**Production model: `xgboost`**

Selection criteria: highest validation-set macro AUPRC. If XGBoost and Random Forest within 0.005 AUPRC, prefer Random Forest (lower latency, lower memory). Logistic Regression wins only if it strictly outperforms both tree models.

## Validation AUPRC (model selection set)

| Model | Val Macro AUPRC |
|---|---|
| xgboost | 0.7965 **(SELECTED)** |
| ensemble | 0.7726 |
| random_forest | 0.6718 |
| logistic_regression | 0.6329 |

## Test Set Metrics (final holdout, touched once)

### logistic_regression

- Macro AUPRC: **0.6450**
- Refer AUPRC: **0.5752** ← primary metric
- Macro F1:    0.6011
- Macro AUROC: 0.7990

### random_forest

- Macro AUPRC: **0.6718**
- Refer AUPRC: **0.5745** ← primary metric
- Macro F1:    0.6756
- Macro AUROC: 0.8353

### xgboost (production)

- Macro AUPRC: **0.7944**
- Refer AUPRC: **0.7620** ← primary metric
- Macro F1:    0.7214
- Macro AUROC: 0.8875

### ensemble

- Macro AUPRC: **0.7724**
- Refer AUPRC: **0.7321** ← primary metric
- Macro F1:    0.7024
- Macro AUROC: 0.8751

## Inference Latency (single-row, sequential)

| Model | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---|---|---|
| logistic_regression | 7.67 | 9.73 | 11.61 |
| random_forest | 58.22 | 69.35 | 79.46 |
| xgboost | 12.93 | 16.37 | 17.44 |
| ensemble | 108.34 | 123.80 | 143.99 |

> Latency is measured as sequential single-row `predict_proba()` calls, reflecting the Clinician Sandbox / What-If re-score use case, not batch throughput. n=200 calls per model.
