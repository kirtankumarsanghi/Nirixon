"""Map Module B engine actions/results onto API (existing domain names)."""

from __future__ import annotations

from typing import Any

from .domains import (
    map_domain_dict_keys,
    map_domain_list,
    to_api_domain,
    to_engine_domain,
)
from .engine_b import LABEL


def map_action_to_api(action: dict[str, Any]) -> dict[str, Any]:
    """Convert an engine next_action dict to API domain names."""
    out = dict(action)
    track = out.get("track")
    if isinstance(track, str):
        out["track"] = to_api_domain(track)
        out["domain"] = to_api_domain(track)
    if out.get("type") == "recall_help" and isinstance(out.get("options"), dict):
        # options keys are engine domains; expose API names + friendly labels
        out["options"] = {
            to_api_domain(k): (LABEL.get(k) or v) for k, v in out["options"].items()
        }
    return out


def map_result_to_api(result: dict[str, Any]) -> dict[str, Any]:
    """Convert an engine result dict to API domain names."""
    out = dict(result)
    if "domains" in out and isinstance(out["domains"], dict):
        out["domains"] = map_domain_dict_keys(out["domains"], to_api=True)
    if "activities" in out and isinstance(out["activities"], dict):
        out["activities"] = map_domain_dict_keys(out["activities"], to_api=True)
    if "flagged_domains" in out and isinstance(out["flagged_domains"], list):
        out["flagged_domains"] = map_domain_list(out["flagged_domains"], to_api=True)
    # Flat Typical/Monitor/Refer map for existing ResultPayload.domain_classifications
    domains = out.get("domains") or {}
    out["domain_classifications"] = {
        d: (info.get("state") if isinstance(info, dict) else info)
        for d, info in domains.items()
    }
    return out


def map_recall_domains_to_engine(domains: list[str]) -> list[str]:
    return [to_engine_domain(d) for d in domains]
