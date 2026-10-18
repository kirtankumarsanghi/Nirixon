"""Export the FastAPI schema as OpenAPI JSON + a Postman collection.

    cd backend
    python scripts/export_openapi.py

Writes docs/openapi.json and docs/nirixon.postman_collection.json (checked in so
evaluators can import them without running the server).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / "docs"


def _segment(part: str) -> str:
    if part.startswith("{") and part.endswith("}"):
        return f":{part[1:-1]}"
    return part


def to_postman(spec: dict) -> dict:
    items = []
    for path in sorted(spec.get("paths", {})):
        for method, operation in spec["paths"][path].items():
            if method.lower() not in {"get", "post", "put", "patch", "delete"}:
                continue
            items.append(
                {
                    "name": operation.get("summary") or f"{method.upper()} {path}",
                    "request": {
                        "method": method.upper(),
                        "header": [
                            {
                                "key": "Authorization",
                                "value": "Bearer {{token}}",
                                "type": "text",
                            }
                        ],
                        "url": {
                            "raw": "{{baseUrl}}" + path,
                            "host": ["{{baseUrl}}"],
                            "path": [
                                _segment(p) for p in path.strip("/").split("/") if p
                            ],
                        },
                        "description": operation.get("description", ""),
                    },
                }
            )
    return {
        "info": {
            "name": "Nirixon API",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "variable": [
            {"key": "baseUrl", "value": "http://127.0.0.1:8000"},
            {"key": "token", "value": ""},
        ],
        "item": items,
    }


def main() -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    spec = app.openapi()
    (DOCS / "openapi.json").write_text(
        json.dumps(spec, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (DOCS / "nirixon.postman_collection.json").write_text(
        json.dumps(to_postman(spec), indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(f"Wrote {DOCS / 'openapi.json'}")
    print(f"Wrote {DOCS / 'nirixon.postman_collection.json'}")


if __name__ == "__main__":
    main()
