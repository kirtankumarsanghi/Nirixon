# Nirixon — Results (Section 7)

> **Evidence status:** all figures below are **simulation / held-out evaluation results** from the repository artifacts. They show that the pipeline recovers the generating rule and that the deterministic safety layer behaves as designed. They do **not** establish accuracy on real children. Clinical validity is pending (`docs/pilot_study_protocol.md`).

**Canonical artifacts**

- `backend/ml/artifacts/metrics.json` — Module A
- `backend/ml/artifacts/refer_threshold.json` — deployed operating point
- `backend/ml/artifacts/model_disabled_demo.json` — safety-floor ablation
- `backend/ml/artifacts/module_b_router/router_metrics.json` — Module B
- `docs/AUDIO_COVERAGE_REPORT.md` — narration review coverage
- `backend/tests/`, `frontend/src/test/` — automated verification

---

## 7.1 Quantitative & Experimental Machine Learning Results

### 7.1.1 Experimental setup

| Item | Value |
|---|---|
| Module A cohort | **8,000 synthetic children** (45.46% Typical / 40.41% Monitor / 14.12% Refer) |
| Split | 60% train / 20% validation / 20% test, stratified on `risk_label`, seed 42 |
| Held-out test rows | **1,600** (727 Typical / 647 Monitor / 226 Refer) |
| Module A features | **45**: 36 milestone items + corrected age + age-bracket ordinal + family-history flag + 6 domain means |
| Module B evaluation | **5,700** held-out notes (`test(all, unseen)`) + **76** independent handwritten notes |
| Decision policy | Module A: calibrated probabilities + validation-selected Refer threshold; Module B: `rules_primary` (rule hit first, classifier fallback) |
| Target | 3-tier triage: Typical / Monitor / Refer |
| Leakage control | `regression_flag` is excluded from features; labels come from the latent severity state; null controls below |

The production artifact is a **calibrated Random Forest**. XGBoost and a soft-voting ensemble are reported only as benchmarks.

---

### 7.1.2 Module A model comparison

**Table 7.1 — Validation and held-out test performance (1,600-row test set)**

| Model | Val macro AUPRC | Test macro AUPRC | Refer AUPRC | Macro F1 | Macro AUROC | Refer precision | Refer recall | Brier | ECE |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Logistic Regression | 0.9066 | 0.9088 | 0.8573 | 0.8598 | 0.9619 | 0.7640 | 0.9027 | 0.2200 | 0.0682 |
| **Random Forest (production)** | 0.9267 | **0.9503** | **0.9412** | **0.9017** | **0.9763** | **0.8819** | **0.9248** | **0.1511** | **0.0190** |
| XGBoost (benchmark) | 0.9310 | 0.9532 | 0.9463 | 0.9006 | 0.9760 | 0.8793 | 0.9027 | 0.1477 | 0.0168 |
| Soft-voting ensemble (benchmark) | 0.9328 | 0.9526 | 0.9422 | 0.9004 | 0.9778 | 0.8745 | 0.9248 | 0.1496 | 0.0148 |

**Selection rule:** highest validation macro AUPRC, with a documented tie-break: if XGBoost and Random Forest are within 0.005 AUPRC, prefer Random Forest because it is cheaper at inference. XGBoost's validation AUPRC is 0.9310 vs Random Forest's 0.9267 (difference 0.0043), so the tie-break selects **Random Forest**. The ensemble is not eligible because it is the slowest single-row model.

**What this supports:** on the synthetic cohort, the production model ranks Refer cases well above chance (Refer AUPRC 0.941 vs 0.141 prevalence) and is well calibrated (ECE 0.019).
**What it does not support:** real-child accuracy or clinical effectiveness.

---

### 7.1.3 Deployed operating point (calibrated production model)

The deployed policy is not plain argmax. A Refer threshold is selected on validation to target 85% recall; the calibrated model is then evaluated once on the held-out test set.

**Table 7.2 — Production operating point**

| Metric | Value |
|---|---:|
| `refer_threshold` | **0.527184** |
| Target validation recall | 0.85 |
| Test Refer sensitivity | **0.9027** (204/226) |
| Test Refer specificity | **0.9847** |
| Test Refer precision | **0.9067** (204/225) |
| Test macro F1 | **0.9018** |
| Test accuracy | **0.9019** (1,443/1,600) |
| Predicted Refer share | **14.06%** (225/1,600) |

**Confusion matrix at the deployed threshold** (rows = true, columns = predicted; Typical / Monitor / Refer). Recomputed by replaying `model.pkl` on the same stratified 1,600-row test split and applying `refer_threshold.json`; this is the deployed inference path.

| True \ Predicted | Typical | Monitor | Refer |
|---|---:|---:|---:|
| **Typical** | 667 | 60 | 0 |
| **Monitor** | 54 | 572 | 21 |
| **Refer** | **0** | 22 | **204** |

**Per-class precision / recall / F1 at the deployed threshold**

| Class | Precision | Recall | F1 | Support |
|---|---:|---:|---:|---:|
| Typical | 0.9251 | 0.9175 | 0.9213 | 727 |
| Monitor | 0.8746 | 0.8841 | 0.8793 | 647 |
| Refer | **0.9067** | **0.9027** | **0.9047** | 226 |

**Important distinction:** the model-selection table above reports the **base Random Forest at argmax** (Refer precision 0.8819 / recall 0.9248 / specificity 0.9796 / macro F1 0.9017). The deployed system uses the **calibrated** model with the 0.527184 threshold, which produces the higher-precision operating point in this table. Do not mix the two rows in one claim.

---

### 7.1.4 Calibration

**Table 7.3 — Reliability of the calibrated production model**

| Confidence bin | n | Mean confidence | Empirical accuracy | Gap |
|---|---:|---:|---:|---:|
| 0.4–0.5 | 5 | 0.4884 | 0.6000 | +0.1116 |
| 0.5–0.6 | 81 | 0.5538 | 0.6173 | +0.0634 |
| 0.6–0.7 | 121 | 0.6185 | 0.6529 | +0.0344 |
| 0.7–0.8 | 114 | 0.7438 | 0.8509 | +0.1070 |
| 0.8–0.9 | 387 | 0.8533 | 0.8682 | +0.0150 |
| 0.9–1.0 | 892 | 0.9872 | 0.9843 | −0.0029 |

**Summary:** Brier score **0.1511**, expected calibration error **0.019**. The largest gap is in the small 0.4–0.5 and 0.7–0.8 bins (5 and 114 cases), not in the high-confidence mass that drives most decisions.

---

### 7.1.5 Null controls and leakage checks

**Table 7.4 — Null controls (same model class; chance-level Refer prevalence = 0.1412)**

| Control | Refer AUPRC | Macro F1 | Balanced accuracy | Interpretation |
|---|---:|---:|---:|---|
| Signal intact (reference) | 0.9526 | 0.8956 | 0.8898 | Real features and labels |
| Label shuffle | 0.1696 | 0.3315 | 0.3525 | Collapses to chance |
| Random features | 0.0983 | 0.1938 | 0.2173 | Collapses below chance |
| Permuted test features | 0.1563 | 0.3208 | 0.3276 | Associations destroyed |
| Majority class | 0.1412 | 0.2083 | 0.3333 | No-information baseline |

The signal remains far above every control. This is evidence against target leakage in the tested pipeline; it is not evidence of clinical validity.

---

### 7.1.6 Clinical rule baseline vs machine learning

**Table 7.5 — Same held-out cohort**

| Regime | Policy | Macro F1 | Refer sensitivity | Refer precision | Typical specificity |
|---|---|---:|---:|---:|---:|
| 36 items | ASQ-style rule (−2 SD any domain; regression → Refer) | 0.7875 | 0.9602 | 0.5550 | 0.8734 |
| 36 items | **Random Forest (production, base argmax)** | **0.9017** | **0.9248** | **0.8819** | **0.9796** |
| 12 items | Naive rule (zero-filled) | 0.4353 | 0.1637 | 0.4353 | 0.4278 |
| 12 items | Prorated scale rule | 0.4034 | 0.9867 | 0.2053 | 0.3425 |
| 12 items | XGBoost + peer-median imputation (benchmark) | 0.8412 | 0.8009 | 0.8341 | 0.8294 |

**Relative macro-F1 improvement of the production model over the ASQ-style rule:** (0.9017 − 0.7875) / 0.7875 = **+14.5%**.
**Questionnaire burden:** 12 items vs 36 items = **66.7% fewer** caregiver answers.

The ASQ-style rule has higher Refer sensitivity but much lower precision; the ML model trades a small amount of sensitivity for a large reduction in over-referral. At 12 items, naive/prorated rules collapse, which is the practical argument for the learned imputation model.

---

### 7.1.7 Robustness / stress tests

**Table 7.6 — Selected stress-test points (full curves in `metrics.json`)**

| Perturbation | Level | Macro F1 | Refer sensitivity | Macro AUPRC |
|---|---|---:|---:|---:|
| Label noise | 0% | 0.899 | 0.934 | 0.950 |
| Label noise | 10% | 0.792 | 0.712 | 0.774 |
| Label noise | 25% | 0.678 | 0.480 | 0.633 |
| Reporting bias | −0.8 | 0.516 | 0.956 | 0.806 |
| Reporting bias | 0 | 0.899 | 0.934 | 0.950 |
| Reporting bias | +0.8 | 0.713 | 0.456 | 0.834 |
| Missing items | 36 answered | 0.899 | 0.934 | 0.950 |
| Missing items | 12 answered | 0.846 | 0.827 | 0.876 |
| Missing items | 4 answered | 0.752 | 0.668 | 0.691 |
| Generator shift | 0.0 | 0.885 | 0.929 | 0.947 |
| Generator shift | 1.0 | 0.877 | 0.926 | 0.940 |

**Interpretation:** the model degrades gracefully under missingness and generator shift, but **label noise and severe reporting bias are the dominant failure modes**. A screener that relies on caregiver-reported labels cannot be assumed robust to systematic under/over-reporting; this is a central reason for the deterministic safety floor and for prospective clinical validation.

**Fairness check:** PASS. Refer-probability gap between multilingual and non-multilingual groups = **0.0062** (threshold 0.05). `multilingual_home_flag` was never a model feature.

**Subgroup sensitivity:** Refer recall ranges **0.8125–1.0000** across age brackets; family-history-negative 0.9196 vs family-history-positive 0.9630. Small per-bracket Refer counts (6–25) make some of this spread consistent with sampling noise.

**Age ablation:** with age 0.9503 vs without age 0.9547 → delta **−0.0044**. The item-level signal is at least as strong as the version with explicit age, so the model is not merely proxying age.

---

### 7.1.8 Inference latency

**Table 7.7 — Single-row `predict_proba()` latency (n = 200)**

| Model | p50 (ms) | p95 (ms) | p99 (ms) |
|---|---:|---:|---:|
| Logistic Regression | 12.0 | 13.5 | 14.9 |
| **Random Forest (production)** | **51.0** | **60.4** | **64.7** |
| XGBoost | 16.5 | 21.0 | 24.2 |
| Soft-voting ensemble | 85.4 | 111.5 | 139.2 |

The production Random Forest is slower than XGBoost but remains well within an interactive screening flow; the ensemble is rejected partly because of its tail latency.

---

### 7.1.9 Module B: school-age domain router

The production router default is **`rules_primary`**: when a rule fires, trust it; otherwise fall back to the classifier. This policy was chosen because rules generalize better to the small independent handwritten set.

**Table 7.8 — Held-out router policies (`test(all, unseen)`, n = 5,700)**

| Policy | Domain micro precision | Domain micro recall | Domain micro F1 | Any-true-domain hit rate | Safety precision | Safety recall |
|---|---:|---:|---:|---:|---:|---:|
| **`rules_primary` (production)** | **0.950** | **0.905** | **0.927** | **0.948** | **1.000** | **1.000** |
| `rules` only | 0.975 | 0.893 | 0.932 | 0.928 | 1.000 | 1.000 |
| `blend` (legacy hybrid) | 0.912 | 0.922 | 0.917 | 0.963 | 1.000 | 1.000 |
| `clf` (ML only) | 0.518 | 0.642 | 0.573 | 0.749 | 0.000 | 0.000 |

The ML-only row is the key safety finding: on rare crisis phrases it has **0% recall**. The deterministic rules are mandatory, not decorative.

**Table 7.9 — Per-label performance of the production `rules_primary` policy**

| Label | Precision | Recall | F1 | n |
|---|---:|---:|---:|---:|
| Attention & work habits | 0.916 | 0.916 | 0.916 | 1,167 |
| Listening & speaking | 0.988 | 0.931 | 0.958 | 878 |
| Reading | 0.967 | 0.873 | 0.918 | 881 |
| Writing | 0.969 | 0.969 | 0.969 | 899 |
| Numbers | 0.960 | 0.973 | 0.966 | 877 |
| Motor | 0.991 | 0.978 | 0.984 | 800 |
| Social | 0.972 | 0.798 | 0.876 | 1,013 |
| Emotion & school conduct | 0.891 | 0.858 | 0.875 | 1,491 |
| Vision/hearing rule-out | 0.876 | 0.838 | 0.857 | 489 |
| Global/ASD rule-out | 0.997 | 0.909 | 0.951 | 418 |
| Safety | 1.000 | 1.000 | 1.000 | 122 |
| Context: bullying | 0.607 | 0.980 | 0.749 | 148 |
| Context: school refusal | 0.885 | 0.977 | 0.929 | 174 |
| Context: screen time | 0.462 | 0.980 | 0.628 | 153 |
| Context: language | 1.000 | 0.964 | 0.982 | 138 |
| Context: academic pressure | 0.180 | 0.409 | 0.251 | 149 |
| Context: sleep | 0.971 | 0.951 | 0.961 | 142 |

Context labels are supporting flags, not the same as the eight core developmental domains; their lower precision (especially academic pressure) is a known limitation.

**Table 7.10 — Language / source slices under `rules_primary`**

| Slice | n | Precision | Recall | F1 | Any-domain hit |
|---|---:|---:|---:|---:|---:|
| `test:seed_gen` | 3,000 | 0.948 | 0.895 | 0.921 | 0.940 |
| `test:bank_en` | 1,800 | 0.933 | 0.874 | 0.902 | 0.935 |
| `test:lex_hr_hi` | 900 | 0.981 | 0.994 | 0.988 | 0.995 |
| `test:lang=en` | 2,963 | 0.955 | 0.915 | 0.935 | 0.955 |
| `test:lang=hr` | 1,722 | 0.973 | 0.879 | 0.923 | 0.928 |
| `test:lang=hi` | 736 | 0.878 | 0.935 | 0.905 | 0.970 |

**Independent handwritten notes (76):**

| Policy | Precision | Recall | F1 | Any-domain hit | Safety P/R |
|---|---:|---:|---:|---:|---:|
| `rules_primary` (production) | 0.887 | 0.887 | 0.887 | 0.911 | 1.000 / 1.000 |
| `rules` only | 0.945 | 0.839 | 0.889 | 0.857 | 1.000 / 1.000 |
| `blend` (legacy) | 0.747 | 0.903 | 0.818 | 0.929 | 1.000 / 1.000 |

The handwritten set is small (76 notes, 7 safety notes). It is useful as an out-of-generator check, not as a clinical validation set.

---

### 7.1.10 Deterministic safety floor / model-disabled ablation

This is a **separate 10,000-row held-out stress cohort**, not the 1,600-row main test set. It isolates what the rules and safety floor catch when the ML model is disabled.

**Table 7.11 — Safety-floor ablation**

| Policy | Refer sensitivity | Refer specificity | Refer precision | Macro F1 | Missed Refer | Regression cases caught |
|---|---:|---:|---:|---:|---:|---:|
| A: ML only | 0.621 | 0.964 | 0.736 | 0.721 | 529 | 183 / 496 |
| **B: rule + safety floor (model disabled)** | 0.725 | 0.908 | 0.560 | 0.652 | 383 | **496 / 496** |
| C: ML + safety floor (deployed) | 0.681 | 0.937 | 0.637 | 0.712 | 445 | **496 / 496** |

The safety floor catches **every regression case** in this cohort even with the model switched off. It does not replace the model for general triage: policy C's overall sensitivity is lower than policy A's on this cohort, which is exactly why the two layers are presented separately rather than blended into a single “0 missed” claim.

---

### 7.1.11 Audio coverage

**Table 7.12 — Narration coverage**

| Metric | Value |
|---|---:|
| Total narration items | 2,510 |
| Clinically reviewed pre-generated clips | **98 (3.9%)** |
| On-demand Hindi clips | 2,412 |
| Items with no narration path | **0** |
| Reviewed languages | en-IN, hi-IN |
| On-demand languages | English, Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada |
| Reviewer / date for the 98 | Dr. Anita Sharma, 2026-03-20 |

The 98 reviewed clips cover Module A and mandatory flags. All other items are **machine-generated and flagged unreviewed**; the UI must not present them as clinically approved.

---

### 7.1.12 Automated verification

| Layer | Result |
|---|---|
| Backend pytest | **27 modules / 236 tests, 236 passed** |
| Frontend Vitest | **17 files / 67 tests, 67 passed** |
| TypeScript | `tsc -b` passes |
| Lint | `eslint` passes |
| Production build | `vite build` passes |
| Mobile layout audit | Headless Chromium/Edge at **390px and 360px**, 22 routes, **zero horizontal page overflow** |
| Touch targets / safe area | **Not measured** by the automated audit; requires device/manual verification |

---

### 7.1.13 What the results support — and what they do not

**Supported**

- The pipeline recovers the synthetic generating rule far above chance and null controls.
- The calibrated Random Forest is well calibrated (ECE 0.019) and operates at a documented threshold.
- The deterministic safety floor catches all 496 regression cases in the model-disabled stress cohort.
- The Module B rule-first router flags at least one true domain in 94.8% of held-out notes and maintains 100% safety recall/precision.
- All 8 language banks and both module banks are populated; narration has a path for every item.

**Not supported**

- Any claim of diagnostic accuracy, clinical effectiveness, or real-child performance.
- Generalization to a new region, language, income group, or clinical population.
- Treating machine-generated audio as clinically reviewed.
- Treating the 76 handwritten notes or 98 reviewed clips as a validation study.

---

## 7.2 Systematic Visual Interface Gallery & Screenshot Walkthrough

### 7.2.1 What is covered

The interface is one React bundle with four role workspaces:

| Role | Main routes |
|---|---|
| Parent / caregiver | Home, Check-in, Growth, What-if, Share, Find Help, Wellbeing |
| Frontline worker (ASHA/CHW) | Caseload, Referrals, Check-in, Training, Find Help |
| Clinician | Cases, Clinical review, Evidence, What-if, Find Help |
| Supervisor | Caseload, Referrals, Training |

The UI supports eight languages (English, Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada) and the same routes are used by the web app and the Android WebView.

### 7.2.2 Repository screenshot inventory

The current gallery is in `docs/verification/`:

| File | View |
|---|---|
| `01-landing.png` | Public landing page and role entry |
| `02-login.png` | Sign-in with demo roles |
| `03-parent-home.png` | Parent home |
| `04-parent-growth.png` | Growth tracking and WHO percentile view |
| `05-parent-share.png` | Joint-family invite flow |
| `06-parent-whatif.png` | Caregiver what-if explanation |
| `07-parent-checkin.png` | Adaptive check-in |
| `08-parent-help.png` | Find Help directory |
| `09-chw-home.png` | CHW home |
| `09-chw-caseload.png` | CHW caseload |
| `10-chw-referrals.png` | Referral lifecycle |
| `11-clinician-home.png` | Clinician home |
| `12-clinician-cases.png` | Clinician case list |
| `13-clinician-evidence.png` | Evidence dossier |
| `14-clinician-whatif.png` | Clinician what-if sandbox |
| `15-checkin-question.png` | Question + audio narration |

These files were regenerated on **12 Nov 2026** from the current **v1.4.2** build at **2400×1500** (1600×1000 viewport at 1.5× DPI). The floating demo role dock was hidden and scroll was reset for each view. Re-capture after any UI change; do not present an older screenshot as the current build.

### 7.2.3 Mobile layout verification

The automated audit rendered 22 routes at **390×844** and **360×800** in headless Chromium/Edge and checked for horizontal page overflow. All 22 routes passed with zero page-level horizontal scroll.

The audit does **not** measure:
- physical safe-area insets on a notched device,
- the 44×44 CSS-pixel touch-target rule,
- native Android WebView rendering.

Those remain device/manual checks. Do not claim them as automated results.

---

## 7.3 Reproducibility

```bash
# Backend tests
cd backend
pytest tests -q

# Frontend checks
cd ../frontend
npm test
npm run typecheck
npm run lint
npm run build

# Module A metrics (regenerates artifacts/metrics.json from the processed cohort)
cd ../backend/ml
python train.py

# Module B router metrics
# Artifact: backend/ml/artifacts/module_b_router/router_metrics.json
# Regenerate with the router evaluation entry point used by the training pipeline.
```

**Rule for reports:** quote `metrics.json` for Module A, `router_metrics.json` for Module B, and `refer_threshold.json` for the deployed threshold. Do not combine the 50k/10k historical XGBoost tables in `docs/VALIDITY.md` with the current Random Forest run.
