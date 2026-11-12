# Deploying Nirixon so anyone can use the app

The mobile APK is just a UI shell: it needs a reachable API. For “install on any
phone, any network, no setup”, deploy the backend publicly over HTTPS and bake
its URL into the APK.

## Option A — Render (fastest, free tier)

The repo includes [`render.yaml`](../render.yaml): one Docker web service plus a
managed Postgres database.

1. Push this repository to GitHub.
2. Render Dashboard → **New → Blueprint** → select the repo.
3. Render creates `nirixon-api` and `nirixon-db`; when prompted, set
   **`SEED_USER_PASSWORD`** to a real password.
4. Wait for the first deploy. Open `https://<your-service>.onrender.com/health`
   — it should return `{"status":"ok", ...}`.
5. Copy the service URL. That is your mobile API base.

Notes:

- Free web services sleep after inactivity; the first request after a nap takes
  ~30–60 s. The app’s login screen will show “unreachable” until it wakes.
- If Render’s free Postgres plan is unavailable for your account, create a free
  **Neon** or **Supabase** database and paste its URL into the service’s
  `DATABASE_URL` environment variable instead. The backend accepts the standard
  `postgresql://…?sslmode=require` form and converts it for asyncpg.
- Migrations run automatically (`alembic upgrade head` in the start command).
- Generated narration is cached on the container disk; on a restart it is
  regenerated on first play. Mount a persistent disk only if you need the cache
  to survive.

## Option B — Railway / Fly.io / any VPS

Use the same Dockerfile (`docker/Dockerfile.backend`) and environment variables
from `render.yaml`, plus a managed Postgres. On a VPS:

```bash
# after cloning and configuring .env
docker compose -f docker/docker-compose.yml up -d --build
```

Put Caddy or Nginx in front of port `8000` with a TLS certificate, and set
`CORS_ORIGINS` to the public origins. Keep `SESSION_REPO_BACKEND=redis` if you
run more than one API worker/replica.

## Point the mobile app at it

```powershell
cd frontend
$env:VITE_MOBILE_API_BASE_URL="https://your-service.onrender.com"
npm run build:mobile
cd android
.\gradlew.bat assembleRelease
```

Result: `android/app/build/outputs/apk/release/app-release.apk`. The URL is
compiled in, so every install works with no server dialog. Distribute that APK
(Drive / Firebase App Distribution / Play Store).

Alternatively, skip the rebuild and enter the URL once in the app’s
**Server address** dialog — it persists on the device.

## Environment reference

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres URL (`postgres://…` is normalized automatically). |
| `JWT_SECRET` | Signing key — generate a random value, never reuse dev default. |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | Parent demo account. |
| `ML_ARTIFACTS_DIR` | `/app/backend/ml/artifacts` in the Docker image. |
| `MODULE_B_DATA_DIR` | `/app/backend/data/module_b`. |
| `MODULE_B_ARTIFACT_DIR` | `/app/backend/ml/artifacts/module_b_router`. |
| `NIRIXON_REFERENCE_DB` | `/app/backend/data/find_help/reference.sqlite`. |
| `SESSION_REPO_BACKEND` | `memory` for one process, `redis` for multi-worker. |
| `CORS_ORIGINS` | Web client origins; native `https://localhost` / `capacitor://localhost` are added in code. |
| `PUBLIC_APP_URL` | Public link used in reminder messages. |
| `NOTIFICATION_PROVIDER` | `outbox` (log only) or `twilio` for real WhatsApp/SMS/IVR. |

## Before exposing it publicly

- **Demo credentials:** `clinician@example.com`, `chw@example.com`,
  `supervisor@example.com` and `chw_ward15@example.com` are seeded with
  `changeme` (the app’s one-tap role switcher relies on it). A public instance
  is therefore a public demo. If that is not acceptable, restrict access (VPN /
  auth proxy), or update the seeding + the app’s demo sign-in together.
- Set a strong `JWT_SECRET` and `SEED_USER_PASSWORD`.
- Use Postgres, not the SQLite dev default.
- `ENVIRONMENT=production`, keep `RATE_LIMIT_ENABLED=true`.
- No real patient data until the pilot protocol/ethics review is complete.

## Troubleshooting

- **Build succeeds, `/health` fails:** check the deploy logs for Alembic errors;
  usually a wrong `DATABASE_URL` or a DB not accepting external SSL.
- **App says unreachable but `/health` opens in a browser:** re-enter the URL
  with `https://`, tap **Test connection**, then **Save & reload**.
- **First request is slow:** free-tier cold start; warm it with `/health`.
- **Audio missing:** the server needs outbound internet for `edge-tts`; check
  deploy logs for the first synthesis attempt.
