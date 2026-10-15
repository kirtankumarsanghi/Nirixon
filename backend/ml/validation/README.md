# Nirixon Module A validation starter kit

This kit helps you carry out the Module A plan in the "Nirixon: Audit and Corrected Validation Plan" doc. It gives you runnable code, templates, and copy-paste prompts for each step.

**What it is:** a working simulator (hidden true status generates noisy answers), an ASQ-style rule baseline, bootstrap and Wilson intervals, stress tests, leave-one-simulator-out, and a vignette agreement script.

**What it is not:** your results. The example output in `example_results/` uses a placeholder item bank and my invented noise settings. Never quote those numbers in a deck.

## 15-minute smoke test

```bash
cd nirixon_validation
pip install -r requirements.txt
python src/run_all.py --quick        # about 15 seconds; writes results/numbers_sheet.md
```

You should see a numbers sheet with a WARNING that the item bank is a placeholder. That warning disappears only when `data/item_source.csv` exists and is filled in (see step 3).

## Order of work

Each step lists what to do, the file to use, a prompt you can paste into Claude Code (or any coding assistant opened in your Nirixon repo), and when it is done. File names in the prompts come from your own file tree.

### Step 1. Freeze the numbers (days 1-3)

Do: make every training run write one `metrics.json`, and generate every table in your documents from it.

Prompt:
```
In my Nirixon repo, Module A training lives in backend/ml/train.py and backend/ml/evaluation/.
Task: make one source of truth for metrics. Every training run must write
backend/ml/artifacts/metrics.json with: validation and test macro AUPRC, Refer AUPRC, macro F1,
accuracy for logistic regression, random forest and XGBoost; the XGBoost confusion matrix;
test class counts; random seed; date; git commit hash. Then write scripts/make_numbers_sheet.py
that reads metrics.json and prints a markdown table. Do not change model behaviour.
Show me the diff and run the tests. Afterwards list every number in docs/ and README.md that
does not match metrics.json.
```
Done when: no document shows a number that is not in `metrics.json`.

### Step 2. Fix structure and wording (day 3)

Your six domains are Communication, Gross Motor, Fine Motor and Personal-Social (as in ASQ-3), plus Cognitive (close to ASQ-3's Problem Solving) and Self-Help (your own). ASQ-3 has 21 questionnaires, and 15 and 21 months are not on its listed intervals, so say "17 age brackets with ASQ-style spacing".

Prompt:
```
Search the whole repo (code, docs, README, slides text) for: "17 ASQ-3", "ASQ-3 interval",
"ASQ-3 bracket", "5 domains", "6 domains", "Self-Help", "Cognitive", "Problem". Produce a table of
file:line occurrences with a proposed replacement consistent with this wording:
"Six domains: Communication, Gross Motor, Fine Motor and Personal-Social as in ASQ-3; Cognitive
(close to ASQ-3 Problem Solving, anchored to CDC cognitive milestones); Self-Help (author-set).
17 age brackets with ASQ-style spacing." Do not edit anything yet. Show the table.
```
Done when: the blueprint, handbook and slides agree.

### Step 3. Build the item-source table (week 1)

Do: copy `data/item_source_TEMPLATE.csv` to `data/item_source.csv` and fill every item: its domain, the age at which at least 75% of children succeed (`age75_months`, the CDC rule), the steepness `s_months`, and the source. For WHO motor items, the six rows already hold the computed values (midpoint approximation). Write your own item wording; do not copy ASQ items (Brookes requires written permission to adapt or excerpt them).

Prompt (you supply the CDC checklist text, so you can check every mapping):
```
Here is the list of my Module A items from backend/data/generator/item_bank.py and below it the
CDC milestone checklists text I copied from the CDC website. For each of my items, propose the
closest CDC milestone and its checklist age, or say "no match". Output a CSV with columns:
item_id, domain, cdc_milestone_text, cdc_age_months, confidence (high/medium/low), reason.
Do not invent ages. If there is no clear match, leave cdc_age_months empty. I will verify every row.
```
Then put the verified ages in `age75_months` (CDC checklists keep a milestone only if at least 75% of children are expected to achieve it by that age). Set `s_months` to 1-3 for infants and larger for older ages. Mark Self-Help items "author-set". Done when no item has an empty source cell. Then `python src/run_all.py` runs without the placeholder warning.

### Step 4. Build simulator v2 in your generator (weeks 1-2)

Open `src/sim_v2.py`. Read the comments: hidden `theta`, answers generated from development age, label from `theta`.

Prompt:
```
Read kit file nirixon_validation/src/sim_v2.py and my current backend/data/generator/synthetic_cohort.py
and label_derivation.py. Port the hidden-status design into a new
backend/data/generator/synthetic_cohort_v2.py using my real item bank and 17 age brackets.
Requirements: (1) the label must be derived only from the hidden ability values, never from the
answer columns; (2) the target class mix is a config value, documented as a design setting;
(3) add a pytest that shuffles the answer columns and shows the labels do not change;
(4) keep the old generator untouched. Show me the diff and run the tests.
```
Done when: `label_derivation.py` no longer reads the answer columns, and the pytest passes.

Set your own assumptions (`pace`, `slip`, `yes_bias_share`, `g_weight`) in `src/config.py`. They are marked ASSUMPTION; say so in your report and test them in step 7.

### Step 5. Match deployment: only ask what the app asks (week 2)

Prompt:
```
Read backend/app/core/adaptive_tree.py, imputation.py and mandatory_items.py. Write a function in
backend/ml/ that replays the adaptive tree for each simulated child: mandatory background flags
first, minimum 8 items, minimum 3 domains, hard cap 18 items, then peer-median imputation exactly as
production does. It returns the masked and imputed feature matrix. Train and evaluate on that output.
Report results with and without masking in one table. Do not change production code.
```
Done when: results are reported with and without masking.

### Step 6. Baselines (week 3)

`src/baseline.py` is an ASQ-style rule: per age bracket, norms from typical children, Refer below -2 SD and Monitor between -1 and -2 SD, tier from the worst domain. Compare at the same Refer recall (the ASQ-3 convention is documented by Brookes; do not copy its tables).

Prompt:
```
Port nirixon_validation/src/baseline.py to backend/ml/evaluation/baseline_rule.py using my feature
columns. Evaluate XGBoost, random forest and the rule on the same test set at the same Refer recall
(threshold chosen on validation). Output a table: Refer AUPRC, precision at recall 0.85, share
flagged. If XGBoost is not clearly better, say so in the output.
```
Done when: a table compares rule, RF and XGBoost at equal recall.

### Step 7. Stress tests and leave-one-simulator-out (weeks 3-4)

`src/stress.py` runs 15 scenarios (answer noise, yes-sayers, prevalence, pace, domain correlation, wrong age, fewer or more items) and a leave-one-simulator-out loop. `python src/run_all.py` writes both tables.

Honest note from my toy run: randomized training did not beat the single-simulator model in most held-out settings (it helped a little when domain correlation changed). Do not assume randomization helps; let your results decide. The "items per domain = 6" row also showed that a model trained on 3 items per domain can degrade a lot when given more, so test the exact deployment condition.

Prompt:
```
Extend nirixon_validation/src/stress.py for my pipeline: add scenarios for my real age brackets and
my real item counts, run them with my XGBoost configuration, and write results/stress_tests.csv.
Then add one markdown paragraph that states the worst-case Refer recall and which scenario causes it.
```

### Step 8. Report with uncertainty (week 4)

`src/evaluate.py` has Wilson intervals, bootstrap intervals and the prevalence baseline.

Prompt:
```
Add bootstrap 95% confidence intervals (500 resamples) and Wilson intervals to
backend/ml/evaluation/metrics.py for macro AUPRC, Refer AUPRC, Refer recall and precision. Add a
calibration plot (sklearn calibration_curve) for the Refer class and print the prevalence next to
every AUPRC. Update metrics.json so the numbers sheet includes intervals.
```

### Step 9. Expert vignette study (weeks 4-6)

Use `data/vignette_template.csv`. Write 40 fictional profiles (10 clearly typical, 10 clearly Refer, 20 borderline). Send the clinician only `vignette_id`, `age_months` and `fictional_profile`; keep `design_group` hidden. Fill `clinician_label` and `tool_label`, then run `python src/agreement.py data/vignette_template.csv`.

Prompt for drafting (you and your clinician must review every profile):
```
Write 40 fictional child profiles for a developmental screening vignette study, ages 6 to 54 months,
each 2-3 sentences describing milestones in everyday language, written so a pediatrician could rate
Typical / Monitor / Refer. Distribution: 10 clearly typical, 10 clearly Refer (include a loss of
previously acquired skills in 3), 20 borderline. Do NOT put any label in the text. Output two files:
profiles.csv (vignette_id, age_months, fictional_profile) and answer_key.csv (vignette_id,
design_group). Mark every profile "FICTIONAL". Avoid real names.
```

### Step 10. Draft the pilot protocol (weeks 6-8)

Prompt:
```
Draft a one-page pilot protocol for a shadow-mode diagnostic accuracy study of a parent-completed
developmental screening app (children 2-60 months) against a clinician's blinded assessment.
Use only these facts: ICMR rules (under 7 years parental consent only; 7-11 oral assent with a
parent present; 12-18 written assent; one parent may suffice for minimal or low risk; ethics
committee with pediatric expertise), reporting by STARD 2015 (30 items), sample size table
(sensitivity 0.85: 49 cases for +-0.10, 100 cases for +-0.07; specificity 0.80: about 62 typical
children for +-0.10), DPDP Act Section 9 parental consent. Leave bracketed placeholders for the
ethics committee name, site, clinician, dates and funding. Do not invent approvals or names.
```

### Step 11. Fix the wording everywhere

Prompt:
```
Rewrite these sentences for my deck: "accurate", "validated", "works on real children",
"73/20/7 matches real populations", "100% safety recall". Use: "verified on simulated data",
"prevalence is a simulation setting", "real-world performance is unknown until a pilot".
Keep every number tied to metrics.json.
```

## Plugging the kit into your repo

1. Keep the kit as a separate folder first and run it end to end with your item bank.
2. Port one module at a time using the prompts above, with the kit file as the reference.
3. Run your existing pytest suite after each port.
4. Swap `new_model()` in `src/stress.py` for your XGBoost configuration if you want the kit's tables to use the production model (`pip install xgboost`). XGBoost's `monotone_constraints` setting exists, but its documentation does not say whether it works with a three-class objective, so test that first.

## Resources (all opened and checked)

- CDC 75% milestone rule: Zubler et al., Pediatrics 2022 - https://veipd.vcu.edu/media/veipd/pdfsarchives/evidence-informed-milestones-for-developmental-surveillance-tools.pdf
- WHO motor windows: Martorell et al., Acta Paediatrica 2006 - https://www.rti.org/publication/motor-development-study-windows-achievement-six-gross-motor-development-milestones
- ASQ-3 cutoffs (referral 2 SD below the mean; monitoring zone 1-2 SD): https://llm.agesandstages.com/content/support/kb/article/329-is-there-a-cutoff-point-for-the-monitoring-zone-on-asq3-as-there-is-for-the-referral-zone.md
- ASQ-3 structure (21 questionnaires, five areas): https://llm.agesandstages.com/content/wp-content/uploads/2019/01/asq-3-at-a-glance-pdf.md
- Brookes permission to adapt or reproduce ASQ-3: https://llm.agesandstages.com/content/support/kb/article/278-can-i-use-some-of-the-questions-from-asq3-or-asqse2-in-a-tool-that-i-am-creating.md
- Indian ASQ benchmark (83.3% sensitivity, 75.4% specificity vs DASII, 200 children): https://www.indianpediatrics.net/june2012/june-457-461.htm
- D-score package (item difficulties for many instruments, Apache licence): https://cloud.r-project.org/web/packages/dscore/refman/dscore.html
- WHO GSED: https://www.who.int/news/item/27-02-2023-who-rolls-out-new-holistic-way-to-measure-early-childhood-development
- Domain randomization: Tobin et al. 2017 - https://arxiv.org/abs/1703.06907
- XGBoost monotonic constraints: https://xgboost.readthedocs.io/en/stable/tutorials/monotonic.html
- Evaluating synthetic data (fidelity, utility, privacy; circularity warning): https://arxiv.org/pdf/2504.18544
- Sample-size method (epiR documentation): https://search.r-project.org/CRAN/refmans/epiR/html/epi.ssdxsesp.html
- STARD 2015: https://atm.amegroups.org/article/view/9342/html
- ICMR guidelines for research involving children: https://web.iitd.ac.in/~elangovan/ethics/doc/National_Ethical_Guidelines_for_BioMedical_Research_Involving_Children.pdf
- DPDP Section 9: https://dpdp.myndsolution.com/wiki/act/section-9-processing-of-personal-data-of-children/
- Prevalence anchor (12.0% of children aged 2-9 had an NDD in five districts): https://pmc.ncbi.nlm.nih.gov/articles/PMC6057634

## Honest limits of this kit

- The simulator's pace, slip, yes-bias and correlation settings are my modelling assumptions. No source gives these numbers.
- With the placeholder item bank every number is illustrative.
- The kit does not use your real data, your real adaptive tree or your production model until you port it.
- Nothing here validates the screener on real children. That needs the pilot described in the plan doc.
