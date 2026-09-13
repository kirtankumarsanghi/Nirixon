#!/usr/bin/env bash
# TODO: implement once Stage 4 OpenAPI is treated as the source of truth.
# Intended flow:
#   1. curl "$VITE_API_BASE_URL/openapi.json" (or localhost:8000)
#   2. Generate Zod schemas / TS types into frontend/src/api/types.ts
# Until then, types are hand-written — see TODO in that file.
set -euo pipefail
echo "export_openapi_to_zod.sh is not implemented yet. See frontend/src/api/types.ts TODO."
exit 1
