"""
Stage 1 — Correlated Latent Risk Factors

Real developmental delay doesn't hit one domain in isolation - a child
behind on communication is somewhat more likely to also be behind on
personal-social skills, because both draw on overlapping underlying
processes. This module generates that correlation structure explicitly,
via a multivariate-normal "ability" draw per child, so it's a modeled
choice rather than an accidental artifact of how items happen to be
written.

Design choices, stated plainly:
  - A general developmental factor ("g") pulls all 6 domains together
    a little, mimicking how overall developmental status has some
    unified component.
  - communication and personal_social are correlated more strongly with
    each other than with the other domains (mirrors real patterns where
    language delay and social delay often co-occur).
  - multilingual_home_flag has ZERO effect on any domain latent by
    construction - it's context, not a penalty. Stage 2's fairness
    check exists specifically to confirm this holds in the data as
    actually generated, not just as intended here.
  - family_history_flag shifts the mean of all domain latents down
    slightly (a small, realistic risk increase - not a certainty).
"""

from __future__ import annotations

import numpy as np
try:
    from item_bank import DOMAINS
except ImportError:
    from data.generator.item_bank import DOMAINS

N_DOMAINS = len(DOMAINS)
DOMAIN_INDEX = {d: i for i, d in enumerate(DOMAINS)}


def _build_correlation_matrix() -> np.ndarray:
    """6x6 correlation matrix across domains, in DOMAINS order."""
    base = 0.30  # baseline cross-domain correlation from the shared "g" factor
    corr = np.full((N_DOMAINS, N_DOMAINS), base)
    np.fill_diagonal(corr, 1.0)

    # Boost communication <-> personal_social correlation specifically.
    ci = DOMAIN_INDEX["communication"]
    si = DOMAIN_INDEX["personal_social"]
    corr[ci, si] = corr[si, ci] = 0.55

    return corr


CORR_MATRIX = _build_correlation_matrix()


def sample_domain_latents(
    n: int,
    family_history_flag: np.ndarray,
    sampler: np.random.Generator,
) -> np.ndarray:
    """
    Simulates an (n, 6) latent developmental profile using a continuous
    Multivariate Normal Gaussian Copula parameterized by CORR_MATRIX.
    
    Zero-correlation invariance: Multilingual exposure (multilingual_home_flag)
    is intentionally excluded from the latent ability equations to ensure fairness.
    """
    mean = np.zeros(N_DOMAINS)
    latents = sampler.multivariate_normal(mean=mean, cov=CORR_MATRIX, size=n)

    # Moderate familial risk shift: applies across domains to preserve covariance geometry
    fh_shift = -0.35
    latents[family_history_flag == 1] += fh_shift

    return latents  # shape (n, N_DOMAINS)


def apply_regression_event(
    latents: np.ndarray,
    regression_flag: np.ndarray,
    sampler: np.random.Generator,
) -> np.ndarray:
    """
    For children with regression_flag == 1, simulates a focal skill regression:
    identifies an affected target domain and imposes a severe clinical deficit (-1.5 to -2.5 SD).
    """
    latents = latents.copy()
    flagged_idx = np.where(regression_flag == 1)[0]
    if len(flagged_idx) == 0:
        return latents

    domains_to_hit = sampler.integers(0, N_DOMAINS, size=len(flagged_idx))
    latents[flagged_idx, domains_to_hit] -= sampler.uniform(1.5, 2.5, size=len(flagged_idx))
    return latents
