"""Schemas for push subscriptions, channel preferences, the outbox and the bot."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PushSubscriptionKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: PushSubscriptionKeys
    role: str | None = None
    worker_id: str | None = None


class PushUnsubscribe(BaseModel):
    endpoint: str


class NotificationChannels(BaseModel):
    push: bool = False
    whatsapp: bool = False
    sms: bool = False
    ivr: bool = False


class NotificationPreferenceUpdate(BaseModel):
    channels: NotificationChannels = Field(default_factory=NotificationChannels)
    phone: str | None = None
    whatsapp_number: str | None = None
    locale: str = "en"
    quiet_start: str | None = None
    quiet_end: str | None = None
    reminder_lead_days: int = 3
    enabled: bool = False
    consent_given: bool = False

    @field_validator("quiet_start", "quiet_end")
    @classmethod
    def _valid_time(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        parts = value.split(":")
        if len(parts) != 2:
            raise ValueError("quiet hours must be HH:MM")
        hour, minute = int(parts[0]), int(parts[1])
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError("quiet hours must be HH:MM")
        return f"{hour:02d}:{minute:02d}"

    @field_validator("reminder_lead_days")
    @classmethod
    def _valid_lead(cls, value: int) -> int:
        if value < 0 or value > 30:
            raise ValueError("reminder_lead_days must be between 0 and 30")
        return value


class NotificationPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    subject_type: str
    subject_id: str
    channels: dict
    phone: str | None = None
    whatsapp_number: str | None = None
    locale: str = "en"
    quiet_start: str | None = None
    quiet_end: str | None = None
    reminder_lead_days: int = 3
    consent_recorded_at: datetime | None = None
    enabled: bool = False
    updated_at: datetime | None = None


class NotificationDeliveryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    channel: str
    template: str
    subject_type: str
    subject_id: str
    child_ref: str | None = None
    status: str
    attempts: int
    scheduled_for: datetime | None = None
    sent_at: datetime | None = None
    error: str | None = None
    created_at: datetime


class VapidKeyResponse(BaseModel):
    public_key: str
    enabled: bool


class TestNotificationRequest(BaseModel):
    channel: str = "push"
    template: str = "activity_tip"


class SweepResponse(BaseModel):
    scheduled: int
    delivered: int
    failed: int
    suppressed: int


class InboundMessageResponse(BaseModel):
    reply: str
    state: str
