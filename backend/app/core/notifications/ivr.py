"""Signed IVR scripts and TwiML builders.

Tokens are short-lived HMAC values so an outbound call URL cannot be replayed
indefinitely or enumerate subject ids. Scripts never contain PII.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any
from xml.sax.saxutils import escape


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def sign_token(
    payload: dict[str, Any], *, secret: str, ttl_seconds: int = 86400
) -> str:
    body = {**payload, "exp": int(time.time()) + ttl_seconds}
    raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    signature = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).digest()
    return f"{_b64encode(raw)}.{_b64encode(signature)}"


def verify_token(token: str, *, secret: str) -> dict[str, Any] | None:
    try:
        raw_b64, sig_b64 = token.split(".", 1)
        raw = _b64decode(raw_b64)
        signature = _b64decode(sig_b64)
    except (ValueError, TypeError):
        return None
    expected = hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if int(payload.get("exp", 0)) < int(time.time()):
        return None
    return payload


_HELPLINES = (
    "Tele-MANAS 1 4 4 1 6. Kiran Mental Health Helpline 1 8 0 0 5 9 9 0 0 1 9. "
    "CHILDLINE 1 0 9 8. Emergency 1 1 2."
)

_LANG_DIGITS = {
    "1": ("hi-IN", "हिन्दी"),
    "2": ("en-IN", "English"),
    "3": ("mr-IN", "मराठी"),
    "4": ("ta-IN", "தமிழ்"),
    "5": ("te-IN", "తెలుగు"),
    "6": ("bn-IN", "বাংলা"),
    "7": ("gu-IN", "ગુજરાતી"),
    "8": ("kn-IN", "ಕನ್ನಡ"),
}


def _twiml(inner: str) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?><Response>{inner}</Response>'


def inbound_twiml(*, action_url: str = "/api/voice/twiml/menu") -> str:
    menu = (
        "Welcome to Nirixon. For Hindi press 1. For English press 2. "
        "For Marathi press 3. For Tamil press 4. For Telugu press 5. "
        "For Bengali press 6. For Gujarati press 7. For Kannada press 8. "
        "For support helplines press 9."
    )
    inner = (
        f'<Gather input="dtmf" numDigits="1" timeout="8" action="{escape(action_url)}" method="POST">'
        f'<Say language="en-IN">{escape(menu)}</Say>'
        "</Gather>"
        '<Say language="en-IN">We did not receive a selection. Please call again.</Say>'
    )
    return _twiml(inner)


def menu_twiml(digit: str) -> str:
    if digit in _LANG_DIGITS:
        voice, label = _LANG_DIGITS[digit]
        text = (
            f"{label} selected. A health worker can help with screening, referrals "
            "and home activities. For support helplines press 9."
        )
        inner = (
            f'<Gather input="dtmf" numDigits="1" timeout="8" action="/api/voice/twiml/menu" method="POST">'
            f'<Say language="{voice}">{escape(text)}</Say>'
            "</Gather>"
            f'<Say language="en-IN">{escape(_HELPLINES)}</Say>'
        )
        return _twiml(inner)
    if digit == "9":
        return _twiml(f'<Say language="en-IN">{escape(_HELPLINES)}</Say><Hangup/>')
    if digit == "0":
        return inbound_twiml()
    return _twiml(
        f'<Say language="en-IN">Sorry, that option is not available. {escape(_HELPLINES)}</Say>'
        "<Hangup/>"
    )


def outbound_twiml(script: str, *, token: str) -> str:
    action = f"/api/voice/twiml/outbound/{token}"
    inner = (
        f'<Gather input="dtmf" numDigits="1" timeout="8" action="{escape(action)}" method="POST">'
        f'<Say language="en-IN">{escape(script)}</Say>'
        "</Gather>"
        f'<Say language="en-IN">{escape(_HELPLINES)}</Say>'
    )
    return _twiml(inner)


def outbound_ack_twiml(digit: str, *, script: str, token: str) -> str:
    if digit == "1":
        return _twiml(
            '<Say language="en-IN">Thank you. The reminder is acknowledged.</Say><Hangup/>'
        )
    if digit == "2":
        return outbound_twiml(script, token=token)
    if digit == "0":
        return _twiml(f'<Say language="en-IN">{escape(_HELPLINES)}</Say><Hangup/>')
    return outbound_twiml(script, token=token)


def helplines_text() -> str:
    return _HELPLINES
