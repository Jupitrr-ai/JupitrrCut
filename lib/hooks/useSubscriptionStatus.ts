import { RC_ENTITLEMENT_ID, type PlanKey } from '@lib/constants/revenuecat';
import { getCustomerInfo, getOffering } from '@lib/services/purchases';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { PACKAGE_TYPE } from 'react-native-purchases';

export interface NativeSubscriptionStatus {
  plan?: PlanKey;
  periodType: 'trial' | 'intro' | 'normal' | 'prepaid';
  expirationDate: string | null;
  willRenew: boolean;
  managementURL: string | null;
  productIdentifier: string;
}

export interface SubscriptionStatus {
  state: 'loading' | 'active' | 'inactive' | 'unknown';
  native: NativeSubscriptionStatus | null;
}

export interface UseSubscriptionStatusResult extends SubscriptionStatus {
  refreshing: boolean;
  refresh: () => Promise<void>;
}

/** Refreshes on focus because users can change or cancel a subscription in the native store
 * sheet and then return to this screen without remounting it. */
export function useSubscriptionStatus(): UseSubscriptionStatusResult {
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState<SubscriptionStatus>({
    state: 'loading',
    native: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setStatus((current) => ({ ...current, state: 'loading' }));
    setRefreshing(true);

    const [customerResult, offeringResult] = await Promise.allSettled([
      getCustomerInfo(),
      getOffering(),
    ]);
    if (requestId !== requestIdRef.current) return;

    const customerInfo = customerResult.status === 'fulfilled' ? customerResult.value : null;
    const entitlement = customerInfo?.entitlements.active[RC_ENTITLEMENT_ID] ?? null;
    const offering = offeringResult.status === 'fulfilled' ? offeringResult.value : null;
    const matchingPackage = offering?.availablePackages.find(
      (pkg) => pkg.product.identifier === entitlement?.productIdentifier
    );
    const plan: PlanKey | undefined =
      matchingPackage?.packageType === PACKAGE_TYPE.ANNUAL
        ? 'annual'
        : matchingPackage?.packageType === PACKAGE_TYPE.WEEKLY
          ? 'weekly'
          : undefined;

    const native: NativeSubscriptionStatus | null = entitlement
      ? {
          plan,
          periodType:
            entitlement.periodType.toLowerCase() as NativeSubscriptionStatus['periodType'],
          expirationDate: entitlement.expirationDate,
          willRenew: entitlement.willRenew,
          managementURL: customerInfo?.managementURL ?? null,
          productIdentifier: entitlement.productIdentifier,
        }
      : null;

    const nativeUnknown = customerResult.status === 'rejected' || customerInfo === null;
    const state: SubscriptionStatus['state'] = native ? 'active' : nativeUnknown ? 'unknown' : 'inactive';

    setStatus({ state, native });
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      let previousState = AppState.currentState;
      const appStateSubscription = AppState.addEventListener('change', (nextState) => {
        if (previousState.match(/inactive|background/) && nextState === 'active') {
          void refresh();
        }
        previousState = nextState;
      });
      return () => {
        appStateSubscription.remove();
        requestIdRef.current += 1;
      };
    }, [refresh])
  );

  return { ...status, refreshing, refresh };
}
