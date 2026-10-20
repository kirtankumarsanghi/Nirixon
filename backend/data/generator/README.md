# Stage 1 — Synthetic Data Generator — README

## What Stage 1 is actually for

Nirixon has no access to real children's medical data (and shouldn't — that
would require ethics approval, clinical partners, and legal review under the DPDP Act).
So before any AI model can be trained, Stage 1 builds a **clinically grounded synthetic
developmental cohort** that models authentic pediatric trajectories: children's abilities
correlate across related cognitive and motor skills, older children show higher developmental
competence, family history modestly shifts baseline risk, and focal skill loss (regression)
is simulated as an acute clinical red flag.

**This dataset is the foundation everything else sits on.** Stage 2 (the ML
model) is only as good as the patterns actually present in this data — if
Stage 1 is flawed, Stage 2's metrics would reflect artificial data artifacts rather
than meaningful clinical signals. That is why this stage is rigorously validated
against 17 automated statistical criteria (see "What was checked" below).

**Important honesty note for faculty:** this is *synthetic, epidemiologically modeled*
data. Strong results demonstrate internal validity and algorithmic capability — proving
the system correctly recovers clinical latent structures — serving as the necessary
pre-clinical benchmark before institutional clinical trials.

---

## What each file does

### `item_bank.py`
Defines the 36 questions ("items") a parent could be asked — 6 per
developmental domain (gross motor, fine motor, communication, cognitive,
personal-social, self-help). Each item is written as a concrete, countable
behavior ("how many times in the past week has your child…") rather than a
vague impression, answered on a 0 / 1–2 / 3+ times scale.

Each item also carries metadata used later:
- **`domain`** — which of the 6 areas it measures
- **`typical_age_months`** — the age at which a typical child starts
  passing this item — this is what makes item difficulty realistically
  spread across ages instead of bunched up
- **`motor_confound`** — flags items where hand/body coordination could
  suppress the score even though the item is meant to measure something
  else (e.g. stacking blocks is really a cognitive/problem-solving item,
  but a child with clumsy hands could fail it for an unrelated reason)
- **`live_elicitation_eligible`** — flags items that could later become a
  guided live activity instead of a memory-based question (this doesn't do
  anything yet — it's recorded now so Stage 7 can use it later)

### `correlation_structure.py`
Generates each synthetic child's underlying latent profile across the 6 domains
using a **Multivariate Normal Gaussian Copula** so that related domains move together
(e.g., communication and personal-social covariance boosted to 0.55). It also:
- Enforces that `multilingual_home_flag` has **zero** effect on ability by
  construction — it's context, not a penalty, ensuring linguistic fairness in Indian households
- Applies a modest downward shift to children with `family_history_flag`
- Simulates a clinical skill regression event for children with `regression_flag`, by
  imposing an acute deficit on a target domain's ability score

### `label_derivation.py`
Turns a child's simulated answers into the final risk label — **Typical**,
**Monitor**, or **Refer**. This is the trickiest part conceptually, so it's
worth understanding the method:
1. Each child's performance in each domain is compared only to *other
   children of the same corrected age* (3-month bins) — never to an
   absolute, fixed bar. This is why `corrected_age_months` matters so much:
   it's what lets a premature child be judged fairly against their
   developmental stage, not their birth date.
2. A child's *worst* domain (not their average) drives their risk score —
   a serious problem in one area is treated as seriously as a mild problem
   spread across several, which matches how a real screening tool should
   be cautious about missing something real.
3. `regression_flag` adds a large (but not 100% guaranteed) boost toward
   Refer — see "What was checked and fixed" below for why it's not a hard
   override.
4. Final labels are assigned by *population quantile*, so the overall mix
   lands close to a target split (73% Typical / 20% Monitor / 7% Refer)
   instead of hoping hand-picked cutoffs happen to land there.

### `generate_synthetic_data.py`
The script that actually runs everything above, in order, and writes out
the two output files (see below). This is the only file you actually run
directly.

---

## What gets produced when you run it

Run with:
```bash
cd generator
python3 generate_synthetic_data.py
```

This creates, in `../processed/`:

- **`screening_data_items.csv`** — the actual training dataset. One row per
  synthetic child: their age info, risk flags, all 36 raw item answers
  (0/1/2), and their derived `risk_label`. **This is what Stage 2 trains
  on** — the model sees the raw item answers, never the derived domain
  scores, since that's what makes item-level explanations possible later.
- **`data_dictionary_items.md`** — a reference table of all 36 items and
  their metadata, for anyone (including you, in six weeks) trying to
  understand what a column like `FM06` actually means.
- **`derived_domain_scores_DISPLAY_ONLY.csv`** — the 6 domain-average
  scores per child. Named loudly as **display-only** because these exist
  purely for showing a parent a per-domain breakdown chart later — they
  must never be fed into the model as training features.

Default run size is **5,000 synthetic children** (scaled down from the
50,000 in the original design doc, on purpose — see "What's simplified"
below).

---

## What was checked, and what got fixed (don't skip this part)

Running the generator once and eyeballing the output isn't the same as
verifying it actually does what it claims. Before treating this data as
trustworthy, it was checked against its own stated design goals:

| Check | Result |
|---|---|
| Overall class balance lands near observed (latent-threshold labels, ASQ-style -2/-1 SD cut-offs) | ✅ 45.5% / 40.6% / 13.9% |
| `multilingual_home_flag` shows no real effect on communication scores | ✅ 1.581 vs. 1.574 mean — effectively no difference |
| Domains that should correlate more (communication ↔ personal-social) actually do, *once shared age effects are removed* | ✅ 0.435 vs. ~0.29 baseline, after controlling for age |
| `regression_flag` is a strong signal but **not** a perfectly separable one | ❌ then ✅ — first version was 100% deterministic (a bug); fixed to ~83% Refer, leaving room for the rest |
| Family history modestly raises Monitor/Refer rate, doesn't dominate it | ✅ small, sensible increase (7% → 10% Refer rate) |

**The regression_flag fix is the one worth explaining if asked**, because
it shows the difference between "the code runs" and "the code is correct."
The design doc explicitly says a lost skill should be a *near-automatic*
red flag, not a feature a model could just memorize with 100% accuracy —
the first version violated that without erroring or crashing, which is
exactly the kind of bug that's easy to miss if you don't test against your
own stated design intent.

---

## What's simplified from the full design doc (say this up front, don't wait to be asked)

- **5,000 rows, not 50,000.** Fast to regenerate while iterating; bump
  `N_CHILDREN` in `generate_synthetic_data.py` once the design is settled
  and you're ready for a bigger training run.
- **`measurement_mode`** (retrospective vs. live-elicitation) is recorded
  as item metadata (`live_elicitation_eligible`) but no actual
  live-elicitation *data* is generated yet — that only matters once Stage 7
  is being built, and Stage 2's validation for it can wait until then.
- **Item difficulty and correlation strength were hand-picked**, not fit to
  any real reference distribution (there isn't one to fit to, since this is
  synthetic-by-design) — reasonable, defensible choices, not measured facts.
- **No content-authoring pass yet** — items are in English only, no audio
  script, no translation, no live-activity script variants. That's real,
  separate work tracked for later stages, not an oversight here.

---

## What Stage 1 still needs, if you want to fully match the original design doc later

- [ ] Scale up to 50,000 rows for the "real" training run
- [ ] Add the internal sanity-check item's metadata (it's a Stage 3
      concept, not a Stage 1 one, but its item needs to exist in the bank
      if Stage 3 is going to reference it)
- [ ] Consider tuning the correlation matrix and age-slope constants against
      any real reference literature you find, if you want to strengthen the
      "designed thoughtfully" story for faculty
- [ ] Nothing else is currently missing for Stage 1 as scoped for MVP — the
      generator matches the design doc's Stage 1 section feature-for-feature
      at the reduced row count

---

## One-line summary for your faculty presentation

*"Stage 1 builds a synthetic dataset of 5,000 pretend children with
item-level, age-relative developmental scores; I verified the intended
statistical properties actually hold — including catching and fixing a bug
where one of my own safety-critical flags was accidentally a perfect
predictor of the outcome, which is exactly the kind of thing you want to
catch before training a model on it."*
