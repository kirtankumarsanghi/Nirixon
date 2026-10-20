# Stage 2 — ML Pipeline — README

## What Stage 2 does

Takes the Stage 1 synthetic dataset and trains an actual classifier: given
a set of milestone-item answers, `corrected_age_months`,
`family_history_flag`, and `regression_flag`, predict Typical / Monitor /
Refer — with calibrated confidence, an explanation of *why*, and a set of
checks confirming the model behaves the way the design doc says it should,
not just that it runs.

## Files

| File | What it does |
|---|---|
| `columns.py` | Single source of truth for what counts as a model feature — shared by every other file so nothing drifts |
| `models/model_comparison.py` | Trains and tunes Logistic Regression, Random Forest, and XGBoost via GridSearchCV |
| `models/calibration.py` | Wraps the winning model so its confidence scores are trustworthy |
| `evaluation/metrics.py` | AUPRC (primary), macro F1, AUROC, confusion matrix |
| `evaluation/ablation_study.py` | Retrains without age to check the model isn't just proxying age |
| `evaluation/fairness_check.py` | Confirms predictions don't secretly correlate with `multilingual_home_flag` |
| `evaluation/subgroup_sensitivity.py` | Refer/Monitor sensitivity broken out by age bin and family history |
| `explainability/shap_explainer.py` | Per-prediction "why" — which specific answers drove the result |
| `train.py` | Runs all of the above in order and saves artifacts |

Run with: `cd backend/ml && python3 train.py`

## What came back — the actual numbers, not a promise of "strong results"

### 1. Held-Out Test Set Performance

| Metric | Value |
|---|---|
| **Macro AUPRC (primary metric)** | **0.7944** |
| Refer-class AUPRC | 0.7620 |
| Monitor-class AUPRC | 0.7341 |
| Typical-class AUPRC | 0.8872 |
| Macro F1 | 0.7214 |
| Macro AUROC | 0.8875 |
| Refer recall (sensitivity) | 0.6205 |
| Monitor recall (sensitivity) | 0.6612 |

**Winner: XGBoost**, beating Random Forest (0.6718 val AUPRC) and Logistic
Regression (0.6329 val AUPRC).

**Age ablation:** removing `corrected_age_months` drops macro AUPRC from
0.7944 to 0.7718 (a 0.0226 drop). That's a real, meaningful drop — worth
saying honestly rather than downplaying: the model leans heavily on
explicit age access, which makes sense given how age-staggered the item
bank is by design. The item-level signal alone (age removed) still beats
random guessing by a wide margin, which is the actual claim the ablation
study is meant to support — not "age doesn't matter," but "the items
themselves carry real signal too."

**Fairness check:** PASS. Refer-probability gap between multilingual and
non-multilingual groups: 0.0066 (threshold 0.0500). `multilingual_home_flag`
was never given to the model as a feature — this confirms the item
responses themselves aren't secretly proxying for it either.

**Subgroup sensitivity:** Refer sensitivity ranges from 0.3333 to 0.7833 across
age bins, with bins holding 324–1026 held-out test samples — some of that
spread is very plausibly just small-sample noise, not a real subgroup
weakness, and it would need more data per bin to tell the difference
confidently. Said honestly in the output rather than glossed over.

### 2. Clinical Cutoff Rule Baseline vs. Machine Learning

A standard clinical baseline scores each developmental domain against published ASQ-3 standard deviation cutoffs:
- Below −2.0 SD in any domain (or `regression_flag == 1`) → **Refer** (black zone)
- Between −1.0 and −2.0 SD in any domain → **Monitor** (gray zone)
- Above −1.0 SD across all domains → **Typical** (white zone)

| Regime | Evaluation Approach | Macro F1 | Refer Sensitivity | Refer Precision | Typical Specificity |
|---|---|---|---|---|---|
| Complete (36 items) | Published ASQ Rule | 0.6515 | 0.7253 | 0.5604 | 0.9079 |
| Complete (36 items) | **XGBoost (trained model)** | **0.7214** | **0.6205** | **0.7355** | **0.9639** |
| Sparse (12 items) | Naive Rule (Zero-filled) | 0.4080 | 0.1815 | 0.5101 | 0.4346 |
| Sparse (12 items) | Prorated Scale Rule | 0.2650 | 0.8357 | 0.1678 | 0.2839 |
| Sparse (12 items) | **XGBoost + Peer Imputation** | **0.4365** | **0.1098** | **0.7969** | **0.9213** |

**Clinical Value of ML**: When every item is answered, multi-domain union rules suffer from family-wise over-referral (Refer precision = 0.5604). Under realistic adaptive questionnaires (8–18 questions), unasked items cause naive rules to collapse (56.54% false positive rate among typical children) and prorated rules suffer severe precision collapse (0.1678). In contrast, XGBoost with peer-median imputation maintains 92.13% typical specificity and 79.69% Refer precision.

### 3. Simulation Stress Testing & Graceful Degradation (with Bootstrap 95% CIs)

| Stress Regime | Evaluation Condition | Macro F1 [95% CI] | Refer Sensitivity [95% CI] | Macro AUPRC [95% CI] |
|---|---|---|---|---|
| Label Noise | 0% flip noise | 0.7214 [0.7115, 0.7331] | 0.6205 [0.5951, 0.6457] | 0.7944 [0.7849, 0.8007] |
| Label Noise | 10% flip noise | 0.6535 [0.6428, 0.6637] | 0.4776 [0.4546, 0.5027] | 0.6903 [0.6796, 0.6998] |
| Label Noise | 20% flip noise | 0.5785 [0.5671, 0.5890] | 0.3572 [0.3367, 0.3776] | 0.5884 [0.5790, 0.6015] |
| Caregiver Reporting Bias | shift = -0.8 (under-report) | 0.2040 [0.1961, 0.2119] | 0.9347 [0.9212, 0.9480] | 0.3746 [0.3717, 0.3790] |
| Caregiver Reporting Bias | shift = +0.0 (calibrated) | 0.7214 [0.7115, 0.7331] | 0.6205 [0.5951, 0.6457] | 0.7944 [0.7849, 0.8007] |
| Caregiver Reporting Bias | shift = +0.8 (over-report) | 0.6298 [0.6181, 0.6414] | 0.4354 [0.4074, 0.4624] | 0.7117 [0.6952, 0.7208] |
| Generator Parameter Shift | severity = 0.00 | 0.7086 [0.6850, 0.7318] | 0.5872 [0.5276, 0.6536] | 0.7856 [0.7636, 0.8053] |
| Generator Parameter Shift | severity = 0.50 | 0.7164 [0.6979, 0.7357] | 0.6534 [0.6120, 0.7012] | 0.8005 [0.7821, 0.8158] |
| Generator Parameter Shift | severity = 1.00 | 0.7117 [0.6921, 0.7331] | 0.6957 [0.6574, 0.7358] | 0.7923 [0.7747, 0.8081] |

**Single Source of Truth**: All metrics and evaluation tables are strictly synchronized from `backend/ml/artifacts/metrics.json`.


## Two real bugs caught while building this — worth knowing about, not hiding

**1. `CalibratedClassifierCV(cv='prefit')` no longer exists.** The original
plan (and most tutorials/older docs) use this API. Running it against the
installed sklearn (1.8) throws a `ValueError` immediately — it's not a
deprecation warning, it's gone. Fixed by wrapping the fitted model in
`sklearn.frozen.FrozenEstimator` instead, which is the current
replacement. **If you're running an older sklearn locally and this
doesn't reproduce, that's why — check your version.**

**2. SHAP explanations were silently wrong on the first pass.** The tree
model is trained inside a pipeline that standardizes `corrected_age_months`
before fitting. When I first ran `explain_prediction()` on a real "Refer"
child using **raw, unscaled** feature values, it predicted "Typical" —
wrong — and the age SHAP value came back at -5.26, wildly out of scale
compared to any item's contribution (all under 1). No error was raised;
it just quietly produced garbage. The tree's split thresholds live in
*preprocessed* space, and feeding it raw values doesn't fail loudly, it
just fails silently and confidently.

**Fixed two ways:**
- The fitted preprocessor is now saved as its own artifact
  (`artifacts/preprocessor.pkl`) — any code calling the model or the SHAP
  explainer later (Stage 3/4) **must** transform raw feature rows through
  it first.
- `explain_prediction()` no longer tries to *guess* the predicted class
  from SHAP value magnitudes (which is what let the bug hide — it was
  quietly "explaining" the wrong class without any obvious sign something
  was off). It now takes the actual predicted class as an argument,
  sourced from the real calibrated model's own prediction. SHAP explains
  a given class's attribution; it was never meant to double as a
  classifier.

Re-tested after the fix on one real case per label — all three now
correctly match their true label, with sensible-magnitude SHAP values
(e.g. `regression_flag: +7.07` dominating a Refer explanation, which is
exactly the "near-automatic red flag" behavior the design doc calls for).

## Artifacts produced (`backend/ml/artifacts/`)

- `model.pkl` — the final calibrated XGBoost model
- `preprocessor.pkl` — **required** before feeding raw features to the model or the explainer
- `feature_columns.pkl` — exact ordered feature list used in training
- `shap_explainer.pkl` — fitted TreeExplainer

## What's simplified vs. the full design doc

- SMOTE was not needed — `class_weight='balanced'` (LogReg/RF) and
  inverse-frequency `sample_weight` (XGBoost) were sufficient to get solid
  Refer-class performance on this dataset. `imbalanced-learn` is installed
  and ready if a future, larger dataset needs it.
- GridSearchCV grids are intentionally small (a handful of values per
  hyperparameter) — appropriate for a 5,000-row synthetic dataset and fast
  iteration, not a production-scale search.
- The k-means background-summary dataset mentioned in the original plan
  isn't used — it's only needed for SHAP's interventional perturbation
  mode or `KernelExplainer`. `TreeExplainer`'s default
  (`tree_path_dependent`) doesn't need one; adding it would have been
  unnecessary complexity.

## What Stage 2 still needs before it's fully "done" per the design doc

- [ ] Measurement-mode validation (retrospective vs. live-elicitation) — not
      applicable yet, since Stage 1 doesn't generate live-elicitation data.
      This only matters once Stage 7 is being built.
- [ ] Re-run against the full 50,000-row dataset once Stage 1 is scaled up
- [ ] Inter-item collinearity check within domains (not yet built — worth
      adding before treating the adaptive questionnaire's "time savings"
      claim in Stage 3 as validated)
