import { ANDROID_PACKAGE_NAME } from '@lib/constants/jupitrr';
import type { SettingsRepository } from '@lib/repositories/types';
import { trackEvent } from '@lib/services/analytics';
import * as Linking from 'expo-linking';
import * as StoreReview from 'expo-store-review';
import { Platform } from 'react-native';

/**
 * How the user has responded to the App Store review ask. 'declined' is the only status that
 * gets asked again — once, at their first completed export, since Apple's dialog gives no
 * signal of an actual rating either way and its own yearly quota is too precious to spend
 * twice on someone who hasn't finished a video yet.
 */
export type AppReviewStatus = 'unasked' | 'prompted' | 'declined';

const SETTINGS_KEY_APP_REVIEW_STATUS = 'appReview.status';

export function getAppReviewStatus(settingsRepo: SettingsRepository): AppReviewStatus {
  return settingsRepo.get<AppReviewStatus>(SETTINGS_KEY_APP_REVIEW_STATUS, 'unasked');
}

export function markAppReviewPrompted(settingsRepo: SettingsRepository): void {
  settingsRepo.set<AppReviewStatus>(SETTINGS_KEY_APP_REVIEW_STATUS, 'prompted');
}

export function markAppReviewDeclined(settingsRepo: SettingsRepository): void {
  settingsRepo.set<AppReviewStatus>(SETTINGS_KEY_APP_REVIEW_STATUS, 'declined');
}

/**
 * Fires the native App Store prompt. iOS silently ignores it when its own quota is spent,
 * so callers must treat it as fire-and-forget and never gate navigation on the result.
 *
 * Android's in-app review (Google Play's In-App Review API) reports unavailable for
 * sideloaded/dev builds and silently no-ops once its own daily quota is spent, with no
 * signal either way — so on Android we fall back to opening the Play Store listing directly
 * rather than leaving the button doing nothing.
 */
export async function requestStoreReview(source: 'onboarding' | 'post_export'): Promise<void> {
  try {
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      trackEvent('app_review_prompted', { source });
      return;
    }
    if (Platform.OS === 'android') {
      const url = `market://details?id=${ANDROID_PACKAGE_NAME}`;
      const canOpen = await Linking.canOpenURL(url).catch(() => false);
      await Linking.openURL(
        canOpen ? url : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`
      );
      trackEvent('app_review_prompted', { source });
    }
  } catch {
    /* A refused prompt must never block the flow it was fired from. */
  }
}
