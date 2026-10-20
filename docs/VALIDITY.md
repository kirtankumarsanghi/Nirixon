# Validity & Claims

**Status:** methodology hardened — **clinical validity not established**.

This document is the single source of truth for what Nirixon's models have and have
not demonstrated. A model trained on synthetic data generated from our own item bank
can *recover our rule* without learning anything about real children. Every number
below is a **simulation result**.

> **Rule of thumb:** if a sentence implies we know how the model performs on real
> children, it is wrong unless it says *pilot pending*.

---

## 1. Claims table

| Claim | Evidence | Status |
|---|---|---|
| The adaptive engine selects items and terminates correctly | unit + integration tests (`backend/tests/`) | **Tested** |
| The deterministic safety floor forces Refer on reported regression | `safety_floor.py` + `test_adaptive_logic.py`, `test_end_to_end.py` | **Tested** |
| The system still catches regression with the model disabled | `evaluation/model_disabled_demo.py` (§4) | **Tested** |
| The ML pipeline is not leaking | null controls all collapse (§3) | **Tested** |
| Probabilities are calibrated | Brier / ECE (§2) | **Tested (simulation)** |
| The model infers the latent construct from noisy items | Refer AUPRC 0.72 vs 0.14 chance (§2) | **Tested (simulation)** |
| Fairness across multilingual homes | `fairness_check` PASS (§5) | **Tested (simulation)** |
| Robustness to label noise / reporting bias / missing items / generator shift | stress suite (§6) | **Tested (simulation)** |
| **Diagnostic accuracy on real children** | — | **NOT TESTED — pilot pending** |
| Content validity of the items | expert CVR (`docs/content_validity_protocol.md`) | **Tooling ready — ratings pending** |
| Test–retest reliability with real caregivers | `validation/src/pilot_analysis.py` | **Tooling ready — data pending** |

---

## 2. Held-out simulation results

50,000 synthetic children; **observed** class balance 45.5% / 40.6% / 13.9%
(Typical / Monitor / Refer). Held-out test split (10,000 rows).

| Metric | Value |
|---|---|
| Macro AUPRC | **0.794** |
| Refer-class AUPRC | **0.762** (chance = 0.139) |
| Macro F1 | **0.721** |
| Macro AUROC | 0.888 |
| Refer sensitivity / specificity | **0.621 / 0.964** |
| Brier score (multiclass) | 0.354 |
| Expected calibration error | 0.016 |

### Decision policy (not argmax)

Argmax under-calls the rare Refer class because it maximises overall accuracy. The
deployed policy uses a fixed Refer threshold of **0.20** (stored in
`artifacts/refer_threshold.json`), chosen for an ~18–20% flag rate. The 0.85-recall
threshold selected on validation was 0.172; both are reported here.

| Policy | Refer sens | Refer spec | Refer prec | Flagged | Macro F1 |
|---|---|---|---|---|---|
| Argmax | 0.621 | 0.964 | 0.736 | 13.9% | **0.721** |
| Threshold 0.172 (0.85 val recall) | 0.841 | 0.865 | 0.503 | 23.3% | 0.669 |
| Threshold 0.20 (deployed) | **0.798** | 0.902 | 0.569 | 19.5% | 0.696 |

This is a deliberate screening trade-off: catch ~80% of Refer cases and accept that
~20% of children get a follow-up flag. It is a single stored threshold, not a change
to the model or the labels — report both the argmax and deployed rows.

The model now has genuine signal: Refer AUPRC is 5× the no-information level. It is
still a simulation; the threshold row above is the screening operating point, and the
rule + safety floor remain the deterministic backstop (§4).

### History of the fix (why the old number is gone)

| | Published (leaked flag + quantile labels) | Flag removed | **Latent labels (current)** |
|---|---|---|---|---|
| Macro F1 | 0.9599 | 0.6817 | **0.721** |
| Refer sensitivity | 0.9314 | 0.2162 | **0.621** |
| Refer AUPRC | — | 0.3601 | **0.762** |

Two leaks were removed: `regression_flag` was both a feature and an input to the
label; and labels were quantiles of the same observed composite the model saw. Labels
are now a threshold on the **true latent severity** (ASQ-style −2 / −1 SD), so
prevalence is observed rather than imposed and the model must infer the construct.

---

## 3. Null controls (must fail)

Same split, same model class; only the training signal changes. Chance-level Refer
AUPRC is the Refer prevalence (**0.141**).

| Control | Refer AUPRC | Macro F1 | Balanced accuracy |
|---|---|---|---|
| Signal intact (reference) | 0.7238 | 0.6828 | 0.6567 |
| **Label shuffle** | 0.1819 | 0.3031 | 0.3288 |
| **Random features** | 0.1485 | 0.2484 | 0.3117 |
| **Permuted test features** | 0.1488 | 0.2388 | 0.3421 |
| Majority class (no information) | 0.1412 | 0.2083 | 0.3333 |

All controls collapse to chance. The remaining signal is therefore not an artefact of
leakage.

> With a 45% plurality class, a do-nothing model still scores ~45% raw accuracy.
> Report **balanced accuracy / macro-F1**, never raw accuracy.

---

## 4. Rule engine vs classifier — and the model-disabled case

Class agreement on held-out rows:

| | Refer sensitivity | Refer precision | Macro F1 |
|---|---|---|---|
| ASQ-style rule (−2 SD on any domain) | **0.725** | 0.560 | 0.652 |
| XGBoost (argmax) | 0.621 | **0.736** | 0.721 |

With the classifier **disabled entirely** (`evaluation/model_disabled_demo.py`):

| Policy | Refer sens | Refer spec | Refer prec | Macro F1 | Missed Refer | Regression caught |
|---|---|---|---|---|---|---|
| A: ML only | 0.621 | 0.964 | 0.736 | 0.721 | 529 | 183/496 |
| B: rule + safety floor (no model) | 0.725 | 0.908 | 0.560 | 0.652 | 383 | **496/496** |
| C: ML + safety floor (current) | 0.681 | 0.937 | 0.637 | 0.712 | 445 | **496/496** |

The system does not depend on the classifier being correct: without it, every
regression case is still caught. The classifier's value is precision, not safety.

---

## 5. Fairness

`multilingual_home_flag` is excluded from features and used only as a grouping
variable. Held-out check: **PASS**.

| Gap | Value | Threshold |
|---|---|---|
| Refer-probability gap | 0.0066 | 0.05 |
| Monitor-or-Refer gap | 0.0073 | 0.05 |

---

## 6. Robustness

All rows are **held-out** (earlier versions scored the model on its own training rows).

**Label noise** — macro F1 0.721 (0%) → 0.554 (25%).

**Caregiver reporting bias** — macro F1 at bias −0.8 / 0 / +0.8:
**0.204 / 0.721 / 0.630**. Under-reporting is the dangerous direction.

**Missing items** — Refer AUPRC 0.794 (36 items) → 0.527 (4 items); Refer sensitivity
0.621 → 0.096.

**Generator shift** — macro AUPRC 0.786 (no shift) → 0.792 (severity 1.0). The shifted
cohort keeps the same ranking quality; the shift moves prevalence more than separation.

The stress suite now derives labels from the latent severity and builds the
`mean_<domain>` features, matching the production model. It previously imported the
removed quantile-label functions, which is why the embedded summary had gone stale.

---

## 7. What changed in this hardening pass

1. `regression_flag` removed from model features (`ml/columns.py`) — label leakage.
2. Labels derive from the **true latent severity**, not observed-score quantiles
   (`data/generator/label_derivation.py::assign_labels_by_latent`); prevalence is now
   observed (14.1% Refer).
3. Null controls added (`ml/evaluation/null_controls.py`), written into
   `metrics.json` on every run.
4. Calibration (Brier, ECE, reliability bins) added to every model's metrics.
5. Rule-vs-ML comparison and the stress suite now score **held-out rows only**
   (both were in-sample).
6. Model-disabled demonstration added (`ml/evaluation/model_disabled_demo.py`).
7. Overclaims removed from README, landing page and claims register.
8. **Operating point** — a Refer threshold selected on validation is stored with the
   model (`artifacts/refer_threshold.json`) and applied in `inference_service`;
   argmax remains available as the fallback when the file is absent.
9. **Legal feature engineering** — `mean_<domain>` aggregates added to the generator
   and computed identically at inference. Macro F1 0.676 → 0.697.
10. **Module B policy** — `DomainRouter` now defaults to `rules_primary`: a fired rule
    decides, and the classifier only fills in when no rule fires. Handwritten precision
    0.558 → 0.907, F1 0.649 → 0.845; generated-set F1 0.568 → 0.539. The generator
    gained `NIRIXON_N_CHILDREN` for larger synthetic cohorts.
11. **Ensemble candidate** — a soft-voting combination of LR + RF + XGB was trained and
    entered into model selection. It lost on validation AUPRC (0.7364 vs XGBoost
    0.7382) and on test macro F1 (0.684 vs 0.697); production remains XGBoost. Stacking
    was also measured (+0.003 AUPRC, −0.009 macro F1) — the three models are too
    correlated for a combination to help.

---

## 8. What is still missing

- **Prospective validation.** `docs/pilot_study_protocol.md` defines the study.
  Use `validation/src/pilot_analysis.py` with `docs/pilot_data_TEMPLATE.csv` to
  compute sensitivity/specificity with Wilson CIs once data exists.
- **Expert content validity** (CVR) and **cognitive interviews** —
  `docs/content_validity_protocol.md` + `evaluation/content_validity.py`. Tooling
  only; the ratings are a human step.
- **Test–retest reliability** — same script, `tier_t1`/`tier_t2` columns.
- **Module B** — lead with the independent handwritten set
  (`module_b/handwritten_eval_b.csv`, 76 author-written notes), generated data second.
  The shipped `rules_primary` policy scores 0.845 F1 there vs 0.649 for the old blend;
  on generated text the blend is slightly higher (0.568 vs 0.539). Report both.
- **Instrument upgrade (partly done)** — `app/core/adaptive_tree.py` already picks the
  next item by mutual information within the answered subpopulation.
  `ml/evaluation/item_information.py` ranks the 36 items statically (bracket-weighted
  MI 0.019–0.064; none below the 0.01 weak threshold). Replacing the weakest items with
  more discriminating ones is clinical authoring, not code.
- **External plausibility (run, with caveats)** —
  `ml/evaluation/external_plausibility.py` compares the synthetic tier shares with
  published Indian estimates. ECDI is not published for India in NFHS-5 (no ECDI
  chapter; the UN SDG API returns no India rows), so the template uses ASQ-3
  community studies. Results:

  | Anchor | Age band | External | Model | Gap |
  |---|---|---|---|---|
  | ASQ-3 global delay, rural North India (n=400) | 6–36 mo | 20.0% Refer | 14.3% | −5.7 pp |
  | Global delay under 2, lower bound | 0–24 mo | 1.0% Refer | 14.2% | +13.2 pp |
  | Global delay under 2, upper bound | 0–24 mo | 2.5% Refer | 14.2% | +11.7 pp |

  Read this honestly: the Refer tier matches a community **screening** study but is
  far above **diagnosed** global-delay prevalence, because a screen flags more than
  a diagnosis. The generator also produces a nearly flat Refer rate across ages,
  which is a real limitation to state rather than tune away.

---

## 9. Reproduce

```bash
cd backend/data/generator && python generate_synthetic_data.py   # latent-threshold labels
cd backend/ml
python train.py                     # model + metrics.json (null controls, calibration)
python evaluation/stress_test.py    # held-out robustness
python train.py                     # embed the refreshed stress summary
python evaluation/model_disabled_demo.py
python -m pytest tests/ -q
```

Canonical numbers: `backend/ml/artifacts/metrics.json`.

---

## 10. Language guide

| Don't say | Say |
|---|---|
| “97% accuracy” | “0.68 macro-F1 on a held-out **synthetic** cohort” |
| “validated” | “content-validated” / “pilot pending” |
| “detects developmental delay” | “recovers the simulated latent severity” |
| “clinical-grade” | “screening and triage decision support” |
| “the model is safe” | “the safety rule deterministically forces Refer on regression” |
| “works on real children” | “has not been evaluated on real children” |
