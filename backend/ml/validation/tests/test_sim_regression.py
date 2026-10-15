import os
import sys
from dataclasses import replace
import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from config import SimConfig
from sim_v2 import simulate, load_items, features


def test_simulate_nearest_golden():
    cfg = SimConfig()
    items = load_items(os.path.join(os.path.dirname(__file__), "..", "data", "item_source.csv"), cfg.domains)
    golden_path = os.path.join(os.path.dirname(__file__), "golden_sim.npz")
    assert os.path.exists(golden_path), f"Golden file not found at {golden_path}"
    golden = np.load(golden_path)

    for s in [10, 42]:
        sim = simulate(cfg, items, n=500, seed=s, selection="nearest")
        for k in ["age", "age_used", "answers", "domain_scores", "status", "theta"]:
            key = f"s{s}_{k}"
            assert key in golden, f"Missing key {key} in golden file"
            assert np.array_equal(sim[k], golden[key]), f"Mismatch in {k} for seed {s}"


def test_simulate_within6_error_and_nan():
    cfg = SimConfig()
    items = load_items(os.path.join(os.path.dirname(__file__), "..", "data", "item_source.csv"), cfg.domains)
    cfg_stress = replace(cfg, flip_rate=0.1, yes_bias_share=1.0)
    sim = simulate(cfg_stress, items, n=500, seed=10, selection="within6")

    # Domain scores should have no NaNs
    assert not np.isnan(sim["domain_scores"]).any(), "domain_scores should have no NaNs"
    # Answers should have NaNs due to item bank sparsity within 6 months
    assert np.isnan(sim["answers"]).any(), "answers should contain NaNs for sparse domains"
    # features(sim, "raw") must raise ValueError
    with pytest.raises(ValueError, match="NaN"):
        features(sim, mode="raw")
