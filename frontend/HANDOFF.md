# Stage 5 frontend — handoff notes (v2)

Built against Stage 4 FastAPI (`backend/app/main.py`). Zero mock data in the
active screening flow. Design rationale in the Stage 5 v2 brief (Section 0.5)
is binding — do not "fix" intentional constraints without human review.

## Commands

```bash
cd frontend
cp .env.example .env
npm install
npm run dev          # http://localhost:5173
npm test             # vitest
npm run build        # tsc -b && vite build
npx tsc -b           # typecheck only
```

Backend must be running (`uvicorn app.main:app --reload --port 8000`) with the
seed user from root `.env`.

## Backend wiring added for Stage 5

- `StartScreenRequest.consent_given: bool` — required; rejected if false;
  recorded on `AuditLog.detail` as `consent_given=true`.
- `QuestionPayload.response_type: "yes_no" | "frequency"` — so
  `QuestionnaireForm` stays generic (mandatory items use the same renderer).

## Auth / storage tradeoffs (intentional)

- JWT lives in React memory only — reload signs the parent out (XSS tradeoff).
- Screening session id persists in `sessionStorage` for mid-flow resume only —
  not cross-visit child history.

## Section 5 placeholders (clinical / UX sign-off required)

| Item | Location |
|---|---|
| Override-result messaging | `ResultsView`, `StigmaReassurance` |
| SHAP exposure to parents | `DomainBreakdownChart` + `lib/domainConcern.ts` |
| Follow-up interval (3-month stub) | `CalendarReminderButton` |
| Item-text translation scope | `i18n/index.ts` (safety risk if mistranslated) |
| Next-step resource copy (IDEA Part C) | `EarlyInterventionResource` on Refer paths |

## Parent-facing requirements (v2)

- Every result path shows `ScreeningDisclaimer` (screening ≠ diagnosis).
- Refer + safety-override paths show `EarlyInterventionResource` placeholder.
- Domain chart is display-only; copy must not imply six independent models.
- Privacy copy is conservative — no implied history, auto-share, or profiles.

## Before real families

1. Regenerate `src/api/types.ts` via `scripts/export_openapi_to_zod.sh` from a live backend.
2. Resolve all **five** Section 5 items with a clinical/UX reviewer (including
   disclaimer/resource copy — not "just boilerplate").
3. Re-run the manual consent-skip gate: unauthenticated or unconsented visit to `/screen` must redirect.
4. Re-read parent-facing copy for Section 0.5 privacy overclaims.

## Deferred routes (coming soon)

`/growth`, `/share`, `/sandbox`, plus `/deferred/*` for ClinicianSandbox,
WhatIfSimulator, JointFamilyInvite, VelocityTracker, LiveElicitationTask,
TouchMicroTask.

## Reliability notes (post-v2 polish)

- Domain coverage persists in `sessionStorage` with the session id so reload
  mid-screen does not reset the progress indicator to zero.
- Answer submit uses refs (no stale closure) and shows “Saving your answer…”.
- CI runs `frontend` job: `tsc -b`, `vitest run`, `vite build`.
