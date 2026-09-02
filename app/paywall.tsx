import { PaywallFunnel } from '@features/onboarding/components/PaywallFunnel';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

/**
 * The funnel replayed outside onboarding, opened by `useFreemiumGate` when a locked feature
 * is re-entered. Purchasing and declining both just close it: the gate re-reads the
 * entitlement when the screen underneath regains focus, so this route never has to tell the
 * caller what happened.
 */
export default function PaywallScreen() {
  const { offer } = useLocalSearchParams<{ offer?: string }>();
  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(main)');
    }
  }, []);

  return (
    <PaywallFunnel
      source="gate"
      initialStep={offer === 'limited' ? 'downsell' : 'primary'}
      onPurchased={close}
      onDismissed={close}
    />
  );
}
