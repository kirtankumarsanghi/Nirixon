# Content Validity & Cognitive Interview Protocol

**Status:** tooling ready — **no expert ratings or interviews have been run yet.**

This protocol closes the two gaps that do not need patient data. Both are cheap,
fast, and the results are publishable as-is.

---

## 1. Expert content validity (Lawshe CVR)

### Panel
3–5 independent reviewers. Minimum useful mix:
- one paediatrician or developmental paediatrician,
- one child psychologist or developmental specialist,
- one speech-language therapist or special educator.

They must not be authors of the item bank.

### Task
For each item, the reviewer answers **"Is this item essential for screening this
domain at this age?"** (yes/no). A 1–4 relevance scale is also accepted; 3–4 counts
as essential.

### Analysis
`backend/ml/evaluation/content_validity.py` computes Lawshe's CVR:

```
CVR = (n_essential − N/2) / (N/2)
```

and compares it with the one-tailed critical value for the panel size
(N=5–7 → 0.99; 8–9 → 0.78; 10 → 0.62; …). Items below the critical value are
flagged **revise/remove**.

### Run it

```bash
cd backend/ml
cp evaluation/content_validity_ratings_TEMPLATE.csv ratings.csv   # one row per item × rater
python evaluation/content_validity.py --ratings ratings.csv --out artifacts/content_validity.csv
```

The script refuses to run without a ratings file. It will not fabricate ratings.

### Reporting
Report: panel size and composition, number of items retained/flagged, the CVR table,
and the resulting item changes. This is **content validity** — not clinical accuracy.

---

## 2. Cognitive interviews (item comprehension)

### Participants
5–15 caregivers of children in the target age bands, recruited across literacy levels
and both languages (Hindi and English). 5 per round, iterate on wording, then confirm.

### Procedure (per caregiver, ~30 minutes)
1. Consent and purpose (testing the *questions*, not the caregiver).
2. Think-aloud: read each item, say what it means in their own words.
3. Probes:
   - "What would you be counting when you answer this?"
   - "Which child are you thinking of — this child or another?"
   - "What would make you choose the middle answer?"
   - "Is any word unclear or uncomfortable?"
4. Record: comprehension (correct/partial/wrong), ambiguity, translation issues,
   and suggested wording.

### Output
A short table per item: comprehension rate, identified ambiguity, revised wording.
Items with repeated misunderstanding are rewritten before the pilot.

---

## 3. What these buy you

| Claim | Evidence after this |
|---|---|
| Items measure the intended domain | expert CVR |
| Caregivers understand the items as intended | cognitive interviews |
| Items are culturally/linguistically appropriate | interview notes + back-translation |

They do **not** establish diagnostic accuracy. That still requires the pilot
(`docs/pilot_study_protocol.md`).
