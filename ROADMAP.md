# 🗺️ Nirixon Product & Clinical Roadmap

This roadmap outlines the milestones, completed capabilities, active developments, and future horizons for the **Nirixon** platform.

---

## 📍 Phase 1: Core System Architecture & Engine Foundations *(Completed & Test-Verified)*

- [x] **Dual-Module Screening System:**
  - [x] **Module A (0–60 Months):** Adaptive dynamic questionnaire engine, calibrated Random Forest classifier (XGBoost/ensemble benchmarked), and TreeSHAP local explainability.
  - [x] **Module B (5–12 Years):** Free-text NLP concern router (TF-IDF + LogisticRegression) across 8 developmental and learning domains, plus sensory rule-outs.
- [x] **Clinical Safety Infrastructure:**
  - [x] Inviolable Deterministic Clinical Safety Floor (milestone regression override, severe deficit thresholding, sensory flags).
  - [x] Gestational age prematurity correction formula for infants under 24 months.
  - [x] Acute crisis bypass with verified Indian helpline routing (Tele-MANAS, Kiran, Childline).
- [x] **Frontline Worker (ASHA / Anganwadi / ANM) Portal:**
  - [x] Ward-level child caseload roster with quick filters (Tier 3, overdue follow-ups, age brackets).
  - [x] Offline-first Progressive Web App (PWA) with persistent client IndexedDB queue (`nirixon-chw-offline`).
  - [x] Idempotent synchronization engine (`POST /api/chw/sync`) with client-generated UUID keys and automated conflict logging.
  - [x] Strict 5-stage auditable referral lifecycle (`created` ➔ `sent` ➔ `seen` ➔ `outcome recorded` ➔ `closed`).
  - [x] Area-level data isolation preventing cross-ward data leakage.
- [x] **Family & Community Modules:**
  - [x] Multi-caregiver Joint Family Concordance module with zero-login 72-hour expiring links and mathematical concordance index.
  - [x] Longitudinal developmental growth tracking and WHO milestone velocity curves with automated plateau detection.
  - [x] Geospatial Find Help directory with PIN code and GPS Haversine distance lookup for DEIC, RBSK, and hospital facilities.
- [x] **Clinician & Specialist Tools:**
  - [x] "What-If" Simulation Sandbox allowing pediatricians to perturb inputs and observe real-time SHAP and calibration shifts.
- [x] **Accessibility & Multi-Language Support:**
  - [x] Pre-recorded and synthesized audio narration pipeline supporting 8 regional Indian languages (Hindi, Marathi, Tamil, Telugu, Bengali, Gujarati, Kannada, English).
  - [x] Mobile-first UI responsive down to 360px viewport with high-contrast accessibility targets.

---

## 📍 Phase 2: Prospective Clinical Field Pilots & Enhanced Field Workflows *(Current Horizon)*

- [ ] **Multi-Center Clinical Pilot Studies:**
  - Institutional Ethics Committee (IEC/IRB) approval for pilot deployments under `docs/pilot_study_protocol.md`.
  - Calibration verification on real-world clinical cohorts across primary health centers (PHCs) and district hospitals.
  - Inter-rater reliability testing between ASHA worker screenings and developmental pediatrician gold-standard assessments.
- [ ] **Frontline Operational Enhancements:**
  - [x] Frontline training mode with curated sample cases and knowledge quizzes.
  - [ ] Extended offline storage for local audio clips in regional dialects to eliminate data usage during remote field visits.
  - [ ] Voice-assisted question capture for caregivers with limited literacy.
- [ ] **Expanded Caregiver Wellbeing:**
  - [x] Edinburgh Postnatal Depression Scale (EPDS) caregiver wellbeing module with item-10 self-harm safety intercept.
  - [ ] Integrated longitudinal family support guides and milestone activity calendars.

---

## 📍 Phase 3: National Health Stack Integration & Interoperability *(Future Horizon)*

- [ ] **Ayushman Bharat Digital Mission (ABDM) Integration:**
  - Seamless linking with **ABHA (Ayushman Bharat Health Account)** IDs for longitudinal developmental records.
  - Compliance with the National Digital Health Blueprint (NDHB).
- [ ] **HL7 / FHIR Standards Compliance:**
  - FHIR R4 developmental milestone observation profiles and referral resources.
  - Standardized health information exchange (HIE) export for District Early Intervention Centres (DEIC) and state health portals.
- [ ] **Direct RBSK Mobile Team Telemetry:**
  - Bi-directional synchronization with state RBSK portal registries to accelerate intervention queues.
  - Automated SMS and WhatsApp follow-up reminders directly to caregivers for scheduled DEIC appointments.
