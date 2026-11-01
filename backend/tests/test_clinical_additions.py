"""Unit tests for sensory, nutrition, EPDS and Module B context additions."""

from __future__ import annotations

from app.core.maternal.epds import score_epds
from app.core.module_b.engine_b import Bank, Engine, Session
from app.core.nutrition import evaluate_nutrition
from app.core.nutrition.flags import muac_status, weight_for_age_z
from app.core.sensory_items import (
    next_sensory_question,
    record_sensory_answer,
    sensory_override,
)
from app.core.session import ScreeningSession


class TestSensoryScreen:
    def test_two_questions_then_override(self):
        session = ScreeningSession(
            child_id="c1", corrected_age_months=18, question_cap=10, module="A"
        )
        first = next_sensory_question(session)
        assert first is not None and first.item_id == "vision_flag"
        record_sensory_answer(session, "vision_flag", 1)
        second = next_sensory_question(session)
        assert second is not None and second.item_id == "hearing_flag"
        record_sensory_answer(session, "hearing_flag", 0)
        assert next_sensory_question(session) is None
        assert sensory_override(session) == "Refer"

    def test_negative_answers_do_not_override(self):
        session = ScreeningSession(
            child_id="c2", corrected_age_months=18, question_cap=10, module="A"
        )
        record_sensory_answer(session, "vision_flag", 0)
        record_sensory_answer(session, "hearing_flag", 0)
        assert sensory_override(session) is None

    def test_module_b_is_not_asked(self):
        session = ScreeningSession(
            child_id="c3", corrected_age_months=96, question_cap=10, module="B"
        )
        assert next_sensory_question(session) is None


class TestNutrition:
    def test_muac_thresholds(self):
        assert muac_status(24, 11.0) == "severe_acute_malnutrition"
        assert muac_status(24, 12.0) == "moderate_acute_malnutrition"
        assert muac_status(24, 13.5) == "normal"
        assert muac_status(96, 12.0) == "severe_acute_malnutrition"

    def test_weight_for_age_reference(self):
        assert weight_for_age_z(24, "male", 12.2) == 0.0
        assert weight_for_age_z(24, "male", 9.4) is not None
        assert weight_for_age_z(24, "female", 11.5) == 0.0

    def test_refer_and_monitor_flags(self):
        severe = evaluate_nutrition(
            age_months=24, sex="male", weight_kg=8.0, muac_cm=11.0
        )
        assert severe["severity"] == "refer"
        assert {flag["code"] for flag in severe["flags"]} >= {
            "underweight",
            "severe_acute_malnutrition",
        }

        monitor = evaluate_nutrition(
            age_months=24, sex="male", weight_kg=12.2, muac_cm=12.0
        )
        assert monitor["severity"] == "monitor"

        none = evaluate_nutrition(
            age_months=24, sex="male", weight_kg=12.2, muac_cm=14.0
        )
        assert none["severity"] == "none"
        assert none["flags"] == []


class TestEpds:
    def test_all_well_is_typical(self):
        answers = {f"epds_{i}": 0 for i in range(1, 11)}
        result = score_epds(answers)
        assert result["total_score"] == 0
        assert result["classification"] == "Typical"
        assert result["safety_flag"] is False

    def test_high_scores_refer(self):
        answers = {f"epds_{i}": 3 for i in range(1, 11)}
        result = score_epds(answers)
        assert result["total_score"] > 13
        assert result["classification"] == "Refer"

    def test_positive_items_still_score_symptoms(self):
        answers = {f"epds_{i}": 0 for i in range(1, 11)}
        answers["epds_1"] = 3  # no longer able to laugh
        answers["epds_2"] = 3
        result = score_epds(answers)
        assert result["total_score"] == 6

    def test_self_harm_item_forces_safety(self):
        answers = {f"epds_{i}": 0 for i in range(1, 11)}
        answers["epds_10"] = 1
        result = score_epds(answers)
        assert result["safety_flag"] is True
        assert result["classification"] == "Refer"
        assert any("14416" in item["number"] for item in result["helplines"])


class TestModuleBContext:
    def test_context_order_and_recording(self):
        engine = Engine(bank=Bank())
        session = Session(age=8)
        first = engine._next_context(session)
        assert first is not None
        assert str(first["concept_id"]) == "cx_preterm"
        engine.answer(session, str(first["item_id"]), "Yes")
        assert session.context_answers
        second = engine._next_context(session)
        assert second is not None
        assert str(second["concept_id"]) == "cx_screen"
