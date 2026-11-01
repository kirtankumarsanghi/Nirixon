# Notifications, Push and IVR

## What ships

| Channel | Implementation | Default |
|---|---|---|
| Web Push | `app/core/notifications/webpush.py` + VAPID subscriptions | Off until keys are configured |
| WhatsApp | Provider adapter (`outbox` or Twilio) | `outbox` (logged, not sent) |
| SMS | Provider adapter (`outbox` or Twilio) | `outbox` |
| IVR | TwiML menu + signed outbound scripts + Twilio voice | `outbox` |

## Local setup

```bash
# 1. Generate a VAPID keypair
python backend/scripts/generate_vapid_keys.py
# Copy the two lines into .env

# 2. Run the API and frontend
cd backend && uvicorn app.main:app --reload
cd frontend && npm run dev
```

Open the workspace menu → **Notification settings**:

1. Enable push (asks for browser permission and registers the service worker).
2. Add a phone number for WhatsApp/SMS/IVR.
3. Tick consent and turn reminders on.
4. Use **Send test** to inspect the outbox.

## Live Twilio delivery

```ini
NOTIFICATION_PROVIDER=twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_SMS_FROM=+14155238886
TWILIO_VOICE_FROM=+14155238886
PUBLIC_APP_URL=https://your-public-host
NOTIFICATION_SWEEP_SECONDS=300
```

Point the Twilio WhatsApp/SMS webhook at `POST /api/notifications/whatsapp/webhook`
and the voice webhook at `GET/POST /api/voice/twiml/inbound`. Signature validation
is enabled whenever `TWILIO_AUTH_TOKEN` is set.

## Worker

Matching and delivery are separate from the API so a 4-worker API cannot send
duplicates:

```bash
cd backend && python -m app.workers.notification_worker          # loop
cd backend && python -m app.workers.notification_worker --once   # one sweep
```

Docker Compose includes a single-replica `notifier` service. The worker:

- schedules re-screen reminders from `child_records.follow_up_due_at`;
- nudges stalled `created`/`sent` referrals;
- sends queued home-activity tips and safety helpline messages;
- respects consent, quiet hours, per-child daily caps and idempotency keys.

## Privacy and safety

- No child names, phone numbers or addresses in message payloads (pseudonymous refs only).
- Phone numbers are optional, consent-gated and hashed for inbound bot lookup.
- IVR tokens are short-lived HMAC values; scripts contain no PII.
- Any self-harm/abuse signal shows helplines immediately and never a routine tip.
- `STOP`/`9` disables reminders; `START` re-enables them.

## Bot menu

`1` re-screen status · `2` referral status · `3` home-activity tip · `4` helplines · `9` stop.
