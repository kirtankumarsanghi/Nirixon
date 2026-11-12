# About Nirixon

> **निरीक्षण (Nirīkṣaṇa)** — *Sanskrit for thoughtful observation, active surveillance, and caring scrutiny.*

**Nirixon** is an open-source, privacy-first pediatric developmental screening, clinical triage, and community referral ecosystem. It is purpose-built to close the critical early-intervention gap across low- and middle-income regions—with a primary focus on South Asia and India's frontline public health architecture.

---

## 🌍 The Problem: The "Invisible Delays"

In developing and emerging healthcare ecosystems, **a large share of neurodevelopmental delays, autism spectrum conditions, sensory impairments, and specific learning disabilities are detected only after children reach primary school age (6–8 years)**.

By this point, the optimal biological window of neuroplasticity (ages 0–5) has narrowed significantly. The costs of delayed identification fall heavily on children and families:
- **School Dropouts & Stigma:** Unidentified hearing, speech, or cognitive delays are frequently misattributed to behavioral disobedience or lack of aptitude.
- **Overburdened Tertiary Centers:** Families often travel hundreds of kilometers to metropolitan apex hospitals for routine initial assessments because primary screening is unavailable locally.
- **The Frontline Bottleneck:** Grassroots healthcare workers—such as India's **1,000,000+ ASHA (Accredited Social Health Activists)**, **Anganwadi Workers (ICDS)**, and **ANMs (Auxiliary Nurse Midwives)**—conduct door-to-door community surveys, but depend on bulky paper questionnaires, struggle with low digital literacy tools, and lack closed-loop tracking to verify whether referred children actually reach care.
- **Multi-Caregiver Variance:** In joint-family households, developmental signs are interpreted differently across parents, grandparents, and teachers, leading to internal family conflict and delayed medical consultation.

Nirixon was created to transform this fragmented landscape into a cohesive, equitable, and scientifically grounded continuum of care.

---

## 🎯 Our Mission & Core Principles

Nirixon operates under four fundamental clinical and design invariants:

### 1. Deterministic Clinical Safety Trumps Statistical ML
While calibrated machine learning (a Random Forest production model with TreeSHAP; XGBoost and a soft-voting ensemble are benchmarked) enables dynamic, low-burden adaptive questionnaires, statistical predictions must never supersede established clinical red flags.
- Nirixon incorporates an **uncompromising Deterministic Clinical Safety Floor**: any reported loss of previously acquired speech or motor milestones (developmental regression), severe deficits ($\le -2.0$ Standard Deviations), or sensory failures bypass statistical calculations and trigger an immediate **Tier 3: Priority Referral** with emergency safety guidance.

### 2. Actionable Triage Over Diagnostic Labeling
Nirixon is **NOT** a diagnostic device and never outputs clinical diagnoses (such as "Autism Spectrum Disorder" or "Cerebral Palsy"). Instead, it outputs actionable, stigma-reduced clinical triage recommendations:
- 🟢 **Tier 1: Typical Development** — On-track milestones; family receives encouraging evidence-based home stimulation activities.
- 🟡 **Tier 2: In-App Reflex Monitor** — Borderline or isolated domain lags; triggers scheduled 3-month follow-up surveillance and targeted home exercises.
- 🔴 **Tier 3: Priority Referral** — Substantial milestone deficits or clinical red flags; directs caregivers to verified public facilities (District Early Intervention Centres / DEIC, Civil Hospitals, or RBSK units).

### 3. Grassroots-Native & Offline-First Design
Healthcare technology must work where the patient lives. Nirixon is built for real-world field conditions:
- **Offline-First Progressive Web App (PWA):** Operates without active internet connectivity using local IndexedDB storage, idempotent synchronization, and automatic conflict resolution.
- **Ultra-Accessible UI:** Mobile-first layout calibrated for 360px viewport field smartphones, high-contrast touch targets, reviewed English/Hindi narration, and on-demand narration in eight languages (Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, and English).
- **Zero-Footprint Shared Device Security:** Frontline workers sharing primary health center tablets can log out to immediately and irreversibly wipe all local client caches.

### 4. Culturally Grounded Public Health Alignment
- **Joint Family Concordance:** Allows primary caregivers to invite grandparents, secondary guardians, or teachers to independently answer milestone questions via zero-PII expiring links. Our clinical combination rule ensures red flags reported by any caregiver are preserved while computing a concordance index to guide pediatrician consultations.
- **Direct National Health Mission (NHM) Integration:** Pre-configured referral handoffs conform to **Rashtriya Bal Swasthya Karyakram (RBSK)** screening criteria and **District Early Intervention Centre (DEIC)** intake documentation.

---

## 👥 Who Nirixon Serves

```
                   ┌──────────────────────────────────────┐
                   │               NIRIXON                │
                   └──────────────────┬───────────────────┘
                                      │
         ┌────────────────────────────┼───────────────────────────┐
         ▼                            ▼                           ▼
  [Caregivers & Families]    [Frontline Health Workers]   [Pediatric Specialists]
  • At-home check-ins        • ASHA / Anganwadi / ANM     • Developmental Pediatricians
  • WHO milestone tracking   • Ward caseload management   • Clinical "What-If" sandbox
  • Multilingual audio       • Offline-first survey tool  • Local SHAP attributions
  • Joint family consensus   • 1-touch DEIC referral slip • Multi-model comparisons
```

### 1. Parents & Primary Caregivers
- **Low-Burden Dynamic Check-Ins:** Dynamic early-stopping screening reduces question fatigue from 60+ static items down to 8–18 adaptive items.
- **School-Age NLP Concern Intake (Ages 5–12):** Parents express concerns in their own natural words; intelligent NLP routing maps inputs to relevant developmental domains (attention, reading fluency, emotional regulation, motor coordination).
- **Longitudinal Growth Velocity:** Interactive developmental age vs. chronological age curves aligned with WHO guidelines, with automated plateau alerts if developmental progress halts.

### 2. Frontline Community Health Workers (ASHA / AWW / ANM)
- **Caseload Dashboard:** Real-time visibility into ward-level child rosters, tracking overdue home visits, and identifying children needing priority follow-ups.
- **One-Touch Handoff:** Instant conversion of screening flags into bilingual WhatsApp summaries and printable government-ready clinical slips.
- **Closed-Loop Referral Tracking:** 5-stage lifecycle state machine (`created` ➔ `sent` ➔ `seen` ➔ `outcome recorded` ➔ `closed`) ensuring no referred child gets lost in transit.

### 3. Clinicians, Developmental Pediatricians & Psychologists
- **Explainable Decision Support:** SHAP waterfall charts clearly explain which specific developmental responses contributed to risk scores.
- **Clinician "What-If" Simulation Sandbox:** Enables specialists to load completed sessions and simulate theoretical parameter adjustments (e.g., family history or milestone variances) to observe model sensitivity and calibration shifts in real time.

### 4. Public Health Supervisors & Program Administrators
- **Area-Scoped Governance:** Ward-level data isolation preventing cross-jurisdiction data leakage.
- **Coverage Analytics:** Median time from screening to referral completion, referral-to-seen rates, and ward-wide screening coverage metrics computed from live records.

---

## 🔬 Algorithmic & Architectural Rigor

| Layer | Implementation | Technical & Clinical Rationale |
|---|---|---|
| **Early Childhood Screener (0–60m)** | Adaptive IRT-inspired dynamic questionnaire + calibrated Random Forest (XGBoost/ensemble benchmarked) | Minimizes question count while maximizing domain coverage; probability calibration ensures reliable risk estimates. |
| **School-Age Screener (5–12y)** | NLP Router (`TF-IDF` + `LogisticRegression`) + 8 developmental domains | Converts informal parental vernacular into structured domain priors; prioritizes high safety recall for acute distress and developmental regression. |
| **Explainability Engine** | TreeSHAP local feature attribution | Guarantees transparency by breaking down multi-class risk contributions for every individual child evaluation. |
| **Safety Invariants** | Deterministic rule override engine | Hardcoded clinical boundary rules upstream and downstream of ML inference to catch regressions and severe motor/sensory deficits. |
| **Offline Synchronization** | IndexedDB + Idempotent REST API | UUID-based idempotency keys ensure flaky cellular connections never generate duplicate child records or split referrals. |
| **Backend Service** | Python 3.12 + FastAPI + SQLAlchemy 2.0 | High-performance asynchronous microservice architecture with rate limiting, Pydantic v2 data validation, and JWT security. |
| **Frontend Application** | React 19 + TypeScript + Vite + Tailwind CSS | Fluid, modern client interface with sub-100ms UI response times, full keyboard accessibility, and offline PWA service worker. |

---

## 🔒 Privacy, Ethics & Governance (DPDPA / HIPAA)

Nirixon enforces privacy-by-design at every architecture boundary:

- **Zero PII in Core Referral Tables:** Children are referenced solely by cryptographically generated pseudonymous tokens (e.g., `child-7b92f4e1`). Exact birthdates are never stored in screening records; children are categorized into broad developmental age brackets.
- **Explicit Consent Logging:** No screening session, growth entry, or referral can be created without active, timestamped caregiver opt-in consent.
- **Right to Erasure (DPDPA Sec. 12 & GDPR):** Caregivers retain unconditional control over their data. Triggering erasure permanently cascades deletions across screening answers, growth visits, and referral histories.
- **Ephemeral NLP Ingestion:** Caregiver free-text notes submitted during school-age intake are processed in memory and instantly discarded; only a cryptographic hash is stored for request deduplication.
- **Area-Level Data Isolation:** Database queries enforce strict administrative boundary isolation; frontline workers can only access child records registered within their authorized village or ward.

---

## 📚 Open Science, Validation & Future Horizons

Nirixon is committed to transparent open science and evidence-based medicine:
- **Synthetic Benchmark Baseline:** Initial models were developed and benchmarked on synthetic and semi-synthetic developmental distributions to validate algorithmic recovery without compromising real patient confidentiality.
- **Prospective Field Pilot Protocol:** A complete multi-center clinical validation protocol is detailed in [`docs/pilot_study_protocol.md`](docs/pilot_study_protocol.md) for Institutional Ethics Committee (IEC/IRB) review.
- **Future Integration:** Active roadmap items include **ABDM (Ayushman Bharat Digital Mission)** interoperability, **HL7/FHIR** developmental milestone profile mapping, and expanded local dialect voice-interactive assistance.

---

## 🤝 Contributing & Contact

We welcome pediatricians, clinical psychologists, public health researchers, data scientists, and software engineers to collaborate with us.

- **Repository:** [https://github.com/kirtankumarsanghi/Nirixon](https://github.com/kirtankumarsanghi/Nirixon)
- **Ethics & Data Protocol:** [`docs/ETHICS_AND_DATA.md`](docs/ETHICS_AND_DATA.md)
- **Architectural Reference:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **License:** Open source under the [MIT License](LICENSE).

---

*Every child deserves to have their developmental potential recognized, protected, and nurtured.*
