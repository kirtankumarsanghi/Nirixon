# Clinical Pilot Study Protocol: Nirixon Pediatric Developmental Screening Validation

**Document ID:** NX-CLIN-2026-01  
**Version:** 1.0 (Draft for Institutional Ethics Review / IRB)  
**Study Title:** Prospective Observational Validation of a Mobile Tiered Machine Learning Screener (Nirixon) for Early Developmental Delay in Primary Pediatric Care  

---

## 1. Study Overview & Rationale

### 1.1 Background
Early detection of developmental delays (gross motor, fine motor, communication, cognitive, personal-social) is critical for timely early intervention (< 3 years of age). Conventional paper screening tools (e.g., ASQ-3, Denver II) impose significant administrative burdens and suffer from either high false-positive referral rates (clinic flooding) or under-detection of mild/isolated delays. 

### 1.2 Purpose
This prospective pilot study aims to evaluate the diagnostic accuracy, caregiver usability, and clinical triage efficiency of the **Nirixon Mobile Screening Engine** (Module A early screener with Module B reflex micro-tests) against a standardized clinical developmental assessment by a pediatrician.

---

## 2. Study Objectives & Endpoints

### 2.1 Primary Objective
* To determine the **Sensitivity and Specificity** of Nirixon's Refer classification (Tier 3 and Tier 2) compared to a standardized pediatrician developmental assessment (Bayley-III / Denver II / clinical evaluation).

### 2.2 Secondary Objectives
1. **Clinic Flooding Reduction:** Measure the percentage of screened children categorized into **Tier 1 (Routine Pass)** and **Tier 2 (In-App Reflex Testing)** who avoid unnecessary specialist referrals.
2. **Caregiver Usability & Completion Time:** Measure time-to-completion (target: $< 5$ minutes for 10–15 items) and System Usability Scale (SUS) score.
3. **Response Quality Guard Performance:** Track the incidence of caregiver Acquiescence (ceiling distortion) and Inconsistency flags, validating against pediatrician observation.

---

## 3. Study Design & Methodology

```
Caregiver & Child Visit Pediatric Outpatient Clinic
                     │
                     ▼
       Written Informed Consent & Assent
                     │
                     ▼
  Caregiver Completes Nirixon Screener (App)
  (10-15 adaptive items; 0/1/2 frequency scale)
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
Nirixon Triage Output    Blinded Pediatrician Evaluation
(Tier 1 / Tier 2 / 3)    (Standard Developmental Exam)
         │                       │
         └───────────┬───────────┘
                     ▼
   Statistical Concordance & Safety Audit
```

### 3.1 Blinding
* The examining pediatrician is **blinded** to the Nirixon app scores during the clinical examination.
* The caregiver completes the digital questionnaire prior to or immediately following the consultation.

---

## 4. Participant Selection & Sample Size

### 4.1 Target Sample Size ($N = 250$)
* **Power Calculation:** Assuming a 12% true population prevalence of developmental delay (monitor/refer), a sample of $N = 250$ children provides $> 85\%$ statistical power ($\alpha = 0.05$) to detect a screening sensitivity of $\ge 85\%$ with a 95% confidence interval width of $\pm 8\%$.

### 4.2 Inclusion Criteria
1. Chronological age between 2.0 months and 60.0 months at the date of screening.
2. Primary caregiver accompanied by child, able to provide informed consent.
3. Access to a smartphone or clinic-provided tablet.

### 4.3 Exclusion Criteria
1. Acute severe medical illness requiring urgent emergency treatment (e.g., respiratory distress, acute seizure).
2. Known active encephalopathy or severe uncorrected sensory loss (blindness/deafness) already undergoing specialist treatment.

---

## 5. Clinical Safety & Fail-Safe Net (Ethical Gate)

### 5.1 Deterministic Pediatric Safety Floor
* In accordance with FDA Software as a Medical Device (SaMD) Good Machine Learning Practice, **no patient is triaged solely by unconstrained machine learning probabilities**.
* If any domain score drops below $-2.0$ SD (e.g., severe motor inability or loss of milestone), or if regression is reported, the engine automatically triggers an **Immediate Clinical Safety Override** alerting the attending clinic physician before the family leaves the facility.

### 5.2 Follow-Up Care
* All children categorized into Tier 3 (Direct Referral) receive a guaranteed priority clinical consultation with a developmental pediatrician.

---

## 6. Data Governance, Privacy & Security

1. **De-Identification:** All screening records are pseudonymized using random cryptographic UUIDs (`child_ref` / `pseudonymous_id`).
2. **Local Processing:** Raw responses and free-text inputs remain in encrypted client-side session memory until submission.
3. **Community Health Worker (ASHA / Anganwadi / ANM) Referral Subsystem:**
   - **Opt-in with Consent Recorded:** All community referral coordination requires verified caregiver opt-in consent with immutable UTC timestamps.
   - **Area Isolation:** Frontline workers see only children within their assigned village/ward; cross-area access is strictly blocked (HTTP 403).
   - **Minimal Referral Summary:** Printable PDFs and shareable referral summaries contain exclusively the minimum necessary clinical indicators: age bracket, triage tier, domains of concern, and safety rule trigger. Zero personal names or contact details.
   - **Right to Erasure:** Caregivers can revoke consent or permanently delete child records and referral history at any time.
4. **Regulatory Compliance:** Compliant with Indian Digital Personal Data Protection Act (DPDPA 2023), HIPAA, and ICMR Ethical Guidelines for Biomedical Research Involving Children.

---

## 7. Study Timeline

* **Months 1–2:** Institutional Ethics Committee (IEC/IRB) submission and clinic tablet setup.
* **Months 3–6:** Patient recruitment, prospective data collection ($N = 250$).
* **Months 7–8:** Interim statistical analysis, sensitivity/AUPRC verification against synthetic benchmark predictions.

---

## 8. Analysis tooling

Do not analyse in a spreadsheet. Use the repository tooling so the endpoints match this
protocol:

```bash
cd backend/ml/validation/src
python pilot_analysis.py --data path/to/pilot.csv
```

Start from `docs/pilot_data_TEMPLATE.csv` (one row per participant):
- **accuracy study:** `subject_id, app_tier, reference_tier`
- **test–retest:** `subject_id, tier_t1, tier_t2`

The script reports Refer sensitivity/specificity, PPV/NPV with Wilson 95% CIs, the
3-class confusion matrix and Cohen's κ. It refuses to run without data and never
generates any.

Until this is run, every real-world accuracy statement must read **“pilot pending”**.
