"""Settings for the Module A validation simulator.

Every value marked ASSUMPTION is your own modelling choice, not a published number.
Say so in your report and test it in the stress tests.
"""

from dataclasses import dataclass

DOMAINS = (
    "communication",
    "gross_motor",
    "fine_motor",
    "cognitive",
    "personal_social",
    "self_help",
)


@dataclass(frozen=True)
class SimConfig:
    domains: tuple = DOMAINS
    items_asked_per_domain: int = (
        3  # 6 domains x 3 = 18 items, the adaptive cap in your build
    )
    g_weight: float = 0.66  # shared-factor loading, so domains correlate (ASSUMPTION)
    pace: float = 0.15  # dev_age = age * exp(pace * theta)            (ASSUMPTION)
    pace_mode: str = (
        "fixed"  # "fixed" (use pace float) or "empirical" (age-varying WHO/GSED curve)
    )
    response_scale: str = (
        "binary"  # "binary" (0/1) or "frequency" (0/1/2 ordinal cumulative logit)
    )
    enable_guards: bool = False  # compute acquiescence and inconsistency flags
    slip: float = 0.05  # p = slip + (1 - 2*slip) * p_true             (ASSUMPTION)
    yes_bias_share: float = (
        0.10  # share of parents who answer "yes" to all     (ASSUMPTION)
    )
    flip_rate: float = 0.0  # random answer flips (stress test only)
    preterm_error_share: float = (
        0.0  # share with a wrong age entered (stress test only)
    )
    age_min: float = 3.0
    age_max: float = 60.0
    # DESIGN SETTING (typical, monitor, refer). Not an observed rate. Stress-test it.
    target_mix: tuple = (0.73, 0.20, 0.07)
