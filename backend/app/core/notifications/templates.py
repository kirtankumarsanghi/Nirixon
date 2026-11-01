"""Message templates for reminders, referral nudges, activity tips and IVR.

Privacy: every template uses a pseudonymous child reference. Names, phone
numbers and addresses are never interpolated here.
"""

from __future__ import annotations

from typing import Any

# Small, deliberately conservative message set. Only English and Hindi are
# reviewed; the other workspace languages fall back to English for messaging
# until their copy is clinically reviewed.
_STRINGS: dict[str, dict[str, str]] = {
    "en": {
        "rescreen_title": "Re-screen reminder",
        "rescreen": "A developmental re-screen is due for child {child_ref}. Open Nirixon to continue.",
        "referral_title": "Referral status",
        "referral": "Referral update for child {child_ref}: {status}. Please confirm the next step.",
        "tip_title": "Home activity",
        "tip": "Home activity for child {child_ref}: {activity}. Try about 10 minutes together.",
        "helpline": "If anyone is in immediate danger, call 112. Tele-MANAS 14416 and CHILDLINE 1098 are free.",
        "optout": "Reply 9 to stop.",
        "ivr": "Nirixon reminder for child {child_ref}. {detail}. Press 1 to acknowledge, 2 to repeat, or 0 for helplines.",
    },
    "hi": {
        "rescreen_title": "पुनः जाँच अनुस्मारक",
        "rescreen": "बच्चे {child_ref} की विकासात्मक पुनः जाँच का समय आ गया है। जारी रखने के लिए Nirixon खोलें।",
        "referral_title": "रेफरल स्थिति",
        "referral": "बच्चे {child_ref} के रेफरल की स्थिति: {status}। कृपया अगला कदम जाँचें।",
        "tip_title": "घर पर गतिविधि",
        "tip": "बच्चे {child_ref} के लिए घर पर गतिविधि: {activity}। साथ में लगभग 10 मिनट करें।",
        "helpline": "यदि कोई तत्काल खतरे में है तो 112 पर कॉल करें। टेली-मानस 14416 और चाइल्डलाइन 1098 नि:शुल्क हैं।",
        "optout": "बंद करने के लिए 9 भेजें।",
        "ivr": "बच्चे {child_ref} के लिए Nirixon अनुस्मारक। {detail}। स्वीकार करने के लिए 1, दोहराने के लिए 2, सहायता के लिए 0 दबाएँ।",
    },
}

DEFAULT_ACTIVITY = "10 minutes of shared play, talk or reading"


def _strings(locale: str) -> dict[str, str]:
    return _STRINGS.get(locale, _STRINGS["en"])


def build(
    template: str,
    *,
    locale: str = "en",
    child_ref: str | None = None,
    status: str | None = None,
    activity: str | None = None,
    detail: str | None = None,
    app_url: str = "",
) -> dict[str, Any]:
    s = _strings(locale)
    ref = child_ref or "the child"
    activity = activity or DEFAULT_ACTIVITY
    url = f"{app_url.rstrip('/')}/#/chw/caseload" if app_url else "/#/chw/caseload"

    if template == "rescreen_reminder":
        title = s["rescreen_title"]
        body = s["rescreen"].format(child_ref=ref)
        ivr = s["ivr"].format(child_ref=ref, detail="A re-screen is due")
    elif template == "referral_nudge":
        title = s["referral_title"]
        body = s["referral"].format(child_ref=ref, status=status or "in progress")
        ivr = s["ivr"].format(
            child_ref=ref, detail=f"Referral status {status or 'in progress'}"
        )
    elif template == "activity_tip":
        title = s["tip_title"]
        body = s["tip"].format(child_ref=ref, activity=activity)
        ivr = s["ivr"].format(child_ref=ref, detail=f"Home activity: {activity}")
    elif template == "safety_helpline":
        title = "Support helplines"
        body = s["helpline"]
        ivr = s["helpline"]
    else:
        title = "Nirixon"
        body = detail or "A follow-up is due."
        ivr = detail or "A follow-up is due."

    return {
        "template": template,
        "title": title,
        "body": body,
        "url": url,
        "push": {"title": title, "body": body, "url": url, "tag": template},
        "whatsapp": f"{body}\n\n{s['optout']}",
        "sms": f"{body} {s['optout']}",
        "ivr": ivr,
    }
