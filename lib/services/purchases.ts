import {
  RC_ANDROID_API_KEY,
  RC_ENTITLEMENT_ID,
  RC_IOS_API_KEY,
  RC_OFFERING_ID,
  RC_TEST_STORE_API_KEY,
  RC_USE_TEST_STORE,
} from '@lib/constants/revenuecat';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';

export { PurchasesPackage, PurchasesOffering };

/** The active store's API key — Test Store when toggled on, else the real per-platform key. */
function getActiveApiKey(): string {
  if (RC_USE_TEST_STORE) return RC_TEST_STORE_API_KEY;
  return Platform.OS === 'ios' ? RC_IOS_API_KEY : RC_ANDROID_API_KEY;
}

export function isPurchasesConfigured(): boolean {
  return Boolean(getActiveApiKey());
}

/** Call once at app startup (before any UI that needs entitlement). */
export function configurePurchases(): void {
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  if (!isPurchasesConfigured()) {
    if (__DEV__) console.warn('[Purchases] No API key configured — RevenueCat will not function.');
    return;
  }
  if (__DEV__ && RC_USE_TEST_STORE) {
    console.warn('[Purchases] Using RevenueCat Test Store, not real StoreKit.');
  }
  Purchases.configure({ apiKey: getActiveApiKey() });

  /* Warm the offerings cache. The paywalls no longer mount until the user asks for them, so
     without this the first one opens on a spinner while StoreKit is queried. */
  void getOffering();
}

/**
 * Refresh offerings before resolving a paywall so recent RevenueCat dashboard changes are
 * visible immediately. If the refresh fails offline, fall back to RevenueCat's normal cache.
 * An explicit or app-wide id must resolve exactly; only the absence of an id uses the current
 * offering, preventing a missing downsell from silently purchasing a primary product.
 */
export async function getOffering(
  offeringId: string | null = null
): Promise<PurchasesOffering | null> {
  if (!isPurchasesConfigured()) {
    return null;
  }
  try {
    const offerings = await Purchases.syncAttributesAndOfferingsIfNeeded().catch(() =>
      Purchases.getOfferings()
    );
    const id = offeringId ?? RC_OFFERING_ID;
    if (id) {
      return offerings.all[id] ?? null;
    }
    return offerings.current;
  } catch (err) {
    if (__DEV__) console.error('[Purchases] getOffering error', err);
    return null;
  }
}

/** Purchase a specific package. Throws on cancellation or error. */
export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

/** Restore purchases and return updated CustomerInfo. */
export async function restorePurchases(): Promise<CustomerInfo> {
  return await Purchases.restorePurchases();
}

/** Fetch the latest store customer record. `null` means the SDK is unavailable in this build. */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isPurchasesConfigured()) return null;
  return await Purchases.getCustomerInfo();
}

/** Open the platform's native subscription-management UI. */
export async function showManageSubscriptions(): Promise<void> {
  await Purchases.showManageSubscriptions();
}

/**
 * `unknown` is distinct from `inactive` on purpose: RevenueCat being unreachable (or
 * unconfigured, as in a dev build with no API key) is not evidence that the user has not
 * paid. Anything gating a feature must treat `unknown` as allowed — see `useFreemiumGate`.
 */
export type EntitlementStatus = 'active' | 'inactive' | 'unknown';

export async function getEntitlementStatus(): Promise<EntitlementStatus> {
  if (!isPurchasesConfigured()) {
    return 'unknown';
  }
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[RC_ENTITLEMENT_ID] ? 'active' : 'inactive';
  } catch {
    return 'unknown';
  }
}

export function getActivePremiumEntitlement(
  info: CustomerInfo | null
): PurchasesEntitlementInfo | null {
  return info?.entitlements.active[RC_ENTITLEMENT_ID] ?? null;
}

/**
 * Returns true only when the premium entitlement is known-active. Use for decisions where
 * "unsure" should behave like "not entitled" (e.g. skipping onboarding). For gating a
 * feature the user may have paid for, use `getEntitlementStatus` and fail open instead.
 */
export async function checkEntitlement(): Promise<boolean> {
  return (await getEntitlementStatus()) === 'active';
}

/**
 * Entitlement check with no throw on failure — see `getEntitlementStatus`'s doc for why
 * `unknown` deliberately behaves like "not entitled" here.
 */
export async function checkCombinedEntitlement(): Promise<boolean> {
  return (await getCombinedEntitlementStatus()) === 'active';
}

/**
 * The app's entitlement truth. This OSS build has no Jupitrr account/org billing to merge
 * in, so this is currently a thin alias for `getEntitlementStatus` (RevenueCat only) — kept
 * as a separate export so call sites don't need to change if that ever grows back a second
 * source.
 */
export async function getCombinedEntitlementStatus(): Promise<EntitlementStatus> {
  return getEntitlementStatus();
}
