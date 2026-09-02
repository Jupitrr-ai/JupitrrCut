const { execSync } = require('child_process');

// Keep the public version synchronized across iOS and Android. EAS runs
// `expo prebuild` for Android (see eas.json prebuildCommand), so this value must
// also stay aligned with the committed native version files.
const IOS_VERSION = '2.0.8';
const ANDROID_VERSION = '2.0.7';

const version = process.env.EAS_BUILD_PLATFORM === 'android' ? ANDROID_VERSION : IOS_VERSION;

// Commit of the JS bundle being built/published. EAS sets the env var during
// cloud builds; locally and during `eas update` we read git directly. Surfaced
// in Settings (tap the version 3x) to identify exactly which build/OTA is live.
function resolveGitCommit() {
  const fromEnv = process.env.EAS_BUILD_GIT_COMMIT_HASH;
  if (fromEnv) return fromEnv.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

const gitCommit = resolveGitCommit();

const androidPackage = 'com.jupitrr.aiteleprompter.oss';

module.exports = {
  expo: {
    // Installed app / launcher display name for this OSS build. Do not rename the product —
    // it is "Jupitrr Cut" (with a space). This is a separate build (com.jupitrr.aiteleprompter.oss)
    // from the closed-source "JupitrrCut - Jump Cut Recorder" Play Store / App Store listing, so
    // it does not need to match that title.
    name: 'Jupitrr Cut',
    slug: 'teleprompter',
    version,
    orientation: 'default',
    icon: './assets/icon.png',
    scheme: 'teleprompter',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#2F2FD3',
    },
    ios: {
      supportsTablet: true,
      // Bump before every TestFlight/App Store upload. THIS is the value EAS ships:
      // .easignore excludes /ios/ from the archive, so the builder prebuilds from this
      // config. Keep ios/JupitrrCut/Info.plist and the Xcode project's
      // CURRENT_PROJECT_VERSION in sync anyway — they drive local Xcode builds.
      // 18 shipped the paywall/freemium release. 19 and 20 were cut from local
      // commits that were never pushed (19 synced the native project to 2.0.7,
      // 20 fixed the Google Sign-In URL scheme) — both are re-applied here, so 21
      // is the next free build number.
      // 21 was built but Apple refused it: the 2.0.7 pre-release train is closed
      // ("Invalid Pre-Release Train ... closed for new build submissions"), so the
      // marketing version had to move to 2.0.8. 22 keeps build numbers monotonic.
      buildNumber: '22',
      bundleIdentifier: 'com.jupitrr.aiteleprompter.oss',
      appleTeamId: 'T9QN2LCDVG',
      infoPlist: {
        // Info.plist overrides expo.name when ios/ is committed, so keep this in sync with
        // `expo.name` above ("Jupitrr Cut") rather than the closed-source app's listing title.
        CFBundleDisplayName: 'Jupitrr Cut',
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          '$(PRODUCT_NAME) uses your camera to record video while you read your teleprompter script. For example, when you record a clip for your project, the camera captures your on-screen performance so you can review, re-record, and export it.',
        NSMicrophoneUsageDescription:
          '$(PRODUCT_NAME) uses your microphone to capture audio while you record your teleprompter script. For example, when recording a clip, your voice is captured alongside the video so the final exported video includes clear audio of your narration.',
        NSPhotoLibraryUsageDescription:
          '$(PRODUCT_NAME) saves your exported and stitched videos to your photo library so you can share them from the Photos app. This covers both teleprompter recordings and videos you stitch together from your library.',
        NSPhotoLibraryAddUsageDescription:
          '$(PRODUCT_NAME) saves your exported teleprompter recordings and stitched videos to your photo library. For example, after you finish recording and exporting a project, the final video is added to Photos so you can share it from the Photos app.',
        UIBackgroundModes: ['audio', 'voip'],
      },
      runtimeVersion: IOS_VERSION,
    },
    android: {
      // Bump before every Play upload (must be higher than the last published versionCode).
      // 16 shipped from an unmerged branch (fb74497); 17 by the 1.0.6 build;
      // 18 by the 2.0.4 build that shipped the non-scrolling PiP. 19 clears all.
      // 20 ships the ui-foundations merge with the OTA export dependency fix.
      // 21 synchronizes the iOS and Android public version at 2.0.6.
      // 22 ships the paywall/freemium release, matching iOS 2.0.7 (build 18).
      // 23 fixes the missing EXPO_PUBLIC_RC_ANDROID_API_KEY from the 22 build (RevenueCat
      // couldn't initialize on Android, so the freemium gate failed open). Never went live —
      // its bundle upload got tangled in a stuck release draft alongside 22 and was discarded
      // before publishing; Play still reserves the version code, so it can't be reused.
      // 24 is the same build as 23, just re-cut under a fresh version code.
      versionCode: 24,
      permissions: ['com.android.vending.BILLING'],
      // Launcher label comes from top-level `name` → strings.xml app_name.
      // Play Store policy compares that label + adaptive icon to the listing.
      icon: './assets/icon.png',
      adaptiveIcon: {
        // Padded to 66% safe zone so circle/squircle masks match the Play listing icon.
        // (Full-bleed foreground gets cropped on device and looks nothing like the store graphic.)
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#2F2FD3',
      },
      package: androidPackage,
      runtimeVersion: ANDROID_VERSION,
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: './assets/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-localization',
      // Caps the splash logo at a fixed width — the classic `splash` config
      // scales the 1024px image to fill the screen, which reads oversized.
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 160,
          resizeMode: 'contain',
          backgroundColor: '#2F2FD3',
        },
      ],
      // Sentry v7 ships the Expo config plugin at the root entry, not `/expo`.
      // (v8 used '@sentry/react-native/expo'; we're on v7 per SDK 54 alignment.)
      [
        '@sentry/react-native',
        {
          url: 'https://sentry.io/',
          project: 'react-native',
          organization: 'jupitrr',
        },
      ],
      [
        'expo-video',
        {
          supportsPictureInPicture: true,
          supportsBackgroundPlayback: true,
        },
      ],
      'expo-mail-composer',
      // react-native-purchases links natively via CocoaPods/Gradle automatically.
      // No Expo config plugin needed — BILLING permission is declared directly
      // in AndroidManifest.xml.
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '99f1fc1e-d527-4780-8663-3737ffa0397c',
      },
      gitCommit,
    },
    owner: 'jupitrr',
    updates: {
      url: 'https://u.expo.dev/99f1fc1e-d527-4780-8663-3737ffa0397c',
    },
  },
};
