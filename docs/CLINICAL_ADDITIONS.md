# Clinical Additions: Sensory, Nutrition, Context and EPDS

All additions are **screening/triage**, never diagnosis. They extend the existing
Tier 1/2/3 model and preserve the deterministic safety floor.

## Vision and hearing

- Module B already had `vh_*` rule-outs; positive answers force Tier 3.
- Module A now has a two-question sensory quick screen (`vision_flag`,
  `hearing_flag`) in `app/core/sensory_items.py`.
- Sensory answers live in `ScreeningSession.sensory_answered`, outside the ML
  feature vector and outside domain quotas.
- Any positive answer forces `Refer` via `get_deterministic_override`
  (`override_rule = "sensory_flag"`).

## Nutrition (MUAC + weight-for-age)

- `app/core/nutrition/flags.py` computes:
  - MUAC status (severe/moderate/normal, age-stratified).
  - Weight-for-age z-score from a compact WHO 2006 approximation table.
  - A reported-anemia flag.
- Measurements are optional and entered during check-in setup or by a frontline
  worker; they are stored in `ScreeningSession.measurements` and returned as
  `ResultPayload.measurements` + `ResultPayload.nutrition`.
- Severe underweight or severe acute malnutrition forces Tier 3; moderate
  malnutrition produces Tier 2/monitor guidance.
- The reference table is explicitly provisional and must be replaced with the
  full WHO LMS table and clinically reviewed before deployment.

## Parent context (Module B)

A short fixed pass after the adaptive questions:

1. Prematurity / low birth weight
2. Screen time
3. Sleep
4. Home learning materials
5. Safe study/play space
6. Adult help with schoolwork

Answers are stored in `context_answers` and derive `context_flags` such as
`prematurity`, `high_screen_time`, `no_home_learning_materials` and
`no_safe_study_space`. They never enter the child's domain scores.

## Caregiver wellbeing (EPDS)

- Separate module at `/api/maternal/*` and the **Your wellbeing** view.
- 10 items, 0–30; `>=10` monitor, `>=13` refer.
- Item 10 > 0 triggers the urgent helpline path regardless of the total.
- Never merged into the child's developmental result.
- Wording and scoring are `pending clinical review`.
