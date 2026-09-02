#!/usr/bin/env bash
# Copies Firebase config for the chosen environment (dev | prod).
# Default target = dev. Override with: bash scripts/sync-google-services.sh prod
#
# Expects at repo root (gitignored):
#   GoogleService-Info.dev.plist / GoogleService-Info.prod.plist
# Expects under config/firebase/ (gitignored):
#   google-services.dev.json / google-services.prod.json  (Android)

set -eo pipefail

TARGET="${1:-dev}"
PLIST_SRC="GoogleService-Info.${TARGET}.plist"
JSON_SRC="config/firebase/google-services.${TARGET}.json"

if [ ! -f "$PLIST_SRC" ]; then
  echo "[sync-google-services] ERROR: $PLIST_SRC not found at repo root."
  exit 1
fi

cp "$PLIST_SRC" "./GoogleService-Info.plist"
mkdir -p "./ios/JupitrrCut"
cp "$PLIST_SRC" "./ios/JupitrrCut/GoogleService-Info.plist"
echo "[sync-google-services] Synced $PLIST_SRC → root + ios/JupitrrCut/"

if [ -f "$JSON_SRC" ]; then
  cp "$JSON_SRC" "./google-services.json"
  if [ -d "./android/app" ]; then
    cp "$JSON_SRC" "./android/app/google-services.json"
    echo "[sync-google-services] Synced $JSON_SRC → root + android/app/"
  else
    echo "[sync-google-services] Synced $JSON_SRC → root (android/ not generated yet; run prebuild or EAS build)"
  fi
else
  echo "[sync-google-services] WARN: $JSON_SRC not found — Android Google Sign-In needs this file from Firebase Console."
fi
