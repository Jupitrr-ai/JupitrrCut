import type { PurchasesStoreProduct } from 'react-native-purchases';

/**
 * Formatting for figures that belong to the store, not to us.
 *
 * Prices and introductory offers are App Store Connect / RevenueCat configuration. Every
 * number shown to the user has to come off the live product, or the app starts advertising a
 * price it does not charge the moment pricing, currency or the trial length changes. These
 * helpers all return `null` when the store cannot answer, so callers fall back to an i18n
 * string rather than to a stale hardcoded figure.
 */

const DAYS_PER_UNIT: Record<string, number> = {
  DAY: 1,
  WEEK: 7,
  MONTH: 30,
  YEAR: 365,
};

/**
 * Length of the product's *free* introductory offer in days, or null if it has none.
 *
 * A paid intro ("first week 50% off") is deliberately not reported: the funnel copy only ever
 * promises a free trial, so a discounted intro must not be dressed up as one.
 */
export function getFreeTrialDays(product: PurchasesStoreProduct | undefined | null): number | null {
  const intro = product?.introPrice;
  if (!intro || intro.price !== 0) return null;
  const perUnit = DAYS_PER_UNIT[intro.periodUnit.toUpperCase()];
  if (!perUnit) return null;
  const days = perUnit * intro.periodNumberOfUnits * Math.max(1, intro.cycles);
  return days > 0 ? days : null;
}

/**
 * The product's price restated over a shorter period — an annual price shown per week, say —
 * in the product's own currency. Returns null when there is no live product to divide.
 */
export function formatDividedPrice(
  product: PurchasesStoreProduct | undefined | null,
  periods: number
): string | null {
  if (!product?.price || periods <= 0) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: product.currencyCode,
    }).format(product.price / periods);
  } catch {
    return null;
  }
}

/**
 * The product's price restated as zero, in its own currency — for a "$0 due today" CTA on a
 * free trial. Returns null when there is no live product to read the currency from, so the
 * button falls back to a currency-agnostic label instead of guessing a symbol.
 */
export function formatZeroPrice(product: PurchasesStoreProduct | undefined | null): string | null {
  if (!product) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: product.currencyCode,
    }).format(0);
  } catch {
    return null;
  }
}

/**
 * How much cheaper the annual product is than paying the weekly product's rate for a year,
 * as a whole-number percent. Needs both live products — a percent derived from only one of
 * them (or a hardcoded guess) can't be trusted to still be true after either price changes.
 */
export function getAnnualSavingsPercent(
  weeklyProduct: PurchasesStoreProduct | undefined | null,
  annualProduct: PurchasesStoreProduct | undefined | null
): number | null {
  if (!weeklyProduct?.price || !annualProduct?.price) return null;
  const yearlyAtWeeklyRate = weeklyProduct.price * 52;
  if (yearlyAtWeeklyRate <= 0) return null;
  const savings = 1 - annualProduct.price / yearlyAtWeeklyRate;
  if (savings <= 0) return null;
  /* Floored to the nearest 10, not rounded — a marketing figure must never overstate the real
     discount, and "60% off" reads more credible as a round number than an oddly specific 61%
     that will drift by a point the next time either price changes. */
  return Math.floor(savings * 10) * 10;
}
