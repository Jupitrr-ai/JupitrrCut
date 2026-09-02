#!/usr/bin/env bash
# Rewrite the Google Sign-In URL scheme in a LOCAL ios/ Info.plist so it matches the
# GoogleService-Info.plist for the environment you are building.
#
# Scope: this matters for local builds only (`expo run:ios`, Xcode), where ios/ is
# checked in and `expo prebuild` is not re-run, so the
# @react-native-google-signin config plugin never re-injects CFBundleURLSchemes from
# REVERSED_CLIENT_ID and the scheme stays frozen at whatever was last committed.
#
# On EAS this is a no-op: .easignore excludes /ios/ from the uploaded archive, so the
# builder prebuilds a fresh native project and the plugin injects the scheme from
# EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME. There is no Info.plist to patch at pre-install
# time, and a missing one is therefore a SKIP, never an error — failing here would
# fail every EAS build.
#
# Usage:
#   bash scripts/sync-ios-url-scheme.sh [path/to/GoogleService-Info.plist]

set -eo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GOOGLE_PLIST="${1:-./ios/JupitrrCut/GoogleService-Info.plist}"
INFO_PLIST="./ios/JupitrrCut/Info.plist"

if [ ! -f "$GOOGLE_PLIST" ]; then
  echo "[sync-ios-url-scheme] ERROR: $GOOGLE_PLIST not found."
  echo "[sync-ios-url-scheme] Run scripts/sync-google-services.sh <dev|prod> first."
  exit 1
fi

if [ ! -f "$INFO_PLIST" ]; then
  # Expected on EAS (see header): prebuild generates ios/ later and the google-signin
  # plugin injects the scheme itself. Nothing to patch, and nothing is wrong.
  echo "[sync-ios-url-scheme] No $INFO_PLIST — skipping (prebuild will inject the scheme)."
  exit 0
fi

GOOGLE_PLIST="$GOOGLE_PLIST" INFO_PLIST="$INFO_PLIST" python3 << 'PY'
import os
import plistlib
import re
import sys

google_plist = os.environ["GOOGLE_PLIST"]
info_plist = os.environ["INFO_PLIST"]

with open(google_plist, "rb") as handle:
    scheme = plistlib.load(handle).get("REVERSED_CLIENT_ID")

if not scheme:
    sys.exit(f"[sync-ios-url-scheme] ERROR: no REVERSED_CLIENT_ID in {google_plist}")

with open(info_plist, encoding="utf-8") as handle:
    original = handle.read()

# Targeted substitution keeps the hand-maintained Info.plist formatting intact;
# plistlib round-tripping would reindent the whole file on every build.
pattern = r"com\.googleusercontent\.apps\.[A-Za-z0-9._-]+"
current = re.findall(pattern, original)

if not current:
    sys.exit(
        f"[sync-ios-url-scheme] ERROR: no Google URL scheme in {info_plist}. "
        "Add a CFBundleURLTypes entry with a com.googleusercontent.apps.* scheme."
    )

if all(value == scheme for value in current):
    print(f"[sync-ios-url-scheme] Already in sync: {scheme}")
    sys.exit(0)

with open(info_plist, "w", encoding="utf-8") as handle:
    handle.write(re.sub(pattern, scheme, original))

print(f"[sync-ios-url-scheme] {current[0]} → {scheme}")
PY
