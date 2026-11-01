"""Server-side Web Push sender (VAPID)."""

from __future__ import annotations

import asyncio
import json
from typing import Any

from app.config import Settings

from .providers import SendResult


async def send_web_push(
    subscription_info: dict[str, Any],
    payload: dict[str, Any],
    settings: Settings,
) -> SendResult:
    """Send a single encrypted Web Push message.

    ``subscription_info`` must be ``{"endpoint", "keys": {"p256dh", "auth"}}``.
    Returns a failed result (never raises) so the outbox can log and retry.
    """
    if not settings.vapid_private_key or not settings.vapid_public_key:
        return SendResult(ok=False, error="VAPID keys are not configured")

    try:
        from pywebpush import WebPushException, webpush  # optional dependency
    except Exception as exc:  # noqa: BLE001
        return SendResult(ok=False, error=f"pywebpush unavailable: {exc}")

    try:
        # .env files cannot hold real newlines comfortably; accept the escaped
        # form printed by scripts/generate_vapid_keys.py.
        private_key = settings.vapid_private_key.replace("\\n", "\n")
        await asyncio.to_thread(
            webpush,
            subscription_info=subscription_info,
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_key,
            vapid_claims={"sub": settings.vapid_subject},
        )
        return SendResult(ok=True, provider_id="webpush")
    except WebPushException as exc:  # pragma: no cover - provider-specific
        return SendResult(ok=False, error=str(exc))
    except Exception as exc:  # noqa: BLE001
        return SendResult(ok=False, error=str(exc))
