"""Module B adaptive screening (ages 5–12): text router + question engine.

Import submodules directly when possible to avoid circular imports with
`data.generator.item_bank_b` / `safety_floor`.
"""

from .age import months_to_module_b_age
from .domains import (
    API_DOMAINS,
    API_TO_ENGINE,
    ENGINE_DOMAINS,
    ENGINE_TO_API,
    map_domain_dict_keys,
    map_domain_list,
    to_api_domain,
    to_engine_domain,
)

__all__ = [
    "API_DOMAINS",
    "API_TO_ENGINE",
    "ENGINE_DOMAINS",
    "ENGINE_TO_API",
    "map_domain_dict_keys",
    "map_domain_list",
    "module_b_service",
    "months_to_module_b_age",
    "to_api_domain",
    "to_engine_domain",
]


def __getattr__(name: str):
    if name == "module_b_service":
        from .service import module_b_service as _svc

        return _svc
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
