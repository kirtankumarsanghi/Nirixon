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

## Mobile app (Capacitor / Android)

The native app is the same React bundle, packaged by Capacitor. If the app looks
out of date, the packaged assets are stale — rebuild and sync:

```bash
cd frontend
npm run build:mobile                       # tsc + vite build + cap sync android
cd android
gradlew.bat assembleDebug                  # APK: app/build/outputs/apk/debug/app-debug.apk
```

**Backend reachability (important).** A phone cannot reach `127.0.0.1`; that is
the phone itself. Start the API on all interfaces and use the laptop's LAN IP:

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Then on the phone, the first-run dialog (or **Change** on the sign-in screen)
asks for `http://<laptop-LAN-IP>:8000` — e.g. `http://10.176.198.194:8000`.
Set `VITE_MOBILE_API_BASE_URL` at build time to bake in a default instead:

```bash
VITE_MOBILE_API_BASE_URL=http://10.176.198.194:8000 npm run build:mobile
```

Native-specific wiring now included:

- cleartext HTTP allowed for the LAN API (`network_security_config.xml`),
- location permission for Find Help's "use my location",
- Android print service for referral slips / plans (WebView has no `window.print`),
- Android share sheet for `.ics` / PDF / text downloads (WebView ignores `<a download>`),
- external-app handoff for WhatsApp, SMS and phone links,
- safe-area offsets for the notched/gesture-bar Android WebView,
- hardware back closes the menu/dialogs before navigating.

## Releasing an installable APK

The release build is signed with `android/keystore/nirixon-release.jks` through
`android/key.properties` (both gitignored — back them up; the same key is needed
for every future update of an installed app).

```bash
cd frontend
# Bake in the public API so no one has to configure anything:
#   PowerShell: $env:VITE_MOBILE_API_BASE_URL="https://api.example.org"
#   bash:       VITE_MOBILE_API_BASE_URL=https://api.example.org npm run build:mobile
npm run build:mobile

cd android
gradlew.bat assembleRelease      # APK: app/build/outputs/apk/release/app-release.apk
gradlew.bat bundleRelease        # AAB: app/build/outputs/bundle/release/app-release.aab
```

Bump `versionCode`/`versionName` in `android/app/build.gradle` for each release.
Share the APK directly (users allow "install unknown apps"), via Firebase App
Distribution, or upload the AAB to Google Play.

**No public API means no on-any-network access.** A phone cannot reach the
laptop's `127.0.0.1` or LAN IP from another network. Either host the backend
publicly (Render/Railway/VPS/Cloud Run) and bake that URL in as above, or port
the model on-device for a fully offline build.



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
