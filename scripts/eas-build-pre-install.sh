#!/usr/bin/env bash
# Runs on EAS builders before `bun install`. Materializes Firebase plist + JSON
# from file env vars, then validates native config and injected EXPO_PUBLIC_* vars.
#
# Prereqs (one-time per EAS environment):
#   eas env:create --environment production --name GOOGLE_SERVICE_INFO_PLIST \
#       --type file --value ./GoogleService-Info.prod.plist --visibility sensitive
#   eas env:create --environment production --name GOOGLE_SERVICES_JSON \
#       --type file --value ./config/firebase/google-services.prod.json --visibility secret
#   (Same pattern for development with .dev.plist / config/firebase/google-services.dev.json)

set -eo pipefail

case "${EAS_BUILD_ENVIRONMENT:-production}" in
  development) TARGET="dev" ;;
  preview | production) TARGET="prod" ;;
  *) TARGET="prod" ;;
esac

echo "[eas-build-pre-install] Profile=${EAS_BUILD_PROFILE:-<unset>} EAS env=${EAS_BUILD_ENVIRONMENT:-<unset>} → validate target=$TARGET"

PLIST_PATH="${GOOGLE_SERVICE_INFO_PLIST:-}"

if [ -z "$PLIST_PATH" ] || [ ! -f "$PLIST_PATH" ]; then
  echo "[eas-build-pre-install] ERROR: GOOGLE_SERVICE_INFO_PLIST env var is unset or points to a missing file."
  echo "[eas-build-pre-install] Create it with: eas env:create --environment <env> --name GOOGLE_SERVICE_INFO_PLIST --type file --value ./GoogleService-Info.<dev|prod>.plist"
  exit 1
fi

echo "[eas-build-pre-install] Materializing plist from $PLIST_PATH"
cp "$PLIST_PATH" "./GoogleService-Info.plist"
mkdir -p "./ios/JupitrrCut"
cp "$PLIST_PATH" "./ios/JupitrrCut/GoogleService-Info.plist"

# Normally a no-op here: .easignore strips /ios/ from the archive, so prebuild
# regenerates the native project and the google-signin plugin injects the scheme from
# EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME. Kept as a safety net for the day /ios/ is shipped
# to the builder; it skips cleanly when there is no Info.plist to patch.
bash ./scripts/sync-ios-url-scheme.sh "./ios/JupitrrCut/GoogleService-Info.plist"

JSON_PATH="${GOOGLE_SERVICES_JSON:-}"
ANDROID_PACKAGE="com.jupitrr.aiteleprompter"

if [ -z "$JSON_PATH" ] || [ ! -f "$JSON_PATH" ]; then
  echo "[eas-build-pre-install] ERROR: GOOGLE_SERVICES_JSON not set — Android Google Sign-In needs google-services.json"
  exit 1
fi

cp "$JSON_PATH" "./google-services.json"
echo "[eas-build-pre-install] Materialized google-services.json from $JSON_PATH"

ANDROID_PACKAGE="$ANDROID_PACKAGE" python3 << 'PY' || { echo "[eas-build-pre-install] ERROR: invalid google-services.json"; exit 1; }
import json, os, sys
pkg = os.environ.get("ANDROID_PACKAGE", "com.jupitrr.aiteleprompter")
with open("google-services.json") as f:
    data = json.load(f)
project_id = data.get("project_info", {}).get("project_id", "?")
oauth_hash = None
for client in data.get("client", []):
    if client.get("client_info", {}).get("android_client_info", {}).get("package_name") != pkg:
        continue
    for oc in client.get("oauth_client", []):
        if oc.get("client_type") == 1:
            oauth_hash = oc.get("android_info", {}).get("certificate_hash")
            break
print(f"[eas-build-pre-install] google-services project_id={project_id} android_oauth_hash={oauth_hash or 'MISSING'}")
if not oauth_hash:
    sys.exit(1)
PY

node ./scripts/validate-firebase-config.mjs "$TARGET" --env-from-process

echo "[eas-build-pre-install] Done"
