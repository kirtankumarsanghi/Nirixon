# Module B Integration Mapping

This document maps Nirixon's existing backend components to the finished Module B (ages 5–12) NLP + adaptive question package (`nirixon_module_b/nirixon_module_b`).

## Component Mapping Table

| Nirixon Existing Concept | File / Location in Backend | Module B Package Concept | Package Location (`nirixon_module_b/`) | Role & Integration Plan |
|---|---|---|---|---|
| **School-Age Item Bank** | `backend/data/generator/item_bank_b.py` (56 items, 4 rule-outs) | Tagged Question Bank (2,412 items, 405 concepts) | `data/question_bank_b.csv` (`Bank` in `src/engine_b.py`) | Runtime question bank. Bank path configured via `MODULE_B_DATA_DIR`. Retains synthetic/unvalidated markers. |
| **Practice Activities** | N/A (previously unscored) | Practice Activities (48 activities by domain, age, tier) | `data/activities_b.csv` | Loaded at startup with question bank. Provided in completion result. |
| **Domain Router** | `backend/app/core/nlp_router.py` (keyword rules) | NLP Domain Router (TF-IDF + LR + rules + negation + safety) | `src/router_b.py`, `artifacts/router_b.joblib` | Loaded as singleton `router_b.py`. Evaluates caregiver free text once during intake. |
| **Adaptive Item Selection** | `backend/app/core/adaptive_tree.py` (`_next_question_b`) | Adaptive Question Engine | `src/engine_b.py` (`Engine._pick_item`, `next_action`) | Dynamic next-question selection driven by router priors, domain uncertainty, depth caps, and cross-signals. |
| **Loop Orchestration** | `backend/app/core/orchestrator.py` (`_get_next_action_b`, `_build_final_result_b`) | Engine Actions & Stop Rule | `src/engine_b.py` (`Engine.next_action`, `Engine.answer`, `Engine._stop`) | Drives state transitions for action types: `question`, `recall_help`, `safety_notice`, and `done`. |
| **Age Routing** | `backend/app/routers/screen.py` line 367 (`corrected_age_months >= 60`) | Age conversion helper | `src/engine_b.py` (`age_band`, `months_to_module_b_age`) | Age routing stays `>= 60 months`. Helper converts to whole-number years `min(12, max(5, months // 12))`. |
| **Start Screening** | `backend/app/routers/screen.py` line 422 (`intake_required`) | Start Session | `src/api_b.py` (`/b/start`) | Returns `type: "intake_required"` for Module B to prompt for free text or chips. |
| **Free-Text Intake Endpoint** | `backend/app/routers/screen.py` lines 650–759 (`/{session_id}/intake`) | Intake & Router Execution | `src/engine_b.py` (`Engine.start`), `src/router_b.py` (`DomainRouter.route`) | Evaluates free text, initializes engine `Session`, blanks raw text after extracting `sense_hint`, stores session in DB/repo. |
| **Answer Endpoint** | `backend/app/routers/screen.py` lines 457–550 (`/{session_id}/answer`) | Answer Processing & Validation | `src/engine_b.py` (`Engine.answer`), `src/api_b.py` (`/b/answer`) | Validates pending `item_id`, validates response value (Likert 1–5 or yes/no/not sure), updates engine state, yields next action. |
| **Recall Help Flow** | `backend/app/routers/screen.py` (chip branch in intake or recall endpoint) | Recall Help Action | `src/engine_b.py` (`Engine.apply_recall_choice`) | Returns `type: "recall_help"` with domain options when text is vague; accepts selected domains and resumes questionnaire. |
| **Safety Notice Flow** | `backend/app/routers/screen.py` | Safety Notice Action | `src/engine_b.py` (`next_action` safety branch) | Returns `type: "safety_notice"` with helplines (Kiran 1800-599-0019, CHILDLINE 1098) before queuing safety questions. |
| **Completion & Scoring** | `backend/app/routers/screen.py` line 144 (`_run_completion_b`) | Engine Results & Triage | `src/engine_b.py` (`Engine.result`) | Generates Typical/Monitor/Refer per domain, rule-outs, summary, activities, and enforces rule-out override to Refer. |
| **ML Inference Service Slot** | `backend/app/ml/inference_service.py` (`inference_service_b`) | Rule-based triage (no ML ensemble yet) | `src/engine_b.py` | Holds dummy/placeholder ML score and SHAP features; does not claim calibrated probabilities. |
| **Safety Floor Constants** | `backend/app/core/safety_floor.py` (`MIN_REAL_ANSWERS_B`, `MIN_DOMAINS_COVERED_B`) | Engine CFG | `src/engine_b.py` (`CFG["min_real_answers"]`, `CFG["min_domains_covered"]`) | Safety floor driven by backend constants: `MIN_REAL_ANSWERS_B = 8`, `MIN_DOMAINS_COVERED_B = 3`, `max_questions = 20`. |
| **Deterministic Override** | `backend/app/core/safety_floor.py` (`get_deterministic_override`) | Rule-out referral | `src/engine_b.py` (`classify_track`, ruleouts) | Positive rule-out (vision/hearing or global/ASD) triggers immediate Refer override and recommendation for specialist/DEIC/RBSK. |
| **Session Model & DB Persistence** | `backend/app/db/models.py` (`ScreeningSession`), `Alembic` migrations | Serialized Engine Session | `src/engine_b.py` (`Session.to_json()`, `Session.from_json()`) | Engine session serialized without raw text into session storage (`state_json` or dedicated column). |
| **Settings / Config** | `backend/app/config.py` (`Settings`) | File paths | Environment settings | Adds `MODULE_B_DATA_DIR` and `MODULE_B_ARTIFACT_DIR` to `Settings` and `.env.example`. |
| **Test Suite** | `backend/tests/` | Regression & API Tests | `tests/test_regressions.py`, `tests/test_api.py` | Ported to pytest format under `backend/tests/` running against the real endpoints. |

## Domain Key Mapping Table

| Nirixon API / DB Domain Key | Package Domain Key | Description |
|---|---|---|
| `attention` | `attention_work` | Attention and work habits (Vanderbilt/INDT-ADHD aligned) |
| `emotion_conduct` | `emotion_school` | Feelings, behaviour, and school adjustment (SDQ subscales) |
| `reading` | `reading` | Reading decoding and fluency (DALI / NIMHANS SLD) |
| `writing` | `writing` | Handwriting, spelling, written expression (NIMHANS SLD) |
| `numbers` | `numbers` | Numeracy and mathematics (NIMHANS SLD / NCERT) |
| `listening_speaking` | `listening_speaking` | Listening comprehension and verbal expression |
| `motor` | `motor` | Movement and motor coordination (DCDQ) |
| `social` | `social` | Social participation and peer relationships |
| `vision_hearing` | `vision_hearing` | Rule-out: sensory triage (vision / hearing) |
| `global_asd` | `global_asd` | Rule-out: broader development / social-communication |

All database records, API request/response payloads, and reports maintain Nirixon domain keys (`attention`, `emotion_conduct`). Package-internal keys remain isolated inside the `app.core.module_b` engine layer.
