"""Transport adapters for notification delivery.

The default ``outbox`` provider performs no network I/O, which keeps local
development and tests fully deterministic. The ``twilio`` provider is used only
when explicitly configured; imports are lazy so the API boots without the SDK.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Protocol

from app.config import Settings


@dataclass(slots=True)
class SendResult:
    ok: bool
    provider_id: str | None = None
    error: str | None = None


class NotificationProvider(Protocol):
    async def send_whatsapp(self, to: str, body: str) -> SendResult: ...

    async def send_sms(self, to: str, body: str) -> SendResult: ...

    async def send_voice(self, to: str, url: str) -> SendResult: ...


class OutboxProvider:
    """No-op transport: deliveries remain in the outbox with a sent status."""

    async def send_whatsapp(self, to: str, body: str) -> SendResult:
        return SendResult(ok=True, provider_id="outbox:whatsapp")

    async def send_sms(self, to: str, body: str) -> SendResult:
        return SendResult(ok=True, provider_id="outbox:sms")

    async def send_voice(self, to: str, url: str) -> SendResult:
        return SendResult(ok=True, provider_id="outbox:ivr")


class TwilioProvider:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = None

    def _get_client(self):
        if self._client is None:
            from twilio.rest import Client  # local import: optional dependency

            self._client = Client(
                self._settings.twilio_account_sid,
                self._settings.twilio_auth_token,
            )
        return self._client

    def _whatsapp_from(self) -> str:
        value = self._settings.twilio_whatsapp_from
        return value if value.startswith("whatsapp:") else f"whatsapp:{value}"

    @staticmethod
    def _whatsapp_to(to: str) -> str:
        return to if to.startswith("whatsapp:") else f"whatsapp:{to}"

    async def send_whatsapp(self, to: str, body: str) -> SendResult:
        try:
            message = await asyncio.to_thread(
                self._get_client().messages.create,
                from_=self._whatsapp_from(),
                to=self._whatsapp_to(to),
                body=body,
            )
            return SendResult(ok=True, provider_id=message.sid)
        except Exception as exc:  # noqa: BLE001 - provider errors are delivery data
            return SendResult(ok=False, error=str(exc))

    async def send_sms(self, to: str, body: str) -> SendResult:
        try:
            message = await asyncio.to_thread(
                self._get_client().messages.create,
                from_=self._settings.twilio_sms_from,
                to=to,
                body=body,
            )
            return SendResult(ok=True, provider_id=message.sid)
        except Exception as exc:  # noqa: BLE001
            return SendResult(ok=False, error=str(exc))

    async def send_voice(self, to: str, url: str) -> SendResult:
        try:
            call = await asyncio.to_thread(
                self._get_client().calls.create,
                from_=self._settings.twilio_voice_from,
                to=to,
                url=url,
            )
            return SendResult(ok=True, provider_id=call.sid)
        except Exception as exc:  # noqa: BLE001
            return SendResult(ok=False, error=str(exc))


def get_notification_provider(settings: Settings) -> NotificationProvider:
    if (
        settings.notification_provider == "twilio"
        and settings.twilio_account_sid
        and settings.twilio_auth_token
    ):
        return TwilioProvider(settings)
    return OutboxProvider()
