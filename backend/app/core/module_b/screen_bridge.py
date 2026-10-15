"""Bridge Module B engine actions/results into screen API payloads.

Privacy: free text and answers live only in the client-held engine_session
blob. Helpers here must never log that blob or write it to the database.
"""

from __future__ import annotations

from typing import Any

from app.schemas.screen import (
    ActivityPayload,
    DomainTrackPayload,
    QuestionPayload,
    ResultPayload,
    ScreenActionResponse,
)

from .api_map import map_action_to_api, map_result_to_api
from .engine_b import Engine, Session


def _question_from_action(
    action: dict[str, Any], *, question_cap: int = 20
) -> QuestionPayload:
    progress = action.get("progress") or {}
    answered = int(progress.get("answered", 0))
    response_type = str(action.get("response_type") or "likert5")
    # Normalize engine response_type for the frontend
    if response_type == "yesno":
        ui_rt: str = "yesno"
    elif response_type == "likert5":
        ui_rt = "likert5"
    else:
        ui_rt = response_type
    domain = str(action.get("domain") or action.get("track") or "")
    return QuestionPayload(
        item_id=str(action["item_id"]),
        question_text=str(action.get("text") or ""),
        domain=domain,
        question_number=answered + 1,
        question_cap=int(progress.get("max", question_cap)),
        response_type=ui_rt,  # type: ignore[arg-type]
        scale_labels=action.get("scale")
        if isinstance(action.get("scale"), str)
        else None,
        track=domain,
    )


def build_action_response(
    *,
    session_id: str,
    engine_session: str,
    action: dict[str, Any],
    status: str = "in_progress",
) -> ScreenActionResponse:
    mapped = map_action_to_api(action)
    atype = mapped.get("type")
    if atype == "question":
        return ScreenActionResponse(
            type="question",
            session_id=session_id,
            status=status,
            question=_question_from_action(mapped),
            engine_session=engine_session,
        )
    if atype == "recall_help":
        return ScreenActionResponse(
            type="recall_help",
            session_id=session_id,
            status=status,
            engine_session=engine_session,
            recall_message=str(mapped.get("message") or ""),
            recall_options=dict(mapped.get("options") or {}),
        )
    if atype == "safety_notice":
        return ScreenActionResponse(
            type="safety_notice",
            session_id=session_id,
            status=status,
            engine_session=engine_session,
            safety_message=str(mapped.get("message") or ""),
            helplines=dict(mapped.get("helplines") or {}),
        )
    # done
    return ScreenActionResponse(
        type="done",
        session_id=session_id,
        status=status,
        engine_session=engine_session,
    )


def build_result_payload(raw: dict[str, Any]) -> ResultPayload:
    mapped = map_result_to_api(raw)
    domain_classifications = {
        k: str(v) for k, v in (mapped.get("domain_classifications") or {}).items()
    }
    # Overall = worst of Refer > Monitor > Typical among scored domains
    order = {
        "Refer": 3,
        "Monitor": 2,
        "Typical": 1,
        "Not asked": 0,
        "Flag": 3,
        "No flag": 0,
    }
    final = "Typical"
    for state in domain_classifications.values():
        if order.get(state, 0) > order.get(final, 0):
            final = state
    if mapped.get("safety"):
        # Safety does not invent a diagnosis; keep domain scores but mark override
        pass

    def _tracks(src: dict[str, Any] | None) -> dict[str, DomainTrackPayload]:
        out: dict[str, DomainTrackPayload] = {}
        for k, v in (src or {}).items():
            if not isinstance(v, dict):
                continue
            out[k] = DomainTrackPayload(
                state=str(v.get("state", "Not asked")),
                score=v.get("score"),
                n=int(v.get("n") or 0),
                endorsed=v.get("endorsed"),
                borderline=v.get("borderline"),
                brief=v.get("brief"),
                because=list(v.get("because") or []),
                irt_theta=v.get("irt_theta"),
                irt_se=v.get("irt_se"),
                fisher_information=v.get("fisher_information"),
            )
        return out

    activities: dict[str, list[ActivityPayload]] = {}
    for dom, acts in (mapped.get("activities") or {}).items():
        activities[dom] = [
            ActivityPayload(
                title=str(a.get("title") or ""),
                minutes=a.get("minutes"),
                setting=a.get("setting"),
                steps=a.get("steps"),
            )
            for a in (acts or [])
            if isinstance(a, dict)
        ]

    # Tiered clinical triage
    if final == "Refer" or mapped.get("safety"):
        triage_tier = "Tier 3: Direct Referral"
        reflex_recommended = False
    elif final == "Monitor":
        triage_tier = "Tier 2: Reflex-Branch"
        reflex_recommended = True
    else:
        triage_tier = "Tier 1: Routine Pass"
        reflex_recommended = False

    target_reflex_domains = [
        dom for dom, st in domain_classifications.items() if st == "Monitor"
    ]

    guard_flags = dict(mapped.get("guard_flags") or {})
    guard_advisories: list[str] = []

    if guard_flags.get("straight_lining"):
        guard_advisories.append(
            "Response Pattern Advisory: High uniformity detected across Likert responses "
            "(straight-lining). Responses may reflect respondent rush or fatigue."
        )

    # Pediatric comorbidity synthesis (ADHD x SLD co-occurrence)
    attn_concerning = domain_classifications.get("attention") in ("Refer", "Monitor")
    acad_concerning = any(
        domain_classifications.get(d) in ("Refer", "Monitor")
        for d in ("reading", "writing", "numbers")
    )
    if attn_concerning and acad_concerning:
        guard_advisories.append(
            "Clinical Comorbidity Note: Co-occurring pattern of Attention/Executive Function and "
            "Academic/Phonological Processing observed (~40% clinical overlap). Per AAP/DSM-5 guidance, "
            "recommend multidisciplinary evaluation (Child Neurologist + Educational Psychologist)."
        )

    # Sensory vs Cognitive Differential Masking
    diff_masking = dict(mapped.get("differential_masking") or {})
    diff_advisories = list(mapped.get("differential_advisories") or [])
    guard_advisories.extend(diff_advisories)

    summary_text = mapped.get("summary")
    if guard_advisories and summary_text:
        for adv in guard_advisories:
            if adv not in summary_text:
                summary_text = f"{summary_text} {adv}"

    return ResultPayload(
        final_classification=final,
        ml_classification=final,
        model_name="module_b_engine",
        ml_score=0.0,
        probabilities={"Typical": 0.0, "Monitor": 0.0, "Refer": 0.0},
        safety_override_triggered=bool(mapped.get("safety")),
        override_rule="safety_helpline" if mapped.get("safety") else None,
        shap_top_features=[],
        shap_values={},
        stopping_reason="module_b_engine",
        caveats=[
            str(
                mapped.get("disclaimer")
                or "Patterns worth a closer look. Not a diagnosis."
            )
        ]
        + guard_advisories,
        real_answer_count=int(mapped.get("questions_asked") or 0),
        imputed_count=0,
        domain_classifications=domain_classifications,
        module="B",
        summary=summary_text,
        activities=activities,
        domain_details=_tracks(mapped.get("domains")),
        ruleouts=_tracks(mapped.get("ruleouts")),
        flagged_domains=list(mapped.get("flagged_domains") or []),
        help_routes=dict(mapped.get("help") or {}),
        safety=bool(mapped.get("safety")),
        disclaimer=mapped.get("disclaimer"),
        triage_tier=triage_tier,
        reflex_branch_recommended=reflex_recommended,
        target_reflex_domains=target_reflex_domains,
        guard_flags=guard_flags,
        guard_advisories=guard_advisories,
        differential_masking=diff_masking,
    )


def run_start(
    engine: Engine,
    *,
    text: str,
    age_years: int,
    form: str = "parent",
    seed: int = 42,
) -> tuple[Session, dict[str, Any]]:
    s = engine.start(text, age_years, form=form, seed=seed)
    action = engine.next_action(s)
    return s, action


def run_answer(
    engine: Engine,
    session: Session,
    *,
    item_id: str,
    value: Any,
    track: str | None = None,
) -> tuple[Session, dict[str, Any]]:
    engine.answer(session, item_id, value, track=track)
    return session, engine.next_action(session)


def run_recall(
    engine: Engine,
    session: Session,
    domains_engine: list[str],
) -> tuple[Session, dict[str, Any]]:
    engine.apply_recall_choice(session, domains_engine)
    return session, engine.next_action(session)
