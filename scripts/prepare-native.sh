#!/usr/bin/env bash
# Sync Firebase native files, validate alignment, optionally run expo prebuild.
#
# Usage:
#   bash scripts/prepare-native.sh dev
#   bash scripts/prepare-native.sh prod
#   bash scripts/prepare-native.sh prod --prebuild
#   bash scripts/prepare-native.sh prod --prebuild --platform ios

set -eo pipefail

TARGET="${1:-dev}"
PREBUILD=false
PLATFORM="all"

shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    --prebuild) PREBUILD=true ;;
    --platform)
      shift
      PLATFORM="${1:-all}"
      ;;
    *)
      echo "[prepare-native] Unknown arg: $1"
      exit 1
      ;;
  esac
  shift || true
done

if [ "$TARGET" != "dev" ] && [ "$TARGET" != "prod" ]; then
  echo "[prepare-native] TARGET must be dev or prod"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[prepare-native] Syncing Firebase files for: $TARGET"
bash ./scripts/sync-google-services.sh "$TARGET"

echo "[prepare-native] Syncing iOS Google Sign-In URL scheme"
bash ./scripts/sync-ios-url-scheme.sh

echo "[prepare-native] Validating plist + json + env"
node ./scripts/validate-firebase-config.mjs "$TARGET"

if [ "$PREBUILD" = true ]; then
  echo "[prepare-native] Running expo prebuild (platform=$PLATFORM)"
  bunx expo prebuild --no-install -p "$PLATFORM"
  if [ -f "./android/app/google-services.json" ] && [ -f "./config/firebase/google-services.${TARGET}.json" ]; then
    cp "./config/firebase/google-services.${TARGET}.json" "./android/app/google-services.json"
    echo "[prepare-native] Re-synced android/app/google-services.json after prebuild"
  fi
fi

echo "[prepare-native] Done ($TARGET)"
