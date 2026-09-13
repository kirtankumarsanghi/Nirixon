"""
Stage 1 — Age-Relative Risk Label Derivation

Risk labels (Typical / Monitor / Refer) are derived from AGE-RELATIVE
domain performance - a child is compared to other children at the same
corrected age, never scored against a fixed absolute bar. This is what
makes corrected_age_months load-bearing rather than decorative: a
premature infant is judged against their adjusted developmental stage,
not penalized for their birth date.

Method:
  1. For each domain, compute each child's domain_score (mean item
     z-response within that domain).
  2. Bin children into 3-month corrected-age bins.
  3. Within each age bin, convert each child's domain_score to a
     percentile rank against same-age peers.
  4. A child's "worst domain percentile" (their lowest-ranked domain)
     drives their label - a broad, single-domain delay is treated as
     seriously as a mild delay spread across several domains, which
     matches how these tools are meant to be conservative about missing
     a real, concentrated issue.
  5. regression_flag overrides everything else toward "Refer", since a
     lost skill is treated as a near-automatic escalation trigger in
     real pediatric practice (this mirrors the same design decision
     used for Stage 3's mandatory-question logic).

Thresholds on the composite score are picked empirically (see
generate_synthetic_data.py) to land close to the target class balance
(~73% Typical / 20% Monitor / 7% Refer) rather than hand-guessed, since
guessing cutoffs rarely hits a target distribution by luck.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def age_bin(corrected_age_months: np.ndarray, bin_width: int = 3) -> np.ndarray:
    """3-month age bins, floor-based (matches the imputation scheme used
    later in Stage 3)."""
    return (corrected_age_months // bin_width) * bin_width


def domain_percentiles(
    domain_scores: pd.DataFrame,
    corrected_age_months: np.ndarray,
) -> pd.DataFrame:
    """
    domain_scores: DataFrame, one column per domain, one row per child.
    Returns a same-shaped DataFrame of within-age-bin percentile ranks
    (0-1, higher = better) for each domain.
    """
    bins = age_bin(corrected_age_months)
    out = pd.DataFrame(index=domain_scores.index, columns=domain_scores.columns, dtype=float)

    for b in np.unique(bins):
        mask = bins == b
        # rank() with pct=True gives a percentile per column within this age bin
        out.loc[mask, :] = domain_scores.loc[mask, :].rank(pct=True)

    return out


def composite_risk_score(
    pct_df: pd.DataFrame,
    regression_flag: np.ndarray,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Higher composite score = more concerning. Driven by the child's
    single worst-ranked domain (see module docstring), with a large,
    near-guaranteed bump for a regression event.

    Takes an explicit `rng` (the same seeded generator used everywhere
    else in the pipeline) instead of calling the global numpy random
    state directly - without this, the overall dataset was NOT fully
    reproducible run-to-run even with RNG_SEED fixed, since this was
    the one function drawing from an unseeded source.
    """
    worst_domain_pct = pct_df.min(axis=1).to_numpy()  # 0 (worst) .. 1 (best)
    composite = 1.0 - worst_domain_pct  # invert: higher = more concerning

    # Regression is a near-automatic escalation, but must NOT become a
    # perfectly-separable feature (a model - or a reader of this dataset -
    # should not find "regression_flag == 1" alone sufficient to know the
    # label with certainty). The bump is capped and probabilistic: most
    # regression-flagged children land in Refer, but not all, and a few
    # non-regression children can still land above them by worst-domain
    # percentile alone.
    regression_bump = regression_flag * rng.uniform(0.30, 0.55, size=len(composite))
    composite = composite + regression_bump

    return composite


def assign_labels_by_quantile(
    composite: np.ndarray,
    typical_frac: float = 0.73,
    monitor_frac: float = 0.20,
) -> np.ndarray:
    """
    Assigns Typical/Monitor/Refer by population quantiles of the
    composite score, so the overall class balance lands close to the
    target regardless of how the composite score happens to be
    distributed. This is a deliberate simplification for a synthetic,
    portfolio-scale dataset - a real clinical tool would calibrate
    against validated norms, not a target quantile split.
    """
    q_typical = np.quantile(composite, typical_frac)
    q_monitor = np.quantile(composite, typical_frac + monitor_frac)

    labels = np.where(
        composite <= q_typical,
        "Typical",
        np.where(composite <= q_monitor, "Monitor", "Refer"),
    )
    return labels
