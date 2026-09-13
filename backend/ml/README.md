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

| Metric | Value |
|---|---|
| **Macro AUPRC (primary metric)** | **0.8998** |
| Refer-class AUPRC | 0.8699 |
| Monitor-class AUPRC | 0.8357 |
| Typical-class AUPRC | 0.9938 |
| Macro F1 | 0.8537 |
| Macro AUROC | 0.9739 |
| Refer recall (sensitivity) | 0.71 |
| Monitor recall (sensitivity) | 0.79 |

**Winner: XGBoost**, beating Random Forest (0.825 val AUPRC) and Logistic
Regression (0.687 val AUPRC).

**Age ablation:** removing `corrected_age_months` drops macro AUPRC from
0.900 to 0.696 (a 0.20 drop). That's a real, meaningful drop — worth
saying honestly rather than downplaying: the model leans heavily on
explicit age access, which makes sense given how age-staggered the item
bank is by design. The item-level signal alone (age removed) still beats
random guessing by a wide margin, which is the actual claim the ablation
study is meant to support — not "age doesn't matter," but "the items
themselves carry real signal too."

**Fairness check:** PASS. Refer-probability gap between multilingual and
non-multilingual groups: 0.0011 (threshold 0.05). `multilingual_home_flag`
was never given to the model as a feature — this confirms the item
responses themselves aren't secretly proxying for it either.

**Subgroup sensitivity:** Refer sensitivity ranges from 0.60 to 1.00 across
age bins, with each bin holding under 220 test samples — some of that
spread is very plausibly just small-sample noise, not a real subgroup
weakness, and it would need more data per bin to tell the difference
confidently. Said honestly in the output rather than glossed over.

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
