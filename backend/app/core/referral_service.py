"""
Core business logic, status transitions, and summary generators for CHW Referral System.

Safety & Privacy Invariants:
1. Area Isolation: A worker cannot view or refer children outside their assigned village/ward.
2. Status Transition Graph:
   created -> sent -> seen -> outcome recorded -> closed (with direct close allowed from intermediate states).
3. Minimum Data Referral Summary:
   Printable PDF and shareable text contain strictly the 4 clinical triage fields:
   age_bracket, tier, domains_of_concern, safety_rule_trigger.
4. Opt-in with consent & erasure right:
   Records require explicit opt-in consent and can be permanently erased upon request.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException, status

if TYPE_CHECKING:
    from app.db.models import ChildRecord, Referral, Worker

logger = logging.getLogger(__name__)

# Canonical Status Constants
STATUS_CREATED = "created"
STATUS_SENT = "sent"
STATUS_SEEN = "seen"
STATUS_OUTCOME_RECORDED = "outcome recorded"
STATUS_CLOSED = "closed"

VALID_STATUSES = {
    STATUS_CREATED,
    STATUS_SENT,
    STATUS_SEEN,
    STATUS_OUTCOME_RECORDED,
    STATUS_CLOSED,
}

# Permitted Forward Transitions
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    STATUS_CREATED: {STATUS_SENT, STATUS_CLOSED},
    STATUS_SENT: {STATUS_SEEN, STATUS_CLOSED},
    STATUS_SEEN: {STATUS_OUTCOME_RECORDED, STATUS_CLOSED},
    STATUS_OUTCOME_RECORDED: {STATUS_CLOSED},
    STATUS_CLOSED: set(),
}


def normalize_status(raw_status: str) -> str:
    """Normalize status string (e.g. handle 'outcome_recorded' -> 'outcome recorded')."""
    s = raw_status.strip().lower()
    if s == "outcome_recorded":
        return STATUS_OUTCOME_RECORDED
    return s


def validate_status_transition(current_status: str, target_status: str) -> str:
    """
    Validate that transitioning from current_status to target_status is permitted.
    Raises HTTPException(400) on invalid transitions.
    """
    curr = normalize_status(current_status)
    tgt = normalize_status(target_status)

    if tgt not in VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown referral status '{tgt}'. Valid statuses: {sorted(VALID_STATUSES)}",
        )

    # Idempotent status update (no transition)
    if tgt == curr:
        return tgt

    allowed = ALLOWED_TRANSITIONS.get(curr, set())
    if tgt not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid status transition from '{curr}' to '{tgt}'. "
                f"Allowed transitions from '{curr}': {sorted(allowed) if allowed else 'none (terminal state)'}"
            ),
        )

    return tgt


def check_worker_area_access(worker: Worker, child: ChildRecord) -> None:
    """
    Enforce geographic area isolation.
    A community health worker sees only children in their own village/ward.
    """
    if worker.role == "supervisor" and worker.area.strip().lower() in ("all", "*"):
        return

    worker_area = worker.area.strip().lower()
    child_area = child.village_ward.strip().lower()

    # Exact match or sub-sector/hamlet match within worker area (e.g. 'Ward 12 - Sector A' in 'Ward 12')
    matches = (
        worker_area == child_area
        or child_area.startswith(f"{worker_area} - ")
        or child_area.startswith(f"{worker_area} / ")
        or child_area.startswith(f"{worker_area}: ")
    )

    if not matches:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Access denied: Worker from area '{worker.area}' cannot access "
                f"child in area '{child.village_ward}'."
            ),
        )


def build_summary_dict(referral: Referral) -> dict[str, Any]:
    """
    Generate minimal data summary dictionary.
    CRITICAL ACCEPTANCE CHECK: Must contain ONLY the listed fields.
    """
    age_bracket = referral.child.age_bracket if referral.child else "Unknown"
    domains = list(referral.domains_of_concern or [])

    return {
        "age_bracket": age_bracket,
        "tier": referral.tier,
        "domains_of_concern": domains,
        "safety_rule_trigger": referral.safety_rule_trigger,
    }


def generate_summary_text(referral: Referral) -> str:
    """Generate shareable plain-text summary with minimum data needed."""
    summary = build_summary_dict(referral)
    domains_str = (
        ", ".join(summary["domains_of_concern"])
        if summary["domains_of_concern"]
        else "None flagged"
    )
    safety_str = (
        summary["safety_rule_trigger"] if summary["safety_rule_trigger"] else "None"
    )

    return (
        "NIRIXON REFERRAL SUMMARY\n"
        "========================================\n"
        f"Age Bracket: {summary['age_bracket']}\n"
        f"Tier: {summary['tier']}\n"
        f"Domains of Concern: {domains_str}\n"
        f"Safety Rule Trigger: {safety_str}\n"
        "========================================\n"
        "Confidential Clinical Handoff. Minimum essential data only. Zero PII."
    )


def generate_summary_pdf(referral: Referral) -> bytes:
    """
    Generate a valid, single-page PDF 1.4 document containing strictly
    the minimal referral summary fields.
    Implemented in pure Python with zero external C/wheel dependencies.
    """
    summary = build_summary_dict(referral)
    domains_str = (
        ", ".join(summary["domains_of_concern"])
        if summary["domains_of_concern"]
        else "None flagged"
    )
    safety_str = (
        summary["safety_rule_trigger"] if summary["safety_rule_trigger"] else "None"
    )

    lines = [
        "NIRIXON DEVELOPMENTAL REFERRAL SUMMARY",
        "----------------------------------------------------------------------",
        f"Age Bracket: {summary['age_bracket']}",
        f"Tier: {summary['tier']}",
        f"Domains of Concern: {domains_str}",
        f"Safety Rule Trigger: {safety_str}",
        "----------------------------------------------------------------------",
        "Clinical Notice: Minimum essential dataset for pediatric triage.",
        "Zero personal identifiers (names, contacts, addresses) transmitted.",
    ]

    # Build PDF Content Stream
    stream_content = "BT\n/F1 12 Tf\n50 720 Td\n24 TL\n"
    for line in lines:
        safe_line = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        stream_content += f"({safe_line}) Tj\nT*\n"
    stream_content += "ET\n"
    stream_bytes = stream_content.encode("latin1")

    # PDF object assembly
    body = bytearray()
    body.extend(b"%PDF-1.4\n")
    offsets = [0]

    objs = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
        ),
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        (
            f"5 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin1")
            + stream_bytes
            + b"endstream\nendobj\n"
        ),
    ]

    for obj in objs:
        offsets.append(len(body))
        body.extend(obj)

    xref_offset = len(body)
    body.extend(f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode("latin1"))
    for off in offsets[1:]:
        body.extend(f"{off:010d} 00000 n \n".encode("latin1"))

    body.extend(
        f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode(
            "latin1"
        )
    )

    return bytes(body)
