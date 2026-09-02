/**
 * RevenueCat configuration.
 *
 * Set the API keys in your .env.development / .env.production files:
 *   EXPO_PUBLIC_RC_IOS_API_KEY=appl_xxxx
 *   EXPO_PUBLIC_RC_ANDROID_API_KEY=goog_xxxx
 *
 * Entitlement ID and product identifiers must match what you configure in:
 *   - App Store Connect (StoreKit products)
 *   - RevenueCat dashboard (products → offerings)
 *
 * To test against RevenueCat's Test Store instead of real App Store Connect/StoreKit — useful
 * since real products can't be validated until they exist in App Store Connect — set:
 *   EXPO_PUBLIC_RC_USE_TEST_STORE=true
 *   EXPO_PUBLIC_RC_TEST_STORE_API_KEY=test_xxxx
 * The Test Store key comes from a separate "App" entry in the RevenueCat dashboard, distinct
 * from the appl_/goog_ keys — attaching a product to an offering in the dashboard alone does
 * not route the SDK through it.
 */

export const RC_IOS_API_KEY = process.env.EXPO_PUBLIC_RC_IOS_API_KEY ?? '';
export const RC_ANDROID_API_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY ?? '';
export const RC_TEST_STORE_API_KEY = process.env.EXPO_PUBLIC_RC_TEST_STORE_API_KEY ?? '';
export const RC_USE_TEST_STORE = process.env.EXPO_PUBLIC_RC_USE_TEST_STORE === 'true';

/** Entitlement identifier — must exactly match RevenueCat, including spaces and casing. */
export const RC_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ID?.trim() || 'JupitrrCut - Jump Cut Recorder Pro';

/**
 * Offering identifier — the offering to load from RevenueCat.
 * Use `null` to load the current (default) offering.
 */
export const RC_OFFERING_ID: string | null = null;

/** Which package a paywall sells. Resolved against the offering by `PACKAGE_TYPE`. */
export type PlanKey = 'annual' | 'weekly';

/** The two rungs of the funnel: full offer first, single-product downsell on dismiss. */
export type PaywallStep = 'primary' | 'downsell';

export interface PaywallStepConfig {
  /** Offering to load. `null` falls back to `RC_OFFERING_ID`, then to RevenueCat's current. */
  offeringId: string | null;
  /** Which package the step buys. `primary` lets the user switch; `downsell` does not. */
  plan: PlanKey;
  /** Optional exact weekly product IDs accepted for this step, across real and Test Store. */
  weeklyProductIdentifiers?: readonly string[];
}

const DOWNSELL_WEEKLY_PRODUCT_IDENTIFIERS = [
  'com.jupitrr.aiteleprompter.subscription.weekly.trial',
  'weekly_trial',
  // Android: RevenueCat identifies Play subscriptions as `<productId>:<basePlanId>`.
  'jupitrr_plus_weekly:weekly-trial',
] as const;

/**
 * Single source of truth for what each paywall shows. Prices and free trials are *not* here —
 * those are App Store Connect / RevenueCat configuration that the app reads off the product.
 *
 * The downsell uses its dedicated offering and accepts only the weekly-trial product. Keeping
 * both identifiers here supports the real App Store product and its RevenueCat Test Store
 * counterpart without allowing a missing offering to purchase the default non-trial weekly.
 */
export const PAYWALL_STEPS: Record<PaywallStep, PaywallStepConfig> = {
  primary: { offeringId: null, plan: 'annual' },
  downsell: {
    offeringId: 'downsell',
    plan: 'weekly',
    weeklyProductIdentifiers: DOWNSELL_WEEKLY_PRODUCT_IDENTIFIERS,
  },
};

/** How long each paywall must be on screen before its dismiss control arms. */
export const PAYWALL_DISMISS_HOLD_SECONDS = 10;
