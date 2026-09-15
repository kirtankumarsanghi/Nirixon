"""
Module B — NLP Domain Router

Maps a parent/teacher's free-text observation to one or more Module B
functioning domains, extracts contextual signals (setting, frequency,
duration hints), and decides when the input is too short/vague to proceed.

Architecture:
  route_text(text, config) → DomainRouterResult

  The implementation uses keyword/phrase pattern matching driven by
  nlp_domain_rules.json. This is intentionally simple and transparent —
  every routing decision can be audited by reading the config file.

Extension point:
  Replace or augment _apply_rules() with a trained text classifier by
  implementing the same function signature. The route_text() interface
  and DomainRouterResult shape do not change.

Safety constraints:
  - NEVER outputs a diagnosis or disease name.
  - Domain labels are functioning areas, not clinical labels.
  - rule_out_flagged is a triage flag, not a diagnosis; it means
    "route to a specialist directly, do not score Typical/Monitor/Refer".
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import TypedDict

logger = logging.getLogger(__name__)

_DEFAULT_CONFIG_PATH = os.path.join(
    os.path.dirname(__file__), "nlp_domain_rules.json"
)

# Module B scored domains (excludes rule_out)
_SCORED_DOMAINS = {
    "attention", "reading", "writing", "numbers",
    "listening_speaking", "motor", "social", "emotion_conduct",
}


# ---------------------------------------------------------------------------
# Public result type
# ---------------------------------------------------------------------------

class DomainRouterResult(TypedDict):
    detected_domains: list[str]       # subset of _SCORED_DOMAINS
    rule_out_flagged: bool             # vision/hearing/global-delay signal
    setting: str                       # "home" | "school" | "both" | "unknown"
    recall_help_needed: bool           # True → show tappable chips to user
    recall_help_options: list[str]     # from config
    token_count: int                   # for diagnostics


# ---------------------------------------------------------------------------
# Config loader (cached at module level after first call)
# ---------------------------------------------------------------------------

_cached_config: dict | None = None


def _load_config(config_path: str = _DEFAULT_CONFIG_PATH) -> dict:
    global _cached_config
    if _cached_config is None:
        with open(config_path, encoding="utf-8") as f:
            _cached_config = json.load(f)
    return _cached_config


def _reset_config_cache() -> None:
    """Test helper — allows injecting a different config without restart."""
    global _cached_config
    _cached_config = None


# Force reload when module is re-imported after config edits in development.
_reset_config_cache()


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation for matching."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s']", " ", text)  # keep apostrophes for "can't" etc.
    return re.sub(r"\s+", " ", text)


def _token_count(text: str) -> int:
    return len(text.split())


def _detect_setting(text: str) -> str:
    lower = text.lower()
    has_school = any(w in lower for w in ("school", "class", "teacher", "classroom", "homework"))
    has_home = any(w in lower for w in ("home", "house", "family", "dinner", "bedtime", "morning"))
    if has_school and has_home:
        return "both"
    if has_school:
        return "school"
    if has_home:
        return "home"
    return "unknown"


# ---------------------------------------------------------------------------
# Rule-based domain matching
# ---------------------------------------------------------------------------

def _keyword_hits(normalised_text: str, keyword: str) -> bool:
    """
    Match a keyword/phrase against normalised text.

    Multi-word keywords use substring match; single tokens use whole-word
    boundaries so short stems like 'math' do not false-hit unrelated words.
    """
    kw = keyword.lower().strip()
    if not kw:
        return False
    if " " in kw:
        return kw in normalised_text
    return bool(re.search(r"\b" + re.escape(kw) + r"\b", normalised_text))


def _apply_rules(normalised_text: str, domain_rules: dict) -> tuple[set[str], bool]:
    """
    Returns (matched_scored_domains, rule_out_flagged).

    Checks keywords first, then phrases. A domain matches if ANY keyword
    or phrase hits. Longer / multi-word hits are preferred implicitly by
    still collecting every matching domain (multi-domain intake is valid).
    """
    matched: set[str] = set()
    rule_out_flagged = False

    for domain, rules in domain_rules.items():
        keywords = rules.get("keywords", [])
        phrases = rules.get("phrases", [])

        hit = any(_keyword_hits(normalised_text, kw) for kw in keywords)
        if not hit:
            hit = any(ph.lower() in normalised_text for ph in phrases)

        if hit:
            if domain == "rule_out":
                rule_out_flagged = True
            elif domain in _SCORED_DOMAINS:
                matched.add(domain)

    return matched, rule_out_flagged


# ---------------------------------------------------------------------------
# Public interface
# ---------------------------------------------------------------------------

def route_text(
    text: str,
    config: dict | None = None,
    config_path: str = _DEFAULT_CONFIG_PATH,
) -> DomainRouterResult:
    """
    Map free text to Module B functioning domains.

    Parameters
    ----------
    text:
        Raw free-text input from parent or teacher.
    config:
        Parsed config dict (for testing). If None, loads from config_path.
    config_path:
        Path to nlp_domain_rules.json; defaults to the bundled config.

    Returns
    -------
    DomainRouterResult with all routing signals the orchestrator needs.
    """
    if config is None:
        config = _load_config(config_path)

    min_tokens: int = config.get("min_tokens", 5)
    specificity_min_kw: int = config.get("specificity_min_keywords", 1)
    recall_options: list[str] = config.get("recall_help_options", [])
    domain_rules: dict = config.get("domain_rules", {})

    token_count = _token_count(text)
    normalised = _normalise(text)

    matched_domains, rule_out_flagged = _apply_rules(normalised, domain_rules)

    # Check for recall help chips in the text (exact match of chip labels)
    domain_map: dict = config.get("recall_help_domain_map", {})
    chip_hit = False
    for chip_label, mapped_domains in domain_map.items():
        if chip_label.lower() in text.lower():
            chip_hit = True
            for d in mapped_domains:
                if d == "rule_out":
                    rule_out_flagged = True
                elif d in _SCORED_DOMAINS:
                    matched_domains.add(d)

    # Short / vague text → recall help needed before domain routing
    if token_count < min_tokens and not chip_hit:
        logger.info(
            "nlp_router: text too short (tokens=%d < min=%d) → recall_help",
            token_count, min_tokens,
        )
        return DomainRouterResult(
            detected_domains=[],
            rule_out_flagged=False,
            setting=_detect_setting(text),
            recall_help_needed=True,
            recall_help_options=recall_options,
            token_count=token_count,
        )

    # No keywords hit at all → vague, needs recall help
    recall_help_needed = len(matched_domains) == 0 and not rule_out_flagged and not chip_hit

    detected_domains = sorted(matched_domains)  # stable order for determinism

    logger.info(
        "nlp_router: tokens=%d domains=%s rule_out=%s recall_help=%s",
        token_count, detected_domains, rule_out_flagged, recall_help_needed,
    )

    return DomainRouterResult(
        detected_domains=detected_domains,
        rule_out_flagged=rule_out_flagged,
        setting=_detect_setting(text),
        recall_help_needed=recall_help_needed,
        recall_help_options=recall_options if recall_help_needed else [],
        token_count=token_count,
    )


def route_recall_chip(
    chip: str,
    config: dict | None = None,
    config_path: str = _DEFAULT_CONFIG_PATH,
) -> DomainRouterResult:
    """
    Called when the user taps a 'Recall Help' chip instead of typing more text.
    Maps the chip label directly to domain(s) via recall_help_domain_map in config.

    Returns a DomainRouterResult with the mapped domains, no recall_help_needed.
    """
    if config is None:
        config = _load_config(config_path)

    domain_map: dict = config.get("recall_help_domain_map", {})
    mapped: list[str] = domain_map.get(chip, [])

    rule_out_flagged = "rule_out" in mapped
    scored = [d for d in mapped if d in _SCORED_DOMAINS]

    return DomainRouterResult(
        detected_domains=scored,
        rule_out_flagged=rule_out_flagged,
        setting="unknown",
        recall_help_needed=False,
        recall_help_options=[],
        token_count=0,
    )
