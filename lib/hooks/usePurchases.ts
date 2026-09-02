import { type PlanKey } from '@lib/constants/revenuecat';
import { trackEvent } from '@lib/services/analytics';
import {
  getActivePremiumEntitlement,
  getOffering,
  purchasePackage as doPurchase,
  restorePurchases as doRestore,
} from '@lib/services/purchases';
import { useEffect, useState, useCallback } from 'react';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { PACKAGE_TYPE } from 'react-native-purchases';

export type { PlanKey };

export interface PurchaseSuccess {
  method: 'purchase' | 'restore';
  plan?: PlanKey;
  periodType: 'trial' | 'intro' | 'normal' | 'prepaid';
  expirationDate: string | null;
  willRenew: boolean;
  productIdentifier: string;
}

export interface UsePurchasesResult {
  offering: PurchasesOffering | null;
  loadingOffering: boolean;
  purchasing: boolean;
  error: string | null;
  annualPackage: PurchasesPackage | null;
  weeklyPackage: PurchasesPackage | null;
  purchase: (plan: PlanKey) => Promise<PurchaseSuccess | null>;
  restore: () => Promise<PurchaseSuccess | null>;
}

/**
 * Loads a RevenueCat offering and exposes purchase / restore actions.
 * Returns purchase details only when the premium entitlement is active.
 *
 * `offeringId` comes from `PAYWALL_STEPS`, so which products a paywall sells is dashboard
 * configuration rather than something a component decides. `null` uses the default offering.
 */
export function usePurchases(
  offeringId: string | null = null,
  weeklyProductIdentifiers?: readonly string[]
): UsePurchasesResult {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [loadingOffering, setLoadingOffering] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /* Reset while switching offerings so the previous step's prices can't flash in the new one. */
    setLoadingOffering(true);
    setOffering(null);
    getOffering(offeringId).then((o) => {
      if (!cancelled) {
        setOffering(o);
        setLoadingOffering(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [offeringId]);

  const annualPackage =
    offering?.availablePackages.find((p) => p.packageType === PACKAGE_TYPE.ANNUAL) ?? null;

  const weeklyPackage =
    offering?.availablePackages.find((p) =>
      weeklyProductIdentifiers
        ? weeklyProductIdentifiers.includes(p.product.identifier)
        : p.packageType === PACKAGE_TYPE.WEEKLY
    ) ?? null;

  const purchase = useCallback(
    async (plan: PlanKey): Promise<PurchaseSuccess | null> => {
      const pkg = plan === 'annual' ? annualPackage : weeklyPackage;
      if (!pkg) {
        setError('Product not available. Please try again later.');
        return null;
      }
      setPurchasing(true);
      setError(null);
      trackEvent('purchase_started', { plan });
      try {
        const info = await doPurchase(pkg);
        const entitlement = getActivePremiumEntitlement(info);
        if (!entitlement) {
          setError('Your purchase completed, but Premium is not active yet. Try Restore.');
          trackEvent('purchase_not_entitled', { plan });
          return null;
        }
        const periodType = entitlement.periodType.toLowerCase() as PurchaseSuccess['periodType'];
        if (periodType === 'trial') {
          trackEvent('trial_started', { plan });
        } else {
          trackEvent('purchase_completed', { plan });
        }
        return {
          method: 'purchase',
          plan,
          periodType,
          expirationDate: entitlement.expirationDate,
          willRenew: entitlement.willRenew,
          productIdentifier: entitlement.productIdentifier,
        };
      } catch (err: unknown) {
        // RevenueCat errors have a typed `userCancelled` flag — use it instead
        // of fragile string matching so it works identically on iOS and Android.
        if (
          err !== null &&
          typeof err === 'object' &&
          'userCancelled' in err &&
          err.userCancelled === true
        ) {
          return null;
        }
        const msg = err instanceof Error ? err.message : 'Purchase failed';
        setError(msg);
        trackEvent('purchase_failed', { reason: msg });
        return null;
      } finally {
        setPurchasing(false);
      }
    },
    [annualPackage, weeklyPackage]
  );

  const restore = useCallback(async (): Promise<PurchaseSuccess | null> => {
    setPurchasing(true);
    setError(null);
    trackEvent('restore_tapped');
    try {
      const info = await doRestore();
      const entitlement = getActivePremiumEntitlement(info);
      if (!entitlement) {
        setError('No active subscription was found to restore.');
        trackEvent('subscription_restore_empty');
        return null;
      }
      const periodType = entitlement.periodType.toLowerCase() as PurchaseSuccess['periodType'];
      trackEvent('subscription_restored', { periodType });
      return {
        method: 'restore',
        periodType,
        expirationDate: entitlement.expirationDate,
        willRenew: entitlement.willRenew,
        productIdentifier: entitlement.productIdentifier,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Restore failed';
      setError(msg);
      trackEvent('subscription_restore_failed');
      return null;
    } finally {
      setPurchasing(false);
    }
  }, []);

  return {
    offering,
    loadingOffering,
    purchasing,
    error,
    annualPackage,
    weeklyPackage,
    purchase,
    restore,
  };
}
