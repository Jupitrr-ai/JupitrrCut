#!/usr/bin/env bash
# Metro prestart: sync dev Firebase files by default.
# Skip when testing production (start:prod / NODE_ENV=production / SYNC_GOOGLE=prod).

set -eo pipefail

if [ "${SYNC_GOOGLE:-}" = "prod" ] || [ "${NODE_ENV:-}" = "production" ]; then
  echo "[prestart] Skipping dev google-services sync (production mode)."
  exit 0
fi

bash ./scripts/sync-google-services.sh dev
