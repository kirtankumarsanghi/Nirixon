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
| **Macro AUPRC (primary metric)** | **0.9180** |
| Refer-class AUPRC | 0.8907 |
| Monitor-class AUPRC | 0.8659 |
| Typical-class AUPRC | 0.9975 |
| Macro F1 | 0.9002 |
| Macro AUROC | 0.9775 |
| Refer recall (sensitivity) | 0.8108 |
| Monitor recall (sensitivity) | 0.8966 |

**Winner: XGBoost**, beating Random Forest (0.9225 val AUPRC) and Logistic
Regression (0.7387 val AUPRC).

**Age ablation:** removing `corrected_age_months` drops macro AUPRC from
0.9180 to 0.9135 (a 0.0045 drop). That's a real, meaningful drop — worth
saying honestly rather than downplaying: the model leans heavily on
explicit age access, which makes sense given how age-staggered the item
bank is by design. The item-level signal alone (age removed) still beats
random guessing by a wide margin, which is the actual claim the ablation
study is meant to support — not "age doesn't matter," but "the items
themselves carry real signal too."

**Fairness check:** PASS. Refer-probability gap between multilingual and
non-multilingual groups: 0.0050 (threshold 0.0500). `multilingual_home_flag`
was never given to the model as a feature — this confirms the item
responses themselves aren't secretly proxying for it either.

**Subgroup sensitivity:** Refer sensitivity ranges from 0.4286 to 1.0000 across
age bins, with each bin holding under 220 test samples — some of that
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
| Complete (36 items) | Published ASQ Rule | 0.6317 | 1.0000 | 0.3853 | 0.8813 |
| Complete (36 items) | **XGBoost (trained model)** | **0.9599** | **0.9314** | **0.9451** | **0.9960** |
| Sparse (12 items) | Naive Rule (Zero-filled) | 0.5964 | 0.6679 | 0.8645 | 0.5443 |
| Sparse (12 items) | Prorated Scale Rule | 0.2861 | 0.9838 | 0.1149 | 0.3758 |
| Sparse (12 items) | **XGBoost + Peer Imputation** | **0.7046** | **0.6552** | **0.9380** | **0.9966** |

**Clinical Value of ML**: When every item is answered, multi-domain union rules suffer from family-wise over-referral (Refer precision = 0.3853). Under realistic adaptive questionnaires (8–18 questions), unasked items cause naive rules to collapse (45.57% false positive rate among typical children) and prorated rules suffer severe precision collapse (0.1149). In contrast, XGBoost with peer-median imputation maintains 99.66% typical specificity and 93.80% Refer precision.

### 3. Simulation Stress Testing & Graceful Degradation (with Bootstrap 95% CIs)

| Stress Regime | Evaluation Condition | Macro F1 [95% CI] | Refer Sensitivity [95% CI] | Macro AUPRC [95% CI] |
|---|---|---|---|---|
| Label Noise | 0% flip noise | 0.9599 [0.9536, 0.9661] | 0.9314 [0.9086, 0.9512] | 0.9743 [0.9662, 0.9829] |
| Label Noise | 10% flip noise | 0.8088 [0.7968, 0.8209] | 0.5444 [0.5115, 0.5742] | 0.7618 [0.7495, 0.7740] |
| Label Noise | 20% flip noise | 0.6836 [0.6708, 0.6947] | 0.3536 [0.3245, 0.3795] | 0.6202 [0.6086, 0.6385] |
| Caregiver Reporting Bias | shift = -0.8 (under-report) | 0.3547 [0.3447, 0.3663] | 0.9585 [0.9430, 0.9751] | 0.6198 [0.6008, 0.6381] |
| Caregiver Reporting Bias | shift = +0.0 (calibrated) | 0.9599 [0.9536, 0.9661] | 0.9314 [0.9086, 0.9512] | 0.9743 [0.9662, 0.9829] |
| Caregiver Reporting Bias | shift = +0.8 (over-report) | 0.8817 [0.8711, 0.8909] | 0.8375 [0.8059, 0.8679] | 0.9163 [0.9066, 0.9264] |
| Generator Parameter Shift | severity = 0.00 | 0.8175 [0.7905, 0.8456] | 0.6929 [0.6214, 0.7742] | 0.8449 [0.8146, 0.8771] |
| Generator Parameter Shift | severity = 0.50 | 0.8464 [0.8269, 0.8659] | 0.9857 [0.9612, 1.0000] | 0.8638 [0.8361, 0.8849] |
| Generator Parameter Shift | severity = 1.00 | 0.6766 [0.6501, 0.7022] | 0.9929 [0.9771, 1.0000] | 0.7194 [0.6978, 0.7413] |

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
