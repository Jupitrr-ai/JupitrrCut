import { PAYWALL_STEPS, type PaywallStep } from '@lib/constants/revenuecat';
import { type PurchaseSuccess, usePurchases } from '@lib/hooks/usePurchases';
import { useSettingsRepository } from '@lib/providers/DatabaseProvider';
import { trackEvent } from '@lib/services/analytics';
import {
  hasLimitedOfferExpired,
  isLimitedOfferActive,
  startLimitedOffer,
} from '@lib/services/freemium';
import { getCombinedEntitlementStatus } from '@lib/services/purchases';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { JUPITRR } from '../tokens';

import { Paywall } from './Paywall';
import { PaywallDownsell } from './PaywallDownsell';
import { PurchaseSuccess as PurchaseSuccessScreen } from './PurchaseSuccess';

interface Props {
  /** Where the funnel was opened from — onboarding's tail, or a blocked feature. */
  source: 'onboarding' | 'gate';
  /** The entitlement is now active (purchased or restored). */
  onPurchased: () => void;
  /** Both offers were declined. The caller decides what a declined user may still do. */
  onDismissed: () => void;
  /** Projects promo may reopen the still-active limited offer directly. */
  initialStep?: PaywallStep;
}

/**
 * The monetization funnel:
 *
 *   primary offer ──purchase/restore──▶ onPurchased
 *        └──dismiss (after hold)──▶ downsell ──purchase/restore──▶ onPurchased
 *                                      │
 *                                      └──dismiss (after hold)──▶ onDismissed
 *
 * `step` also selects the offering, so each rung can sell a different set of products
 * without any screen knowing an offering id.
 */
export function PaywallFunnel({ source, onPurchased, onDismissed, initialStep }: Props) {
  const [entitlementChecked, setEntitlementChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCombinedEntitlementStatus().then((status) => {
      if (cancelled) return;
      if (status !== 'inactive') {
        onPurchased();
        return;
      }
      setEntitlementChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [onPurchased]);

  if (!entitlementChecked) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={JUPITRR.primary} />
      </View>
    );
  }

  return (
    <PaywallFunnelContent
      source={source}
      onPurchased={onPurchased}
      onDismissed={onDismissed}
      initialStep={initialStep}
    />
  );
}

function PaywallFunnelContent({ source, onPurchased, onDismissed, initialStep }: Props) {
  const settingsRepo = useSettingsRepository();
  const [step, setStep] = useState<PaywallStep>(() =>
    initialStep === 'downsell' && isLimitedOfferActive(settingsRepo) ? 'downsell' : 'primary'
  );
  const [success, setSuccess] = useState<PurchaseSuccess | null>(null);

  const purchases = usePurchases(
    PAYWALL_STEPS[step].offeringId,
    PAYWALL_STEPS[step].weeklyProductIdentifiers
  );

  useEffect(() => {
    trackEvent('paywall_funnel_opened', { source });
  }, [source]);

  const handleDismissPrimary = useCallback(() => {
    trackEvent('paywall_dismissed', { step: 'primary', source });
    if (hasLimitedOfferExpired(settingsRepo)) {
      onDismissed();
      return;
    }
    setStep('downsell');
  }, [onDismissed, settingsRepo, source]);

  const handleDismissDownsell = useCallback(() => {
    trackEvent('paywall_dismissed', { step: 'downsell', source });
    const startedAt = startLimitedOffer(settingsRepo);
    trackEvent('limited_offer_started', { source, started_at: startedAt });
    onDismissed();
  }, [onDismissed, settingsRepo, source]);

  const handlePurchased = useCallback((result: PurchaseSuccess) => {
    setSuccess(result);
  }, []);

  if (success) {
    return <PurchaseSuccessScreen result={success} source={source} onContinue={onPurchased} />;
  }

  if (step === 'downsell') {
    return (
      <PaywallDownsell
        purchases={purchases}
        plan={PAYWALL_STEPS.downsell.plan}
        onPurchased={handlePurchased}
        onDismiss={handleDismissDownsell}
      />
    );
  }

  return (
    <Paywall purchases={purchases} onPurchased={handlePurchased} onDismiss={handleDismissPrimary} />
  );
}
