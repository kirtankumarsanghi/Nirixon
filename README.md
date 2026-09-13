# Nirixon

Developmental screening: adaptive questionnaire + calibrated ML risk
classification (Typical / Monitor / Refer), with an explicit clinical safety
floor that can override the model.

## Stage 5 — Parent-facing frontend

React + TypeScript (Vite) app in `frontend/`, wired to the Stage 4 API —
**no mock data** in the active screening flow.

```bash
# Terminal 1 — backend
cd backend && uvicorn app.main:app --reload --port 8000 --workers 1

# Terminal 2 — frontend
cd frontend
cp .env.example .env
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

See `frontend/HANDOFF.md` for auth/storage tradeoffs, Section 5 clinical
placeholders, and deferred routes.

---

## Stage 4 — Real FastAPI service

`backend/app/main.py` is the active app. `backend/app/stub_api.py` remains for
offline Stage 3 / frontend stub work but is **not** imported by `main.py`.

### Quick start (local)

```bash
# From repo root
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate

pip install -r backend/requirements-ml.txt -r backend/requirements.txt

# Artifacts (if missing): cd backend/ml && python train.py
cp .env.example .env

cd backend
uvicorn app.main:app --reload --port 8000 --workers 1
```

Login with the seed user (`SEED_USER_EMAIL` / `SEED_USER_PASSWORD` in `.env`),
then call `/api/screen/start` with the Bearer token.

### Docker

```bash
cd docker
docker compose up --build
```

Compose runs **one** API worker and applies Alembic migrations on startup.

### Session storage constraint (read this)

`SESSION_REPO_BACKEND=memory` uses `InMemorySessionRepo`.

**This is a single-process, single-worker constraint.** Do not raise
`--workers` above 1 and do not scale API replicas until `RedisSessionRepo`
exists. Multi-worker deployments will lose or split session state across
processes — a deploy blocker, not a tuning tip.

The repository interface (`SessionRepository`) is ready for a Redis
implementation; swapping should be a config change, not a rewrite of
routers.

### ML artifacts

Four files under `backend/ml/artifacts/` (from `backend/ml/train.py`):

| File | Role |
|---|---|
| `model.pkl` | Calibrated model (pipeline includes preprocessing) |
| `preprocessor.pkl` | Required before SHAP (do not double-apply before `model.predict`) |
| `feature_columns.pkl` | Ordered feature names — validated on every prediction |
| `shap_explainer.pkl` | Local attributions |

If any artifact fails to load at startup, `/health` reports failure and
`/api/screen/*` + `/api/predict` return **503** with
`model not trained — run train.py`. There is **no mock prediction fallback**.

### Key endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/login` | none |
| POST | `/api/screen/start` | parent JWT |
| POST | `/api/screen/{id}/answer` | parent JWT |
| GET | `/api/screen/{id}/result` | parent JWT |
| GET | `/api/screen/{id}` | parent JWT |
| POST | `/api/predict` | parent JWT |
| * | `/api/sandbox/*` | 501 stub |
| * | `/api/share/*` | 501 stub |
| GET | `/health` | none (DB + artifacts + Redis status) |

OpenAPI: `http://localhost:8000/docs` — export for the frontend via
`scripts/export_openapi_to_zod.sh`.

### Migrations

```bash
cd backend
alembic upgrade head
```

### Tests

```bash
cd backend
python -m pytest tests/test_adaptive_logic.py tests/test_api.py -v -k "not HTTP and not Sensitivity"
```

> **Important**: always pass `-k "not HTTP and not Sensitivity"` — bare `pytest`
> without this filter will attempt HTTP calls to the Stage 3 stub API on port 8001
> and either hang or produce false failures if that server isn't running.

Stub HTTP tests still target `app.stub_api` on port 8001 when needed.

---

### Deferred (not yet implemented)

These files are **intentionally empty** — they are placeholders for future
stages. They are **not** abandoned mid-work.

| File | Belongs to | Target stage |
|---|---|---|
| `backend/app/db/share_models.py` | Share / triangulation data model | Stage 5 |
| `backend/app/schemas/share.py` | Share / triangulation API schemas | Stage 5 |
| `backend/app/explain/llm_explainer.py` | LLM-generated explanation summaries | Stage 4b |

`RedisSessionRepo` (session persistence for multi-worker deployments) is also
deferred; its interface exists in `backend/app/db/session_repo.py` and swapping
to it is a config change, not a rewrite.

---

### Domain-coverage semantics (pending clinical sign-off)

`regression_flag` and `family_history_flag` are tagged `background`, not a
milestone domain. Answering only these two mandatory items does **not** satisfy
`MIN_DOMAINS_COVERED` — a session cannot stop early without touching at least
one developmental-milestone domain. This is the current implementation's
deliberate default (safer). **Requires explicit clinical sign-off** before
changing.
