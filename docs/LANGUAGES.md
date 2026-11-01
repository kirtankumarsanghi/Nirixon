# Languages and Translation Review

## Supported workspace languages

`en` English · `hi` Hindi · `mr` Marathi · `ta` Tamil · `te` Telugu ·
`bn` Bengali · `gu` Gujarati · `kn` Kannada.

The picker lives in the floating workspace dock and in the check-in header.
The choice is persisted in `localStorage["nirixon-lang"]` and mirrored to
`<html lang>`.

## What is translated

- Workspace chrome and the check-in flow (questions, answers, regression prompt).
- Module A question text via per-language maps:
  - `backend/data/module_a/question_bank_a_<code>.json`
  - `frontend/public/module-a-<code>.json`
- Module B question text via per-language maps:
  - `backend/data/module_b/question_bank_b_<code>.json`
  - `frontend/public/module-b-<code>.json`
- Audio uses reviewed server clips (English/Hindi Module A and the reviewed
  Module B set), then server-generated edge-tts clips in the selected language,
  then the browser's speech synthesis, then English with an `EN` badge.

## Generating a bank

```bash
cd backend
python scripts/translate_module_a.py
python scripts/translate_module_b.py --langs mr,ta,te,bn,gu,kn
python scripts/translate_module_b.py --check
```

Module A uses `Helsinki-NLP/opus-mt-en-mul`, which covers all six additional
languages in one model. Module B uses the same multilingual model with batched
inference. Both scripts are resumable, write backend and frontend copies, and
skip existing item ids. Machine output is marked pending clinical review.

## Clinical review

Machine output is **not** treated as reviewed. The registry lives at
`backend/data/module_b/translation_review.json`:

```json
{ "hi": { "status": "pending", "reviewer": null, "reviewed_date": null } }
```

Record a human sign-off with:

```bash
python scripts/mark_translation_review.py --lang hi --reviewer "Dr. A. Sharma"
```

The app only records the review; it does not validate translation quality. Keep
unreviewed banks labelled in the UI and in the audio coverage report.
