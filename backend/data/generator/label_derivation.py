"""
Stage 1 — Age-Relative Risk Label Derivation

Risk labels (Typical / Monitor / Refer) are derived from AGE-RELATIVE
domain performance — a child is compared to other children at the same
corrected age, never scored against a fixed absolute bar. This is what
makes corrected_age_months load-bearing rather than decorative: a
premature infant is judged against their adjusted developmental stage,
not penalized for their birth date.

Method:
  1. For each domain, compute each child's domain_score (mean item
     z-response within that domain).
  2. Map each child to one of the 17 ASQ-3-style age brackets using
     map_to_bracket_label() from age_brackets.py.
  3. Within each bracket, convert each child's domain_score to a
     percentile rank against same-bracket peers.
  4. A child's "worst domain percentile" (their lowest-ranked domain)
     drives their label — a broad, single-domain delay is treated as
     seriously as a mild delay spread across several domains, which
     matches how these tools are meant to be conservative about missing
     a real, concentrated issue.
  5. regression_flag overrides everything else toward "Refer", since a
     lost skill is treated as a near-automatic escalation trigger in
     real pediatric practice (this mirrors the same design decision
     used for Stage 3's mandatory-question logic).

WHY 17 BRACKETS instead of the old 3-month floor bins:
  The ASQ-3-style brackets are the correct peer-comparison unit for
  this instrument. Children in the 2-month bracket have different
  expected milestone profiles than children in the 4-month bracket —
  pooling them together (as the old 3-month bins did at the boundaries)
  inflates within-bin variance and produces noisier percentile estimates.
  More critically: the imputation module (Stage 3) now uses the same 17
  brackets, so label derivation and imputation are aligned on the same
  peer-comparison unit.

Thin-bracket fallback:
  Some narrow brackets span only 2–3 months of age. With 8,000 synthetic
  children, most brackets will have ample sample sizes (~470 per bracket
  on average), but narrow early-year brackets (2mo, 4mo, 6mo) span fewer
  calendar months and will attract fewer children proportionally. If a
  bracket has fewer than MIN_BRACKET_N children, domain_percentiles()
  borrows children from the two immediately adjacent brackets (one younger,
  one older) to form a "pooled comparison group" for ranking. Borrowing
  is bidirectional and weighted equally — it is NOT a cascade fallback
  that silently widens to coarser bins. A warning is emitted when fallback
  is triggered so it is visible during data regeneration, not silent.

Thresholds on the composite score are picked empirically (see
generate_synthetic_data.py) to land close to the target class balance
(~73% Typical / 20% Monitor / 7% Refer) rather than hand-guessed, since
guessing cutoffs rarely hits a target distribution by luck.
"""

from __future__ import annotations

import warnings

import numpy as np
import pandas as pd
from age_brackets import BRACKETS, adjacent_brackets, map_to_bracket_label

# Minimum number of children in a bracket to compute stable percentile
# estimates without borrowing from neighbors. Set conservatively at 20 —
# below this, percentile rank estimates have high Monte Carlo variance.
MIN_BRACKET_N = 20



def domain_percentiles(
    domain_scores: pd.DataFrame,
    corrected_age_months: np.ndarray,
) -> pd.DataFrame:
    """
    domain_scores: DataFrame, one column per domain, one row per child.
    corrected_age_months: 1-D array aligned with domain_scores index.

    Returns a same-shaped DataFrame of within-bracket percentile ranks
    (0-1, higher = better) for each domain.

    Thin-bracket fallback: if a bracket has fewer than MIN_BRACKET_N
    children, the ranking pool is widened to include children from the
    immediately adjacent brackets (up to 2 neighbors: one younger, one
    older). This preserves age-relativity for the focal children while
    ensuring stable percentile estimates. Borrowing is symmetric — all
    children in the pooled group are ranked together.
    """
    # Assign every child to a bracket label
    bracket_labels = np.array(
        [map_to_bracket_label(a) for a in corrected_age_months]
    )

    out = pd.DataFrame(
        index=domain_scores.index, columns=domain_scores.columns, dtype=float
    )

    for bracket in BRACKETS:
        primary_mask = bracket_labels == bracket.label
        n_primary = primary_mask.sum()

        if n_primary == 0:
            # No children in this bracket at all (can happen with very small N)
            continue

        if n_primary >= MIN_BRACKET_N:
            # Enough children: rank within the bracket only
            out.loc[primary_mask, :] = domain_scores.loc[primary_mask, :].rank(pct=True)
        else:
            # Thin bracket: borrow from adjacent brackets
            warnings.warn(
                f"Bracket '{bracket.label}' has only {n_primary} children "
                f"(threshold: {MIN_BRACKET_N}). Borrowing from adjacent brackets "
                "for percentile ranking. Consider increasing N_CHILDREN in "
                "generate_synthetic_data.py if this happens frequently.",
                stacklevel=2,
            )
            neighbors = adjacent_brackets(bracket)
            neighbor_labels = {n.label for n in neighbors}
            pool_mask = primary_mask | np.isin(bracket_labels, list(neighbor_labels))

            # Rank all children in the pool together, then extract just the
            # focal bracket's rows so output shape is preserved
            pool_ranks = domain_scores.loc[pool_mask, :].rank(pct=True)
            out.loc[primary_mask, :] = pool_ranks.loc[primary_mask, :]

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
