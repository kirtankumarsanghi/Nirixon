"""
Pydantic schemas for one-time joint family invites, respondent submission,
concordance analysis, and combination merge.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class CreateJointInviteRequest(BaseModel):
    role_label: str = Field(
        ...,
        min_length=2,
        max_length=64,
        description="Role of the respondent (e.g. Grandparent, Father, Teacher, Babysitter). No personal names.",
    )
    expires_in_hours: int = Field(
        default=48,
        ge=1,
        le=168,
        description="Hours until this one-time invite token expires (default 48h).",
    )


class JointInviteResponse(BaseModel):
    token: str
    invite_url: str
    role_label: str
    expires_at: datetime
    session_id: str
    max_respondents_limit: int = 3
    active_invites_count: int


class JointQuestionOption(BaseModel):
    value: int
    label: str
    description: str | None = None


class JointQuestionItem(BaseModel):
    item_id: str
    question_text: str
    domain: str
    response_type: str
    options: list[JointQuestionOption]


class JointInvitePublicDetail(BaseModel):
    """
    CRITICAL PRIVACY GUARANTEE:
    A token exposes ONLY the items to answer and the role, nothing else about the child.
    NO child name, NO child ref, NO birthdate, NO primary caregiver details.
    """

    valid: bool
    role_label: str
    expires_at: datetime
    items: list[JointQuestionItem]
    item_count: int


class SubmitJointResponseRequest(BaseModel):
    answers: dict[str, int] = Field(
        ...,
        description="Dict mapping item_id to response value (e.g. 0, 1, 2).",
    )
    role_label: str | None = Field(
        None,
        description="Optional confirmation of role label. NO personal names.",
    )


class SubmitJointResponseResponse(BaseModel):
    status: str = "received"
    session_id: str
    role_label: str
    submitted_items_count: int
    message: str


class JointDisagreementPayload(BaseModel):
    item_id: str
    domain: str
    question_text: str
    primary_answer: int
    respondent_answers: list[dict[str, Any]]
    max_delta: int
    most_concerning_answer: int
    most_concerning_role: str
    follow_up_prompt: str


class JointItemConcordancePayload(BaseModel):
    item_id: str
    domain: str
    primary_answer: int
    secondary_answers: dict[str, int]
    is_concordant: bool
    concordance_score: float
    exact_match_ratio: float
    most_concerning_value: int


class ShareMergeRequest(BaseModel):
    """Optional payload to trigger or supply merged answers."""

    answers: dict[str, int] = Field(
        default_factory=dict,
        description="Optional additional respondent answers to merge.",
    )
    role_label: str | None = Field(
        None,
        description="Role label if submitting via merge directly.",
    )


class JointMergeResponse(BaseModel):
    session_id: str
    respondent_count: int
    roles: list[str]
    overall_concordance: float
    exact_agreement_pct: float
    total_overlapping_items: int
    concordance_level: str
    disagreements: list[JointDisagreementPayload]
    item_concordance: list[JointItemConcordancePayload]
    safety_override_triggered: bool
    override_rule: str | None
    safety_source: str | None
    final_classification: str
    ml_classification: str
    combination_notice: str = (
        "Combination rule applied: Primary caregiver answers fed the statistical ML model; "
        "most concerning answer across all respondents fed the safety rule."
    )
