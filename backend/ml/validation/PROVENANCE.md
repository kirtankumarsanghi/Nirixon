# Validation Kit Parameter Provenance

This document lists every parameter in `src/config.py`, its clinical/empirical status, and its exact source or rationale.

| Parameter | Value in `src/config.py` | Status | Source / Rationale |
| :--- | :--- | :--- | :--- |
| `domains` | `("communication", "gross_motor", "fine_motor", "cognitive", "personal_social", "self_help")` | DESIGN CHOICE | Standard developmental screening areas (adapted from ASQ-3 and CDC surveillance domains). Note: ASQ-3 has no Self-Help area; Nirixon includes Self-Help. |
| `items_asked_per_domain` | `3` | DESIGN CHOICE | Adaptive screening design cap: 6 domains × 3 items = 18 total items administered per session. |
| `g_weight` | `0.66` | SOURCED (with caveats) | ASQ-3 Technical Appendix Table 14: mean of the 10 area-pair correlations = 0.438, sqrt(0.438) = 0.6618 ≈ 0.66. **Caveats**: US normative sample, observed (not latent) Pearson correlations; ASQ-3 does not measure a Self-Help area. |
| `pace` | `0.15` | DERIVED (with caveats) | DERIVED, approx 0.16-0.18 from WHO windows (sitting 0.179, standing with assistance 0.175, walking alone 0.157; half-window / 2.326 / midpoint), likely a lower bound because the WHO sample is healthy children. |
| `slip` | `0.05` | UNSOURCED-SWEPT | Modelling assumption: lower/upper bound error rate on passing a milestone ($p = \text{slip} + (1 - 2\times\text{slip})\,p_{\text{true}}$). Swept in stress tests. |
| `yes_bias_share` | `0.10` | UNSOURCED-SWEPT | Modelling assumption: fraction of parents exhibiting acquiescence bias (answering "yes" across all items). Swept in stress tests ($0.05, 0.15, 0.25, 0.30$). |
| `flip_rate` | `0.00` | UNSOURCED-SWEPT | Modelling assumption: independent random answer flip probability. Swept in stress tests ($0.00, 0.05, 0.10, 0.20$). |
| `preterm_error_share` | `0.00` | UNSOURCED-SWEPT | Modelling assumption: fraction of children where chronological age is entered without gestational age correction ($\pm 2$ to $3$ months error). Swept in stress tests ($0.00, 0.10$). |
| `age_min` | `3.0` | DESIGN CHOICE | Minimum age boundary for the screening platform (3.0 months). |
| `age_max` | `60.0` | DESIGN CHOICE | Maximum age boundary for the screening platform (60.0 months). |
| `target_mix` | `(0.73, 0.20, 0.07)` | DESIGN CHOICE | Target screening population risk distribution (73% Typical, 20% Monitor, 7% Refer). Explicit design choice for threshold calibration, not an observed epidemiological prevalence. Swept in stress tests (Refer 12%, 15%). |
| `75% pass criterion` | `age75_months` | SOURCED | CDC milestone revision criteria: Zubler et al. (2022), "Evidence-Informed Milestones for Surveillance Tools", *Pediatrics* 149(3):e2021052138. Items reflect the age at which $\ge 75\%$ of children pass the milestone. |
| `WHO windows` | `s_months = width / 9.19` | SOURCED | WHO Multicentre Growth Reference Study Group (2006), "Assessment of sex differences and heterogeneity in motor milestone attainment among populations in the WHO Multicentre Growth Reference Study", *Acta Paediatrica* Suppl 450:66-75. 1st–99th percentile windows. |
