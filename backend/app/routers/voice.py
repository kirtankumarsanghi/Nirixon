"""IVR / voice helpline endpoints (Twilio TwiML)."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response

from app.config import get_settings
from app.core.notifications.ivr import (
    inbound_twiml,
    menu_twiml,
    outbound_ack_twiml,
    outbound_twiml,
    verify_token,
)

router = APIRouter(prefix="/api/voice", tags=["voice"])

_XML = "application/xml"


def _xml(body: str) -> Response:
    return Response(content=body, media_type=_XML)


@router.get("/twiml/inbound")
async def inbound() -> Response:
    return _xml(inbound_twiml())


@router.post("/twiml/menu")
async def menu(request: Request) -> Response:
    form = await request.form()
    return _xml(menu_twiml(str(form.get("Digits") or "")))


@router.api_route("/twiml/outbound/{token}", methods=["GET", "POST"])
async def outbound(token: str, request: Request) -> Response:
    payload = verify_token(token, secret=get_settings().jwt_secret)
    if payload is None:
        return _xml(
            '<?xml version="1.0" encoding="UTF-8"?><Response>'
            '<Say language="en-IN">This reminder link has expired.</Say><Hangup/></Response>'
        )
    script = str(payload.get("script") or "A follow-up is due.")
    if request.method == "POST":
        form = await request.form()
        digit = str(form.get("Digits") or "")
        return _xml(outbound_ack_twiml(digit, script=script, token=token))
    return _xml(outbound_twiml(script, token=token))
