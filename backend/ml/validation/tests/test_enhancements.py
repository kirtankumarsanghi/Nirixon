import os
import sys
import numpy as np
import pytest
from dataclasses import replace

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from config import SimConfig
from sim_v2 import simulate, load_items, features
from tiered_triage import evaluate_tiered_triage
from guards import compute_guards


def test_frequency_scale_simulation():
    cfg = SimConfig(response_scale="frequency")
    items = load_items(os.path.join(os.path.dirname(__file__), "..", "data", "item_source.csv"), cfg.domains)
    sim = simulate(cfg, items, n=500, seed=10)

    # Answers must contain values in {0, 1, 2}
    unique_vals = np.unique(sim["answers"])
    assert set(unique_vals).issubset({0, 1, 2}), f"Expected subset of {{0, 1, 2}}, got {unique_vals}"
    assert 2 in unique_vals, "Expected level 2 to be observed"
    # Domain scores must be bounded between 0 and 1
    assert (sim["domain_scores"] >= 0.0).all() and (sim["domain_scores"] <= 1.0).all()
    assert not np.isnan(sim["domain_scores"]).any()


def test_empirical_pace():
    cfg = SimConfig(pace_mode="empirical")
    items = load_items(os.path.join(os.path.dirname(__file__), "..", "data", "item_source.csv"), cfg.domains)
    sim = simulate(cfg, items, n=500, seed=10)

    assert len(sim["age"]) == 500
    assert not np.isnan(sim["domain_scores"]).any()


def test_guards():
    cfg = SimConfig(enable_guards=True, response_scale="frequency", yes_bias_share=0.20)
    items = load_items(os.path.join(os.path.dirname(__file__), "..", "data", "item_source.csv"), cfg.domains)
    sim = simulate(cfg, items, n=500, seed=10)

    assert "guards" in sim
    g_df = sim["guards"]
    assert "acquiescence_score" in g_df.columns
    assert "inconsistency_score" in g_df.columns
    assert len(g_df) == 500
    assert g_df["acquiescence_suspect"].sum() > 0, "Expected some acquiescence flags under 20% yes-bias"


def test_tiered_triage():
    cfg = SimConfig(response_scale="frequency")
    items = load_items(os.path.join(os.path.dirname(__file__), "..", "data", "item_source.csv"), cfg.domains)
    sim = simulate(cfg, items, n=500, seed=10)

    # Simulated risk
    risk = sim["domain_scores"].min(axis=1)
    risk_inv = 1.0 - risk  # higher risk for lower scores
    res = evaluate_tiered_triage(sim["status"], risk_inv, direct_refer_target=0.15, total_recall_target=0.85)

    assert "direct_refer_share" in res
    assert "reflex_branch_share" in res
    assert "clinic_flood_reduction" in res
    assert 0.14 <= res["direct_refer_share"] <= 0.16
    assert res["total_refer_recall"] >= 0.84
    assert res["clinic_flood_reduction"] >= 0.80, "Expected clinic flood reduction of at least 80%"
