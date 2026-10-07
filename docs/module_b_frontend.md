# Module B Frontend Plan

## Discovery Summary

- **Framework**: React 19 + React Router 7 + Vite 6, vanilla CSS tokens
- **Existing Module B scaffolding**: `FreeTextIntake`, `ModuleBResultCard`, `useAdaptiveQuestionnaire` (handles `intake_required` action)
- **Gaps vs spec**: No `recall_help` / `safety_notice` action handling, no Likert-5 scale-string parsing, no recall screen, no safety screen with helpline links, no enriched result view (activities, help, summary from API), no `POST /recall` API call
- **Zod export**: Stub script — types are hand-written in `api/types.ts`
- **OpenAPI fetch**: Backend at :8000 not reachable from `read_url_content`; user has Swagger UI open — proceeding with spec from the task description + existing types

## Plan

### 1. Update `api/types.ts`
Add Module B action types (`recall_help`, `safety_notice`, `done`), `RecallRequest`, Likert-5 `response_type`, `scale` field on `QuestionPayload`, enriched `ModuleBResultPayload` (domains with status/score/answers, flagged_domains, rule_out flags, summary, activities, help, safety, disclaimer).

### 2. Update `api/client.ts`
Add `submitRecall(sessionId, body)` calling `POST /api/screen/{id}/recall`.

### 3. Update `ScreenActionResponse`
Widen `type` union to include `recall_help | safety_notice | done`. Add `recall_help_options`, `safety_message`, `progress` fields.

### 4. Update `useAdaptiveQuestionnaire` hook
Handle new action types in `applyAction`: `recall_help` → new phase, `safety_notice` → new phase, `done` → complete. Track `progress`, `safetyMessage`, `recallOptions`, `showSafetyLink`.

### 5. New components
- `ModuleBQuestionForm`: Parses `scale` string for likert5, renders 5 labelled buttons; `yesno` renders Yes/No/Not sure. Focus management, aria-live.
- `RecallHelpScreen`: Shows returned domain chips (multi-select) with friendly labels, calls `POST /recall`.
- `SafetyNoticeScreen`: Prominent helpline display (Kiran, CHILDLINE with tel: links), continue button.
- `ModuleBResultView`: Full result view per spec (reassurance, domain profile with icons, summary, activities, help, disclaimer, safety-first helplines).

### 6. Update `ScreeningPage.tsx`
Add phases: `recall_help`, `safety_notice`. Wire new components. Show persistent "Talk to someone now" link after safety dismissal.

### 7. CSS additions
Styles for safety notice, recall help, Likert-5 buttons, result sections, activity cards.

### 8. i18n strings
All UI strings via `t()`.

### 9. Tests (4 flows)
Mocked API for: attention note → questions → Refer result; vague note → recall → questions; safety notice → helplines → result with safety; bad input / expired session. Storage leak check.

### 10. Gates
`npm run typecheck`, `npm run test`, `npm run build` (all pass).

## Live Backend Verification & Contract Notes

1. **Live Backend Integration**: Verified directly against running FastAPI backend (`http://127.0.0.1:8000`). All 4 core flows tested:
   - *Hinglish Attention Note*: Parses `"mera beta class mein focus nahi karta aur teacher bolti hai distract hota hai"`, routes to `attention`, serves Likert-5 question with scale labels `1=Never|2=Rarely|3=Sometimes|4=Often|5=Very often`, completes through 20 questions to enriched `Refer` result.
   - *Recall Help*: Ambiguous note (`"not sure what is wrong"`) triggers `recall_help` action with 8 domain options and caregiver-friendly message. Submitting selected chips to `POST /api/screen/{session_id}/recall` successfully resumes adaptive questions.
   - *Safety Notice*: Sensitive self-harm trigger returns `safety_notice` with Kiran (1800-599-0019) and CHILDLINE (1098) helplines.
   - *Fast Path & Input Validation*: Empty intake text without chips returns 422 with clear validation message; chip-only submission routes directly to targeted domain questions.

2. **Backend Contract Findings**:
   - `GET /api/screen/{session_id}/result` returns only base Module A fields (omits `activities`, `summary`, `domain_classifications`, `disclaimer`). However, the answer completion action (`POST /api/screen/{session_id}/answer` returning `type="complete"`) and session resume (`GET /api/screen/{session_id}`) return the full, enriched Module B `ResultPayload`. The frontend gracefully utilizes the action payload.
   - Localhost Dual-Stack: On Windows, Node.js resolves `localhost` to IPv6 `::1`. Uvicorn must be bound to dual-stack or client tools should target `127.0.0.1` to avoid `ECONNREFUSED`.

3. **Storage & Privacy**:
   - Caregiver free text notes, child answers, and clinical observations never touch `sessionStorage` or `localStorage`.
   - Only the opaque session UUID (`nirixon_screen_session_id`), covered domain tag set, and timestamps are held in `sessionStorage` for refresh resilience (pre-existing Module A pattern).

