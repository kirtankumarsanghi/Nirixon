"""Single place for Module B engine ↔ API domain name mapping.

Engine / question bank / router use package names (`attention_work`,
`emotion_school`). Database, API responses, and frontend keep existing
Nirixon names (`attention`, `emotion_conduct`).
"""

from __future__ import annotations

# Engine-internal domain ids (router + question_bank_b.csv)
ENGINE_DOMAINS: list[str] = [
    "attention_work",
    "listening_speaking",
    "reading",
    "writing",
    "numbers",
    "motor",
    "social",
    "emotion_school",
]

# API / DB / frontend domain ids (unchanged from existing Module B)
API_DOMAINS: list[str] = [
    "attention",
    "listening_speaking",
    "reading",
    "writing",
    "numbers",
    "motor",
    "social",
    "emotion_conduct",
]

# Only these two differ between engine and API.
ENGINE_TO_API: dict[str, str] = {
    "attention_work": "attention",
    "emotion_school": "emotion_conduct",
}

API_TO_ENGINE: dict[str, str] = {v: k for k, v in ENGINE_TO_API.items()}


def to_api_domain(domain: str) -> str:
    """Map an engine domain (or pass-through) to the API/DB name."""
    return ENGINE_TO_API.get(domain, domain)


def to_engine_domain(domain: str) -> str:
    """Map an API/DB domain (or pass-through) to the engine name."""
    return API_TO_ENGINE.get(domain, domain)


def map_domain_dict_keys(data: dict, *, to_api: bool = True) -> dict:
    """Remap top-level keys of a domain-keyed dict."""
    fn = to_api_domain if to_api else to_engine_domain
    return {fn(k): v for k, v in data.items()}


def map_domain_list(domains: list[str], *, to_api: bool = True) -> list[str]:
    fn = to_api_domain if to_api else to_engine_domain
    return [fn(d) for d in domains]
