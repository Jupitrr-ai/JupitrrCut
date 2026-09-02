#!/usr/bin/env bash
# Prints SHA-1 fingerprints to add in Firebase Console for Google Sign-In.
# Firebase → jpt-prod → Project settings → Your apps → Android (com.jupitrr.aiteleprompter)

set -eo pipefail

echo "=== Debug keystore (local: npx expo run:android) ==="
DEBUG_KEYSTORE="${HOME}/.android/debug.keystore"
if [ -f "$DEBUG_KEYSTORE" ]; then
  keytool -list -v -keystore "$DEBUG_KEYSTORE" -alias androiddebugkey \
    -storepass android -keypass android 2>/dev/null | grep -E 'SHA1:|SHA256:'
else
  echo "No ~/.android/debug.keystore yet — run 'npx expo run:android' once to create it, then re-run this script."
fi

echo ""
echo "=== Gradle signingReport (if android/ exists) ==="
if [ -f "./android/gradlew" ]; then
  (cd android && ./gradlew signingReport 2>/dev/null | grep -E 'SHA1:|Variant:' || true)
else
  echo "No android/ folder — use EAS credentials below or run: npx expo prebuild"
fi

echo ""
echo "=== EAS build keystore (dev client / production AAB) ==="
echo "Run: eas credentials -p android"
echo "Copy the SHA-1 fingerprint(s) shown for your build profile keystore."
echo ""
echo "Add every SHA-1 above to Firebase → com.jupitrr.aiteleprompter → SHA certificate fingerprints."
echo "Then re-download google-services.json, replace repo root file, and rebuild the native app."
