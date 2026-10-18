# Ethics, Privacy & Data Governance Architecture

**Nirixon Pediatric Developmental Screening & Community Referral System**  
**Document ID:** NX-ETH-2026-01  
**Status:** Approved / Enforced  
**Regulatory Frameworks:** Digital Personal Data Protection Act (DPDPA 2023), HIPAA, ICMR Guidelines for Biomedical Research Involving Children.

---

## 1. Core Ethical Principles

1. **Screening, Never Automated Diagnosis:**
   Nirixon produces risk categorizations and developmental triage indicators (Tier 1: Routine, Tier 2: In-App Reflex Monitor, Tier 3: Priority Referral). It never claims definitive diagnostic authority, which remains exclusively within the domain of qualified pediatricians and multidisciplinary clinical teams.

2. **Conservative Clinical Safety Floor:**
   Machine learning probability outputs are strictly subordinated to deterministic pediatric safety floors. If a developmental milestone regression or critical gross motor red flag is reported (e.g. score drop $\le -2.0$ SD), a protective clinical override immediately triggers priority referral regardless of the model's raw probability.

3. **On-Device by Default:**
   All caregiver questionnaires, interactive touch telemetry, and milestone responses are processed locally on the client device. No central child profiles or cloud databases are created without separate, explicit opt-in consent.

---

## 2. Community Health Worker (ASHA / Anganwadi / ANM) Referral System

Nirixon provides an integrated community triage and referral coordination subsystem designed specifically for frontline public health workers in India (Accredited Social Health Activists - ASHA, Anganwadi Workers - AWW / ICDS, and Auxiliary Nurse Midwives - ANM) and their supervisors.

### 2.1 Explicit Opt-In & Consent Verification
* **Mandatory Caregiver Consent:** No child record or referral may be registered in the system without verified, active caregiver consent (`consent_given=True`, `opt_in=True`).
* **Timestamped Consent Trail:** Every child registration captures an immutable UTC timestamp (`consent_recorded_at`).
* **Voluntary Participation:** Caregivers can opt out or decline referral coordination at any stage without affecting their child's healthcare access.

### 2.2 Pseudonymous Identifiers & Zero PII
* **No Real Names:** Child records are referenced exclusively by random cryptographic pseudonymous tokens (e.g., `child-c9f1a238`). Child names and parental names are never stored on referral servers.
* **Coarse Age Brackets Only:** Exact birth dates (day/month/year) are prohibited. Children are tracked by age bracket (e.g., `18-24m`, `24-30m`) to prevent re-identification.
* **No Contact Information:** Phone numbers, home street addresses, and social identifiers are completely excluded from referral records.

### 2.3 Strict Area-Level Geographic Isolation
* **Village & Ward Partitioning:** Every frontline worker is assigned to a specific geographic catchment area (`village_ward`, e.g., "Ward 12", "Rampur Village").
* **Access Control Invariant:** A worker has permission to view, query, or refer children **only** within their designated area.
* **Zero Cross-Area Leakage:** Any attempt by a worker to read, retrieve, or refer a child belonging to another village or ward is blocked with HTTP 403 Forbidden.
* **Supervisor Scope:** Supervisors oversee coordination within their designated sector or district.

### 2.4 Minimal One-Page Referral Summary
To guarantee clinical interoperability while eliminating data leakage, Nirixon's generated referral handoff summary (printable PDF and shareable text) contains **strictly and exclusively** the minimum necessary indicators required by the receiving specialist:
1. **Age Bracket** (e.g., `18-24m`)
2. **Triage Tier** (e.g., `Tier 3: Direct Referral`)
3. **Domains of Concern** (e.g., `['Gross Motor', 'Communication']`)
4. **Safety Rule Trigger** (e.g., `'Loss of motor milestones (SD <= -2.0)'` or `None`)

All personal identifiers, contact numbers, detailed parent recall strings, and extraneous records are completely omitted from the referral handoff.

### 2.5 Referral Lifecycle & Enforced Status Transitions
Referrals follow an auditable five-stage progression:
```
[created] ──► [sent] ──► [seen] ──► [outcome recorded] ──► [closed]
   │             │         │
   └─────────────┴─────────┴────────────────────────────────► [closed]
```
* Status transitions are strictly validated. A referral cannot skip stages (e.g., moving directly from `created` to `outcome recorded` is rejected).
* Post-referral follow-up outcomes can only be recorded after a child has been documented as `seen` at the referral facility.
* Every transition records an auditable timestamp (`sent_at`, `seen_at`, `outcome_recorded_at`, `closed_at`).

### 2.6 Caregiver Right to Erasure & Removability
* **Instant Removal:** In compliance with the Right to be Forgotten (DPDPA 2023 Section 12), caregivers or authorized workers can permanently delete a child's record at any time.
* **Cascade Purge:** Deletion of a child record automatically and permanently purges all associated referrals and follow-up logs from the database.
* **Consent Revocation:** Caregivers may revoke opt-in consent at any time, instantly removing the child from all worker rosters and active referral pipelines.

### 2.7 Progressive Web App (PWA) Offline Storage, Zero-PII Invariant & Device Data Lifecycle
* **Offline Field Operations:** Frontline health workers (ASHAs and Anganwadi workers) routinely conduct home visits in rural hamlets and urban settlements with intermittent or absent cellular network connectivity. Nirixon provides a Progressive Web App (PWA) service worker (`sw.js`) and client-side IndexedDB database (`nirixon_chw_offline_db`) allowing workers to record developmental screenings, door-to-door visits, and clinical referrals completely offline.
* **Browser Storage Disclosure:** Browser storage is used specifically and exclusively for:
  1. `cached_children`: Local roster of pseudonymous child records within the worker's assigned area.
  2. `sync_queue`: Outbox queue of offline actions awaiting sync.
  3. `offline_screenings`, `offline_referrals`, `offline_contacts`, `offline_outcomes`: Pending records tagged with client-generated UUID idempotency keys.
  4. `conflict_log`: Audit records of resolved synchronization conflicts.
* **Zero-PII Local Invariant:** Even in offline browser storage, records contain no real names, parent names, phone numbers, or residential street addresses. All records reference pseudonymous IDs (e.g. `child-c9f1a238`).
* **Idempotent Synchronization:** When reconnected, all offline queue items sync via the `/api/chw/sync` batch endpoint. Multiple sync attempts or retries produce zero duplicate screenings or referrals.
* **Device Wipe on Logout:** Frontline health workers frequently share village tablets or mobile devices across shifts. To prevent unauthorized data exposure between workers or upon device handover, logging out triggers an immediate, irreversible wipe (`clearAllOfflineData()`) of all IndexedDB object stores and cached queues.

