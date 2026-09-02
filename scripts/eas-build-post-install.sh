#!/usr/bin/env bash
# EAS: committed ios/ skips managed prebuild, so android/ must be created here.
# Runs after `bun install`. Do not gate on EAS_BUILD_PLATFORM — it can be unset in hooks.

set -eo pipefail

if [ "${EAS_BUILD:-}" != "true" ]; then
  exit 0
fi

if [ "${EAS_BUILD_PLATFORM:-}" = "ios" ]; then
  echo "[eas-build-post-install] iOS build — skip android prebuild"
  exit 0
fi

if [ -d android ] && [ ! -f android/gradlew ]; then
  echo "[eas-build-post-install] Removing incomplete android/ (no gradlew)"
  rm -rf android
fi

if [ ! -f android/gradlew ]; then
  echo "[eas-build-post-install] Generating android/ (platform=${EAS_BUILD_PLATFORM:-unset})"
  bunx expo prebuild --platform android --no-install
fi

if [ ! -f android/gradlew ]; then
  echo "[eas-build-post-install] ERROR: android/gradlew still missing after prebuild"
  exit 1
fi

if [ -f google-services.json ] && [ -d android/app ]; then
  cp google-services.json android/app/google-services.json
  echo "[eas-build-post-install] Synced google-services.json → android/app/"
fi

echo "[eas-build-post-install] android/gradlew OK"
