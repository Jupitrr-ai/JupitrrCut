import type { PlanKey, UsePurchasesResult } from '@lib/hooks/usePurchases';
import { trackEvent } from '@lib/services/analytics';
import { getFreeTrialDays } from '@lib/services/storeOffer';
import { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { OnboardingCTA } from './OnboardingCTA';
import { OnboardingLightScreen } from './OnboardingLightScreen';
import { PaywallDismiss } from './PaywallDismiss';

interface Props {
  selectedPlan: PlanKey;
  purchases: UsePurchasesResult;
  onComplete: () => void;
  /**
   * Backs out of the primer. Not held like the offers are: the user reached this screen by
   * choosing a plan, and cancelling the StoreKit sheet leaves them here with nothing else to
   * tap — a step reached deliberately must be leavable, or the app is stuck.
   */
  onDismiss?: () => void;
}

const TIMELINE_ROWS = [
  { day: '🟢', key: 'onboarding.trialPrimer.day0' },
  { day: '🔔', key: 'onboarding.trialPrimer.day2' },
  { day: '📅', key: 'onboarding.trialPrimer.day3' },
];

export function TrialPrimer({ selectedPlan, purchases, onComplete, onDismiss }: Props) {
  const { t } = useTranslation();
  const { purchasing, error, purchase, loadingOffering, annualPackage, weeklyPackage } = purchases;

  const selectedPackage = selectedPlan === 'annual' ? annualPackage : weeklyPackage;
  const canPurchase = !loadingOffering && !!selectedPackage;
  const canContinue = canPurchase || (__DEV__ && !loadingOffering);

  /* The footer restates what the user is about to be charged, so both halves of it — the
     trial length and the price — are read off the product the purchase sheet will show.
     The static key is only reached when there is no product to read. */
  const trialDays = getFreeTrialDays(selectedPackage?.product);
  const priceString = selectedPackage?.product.priceString;
  const priceLabel = priceString
    ? `${priceString}${selectedPlan === 'annual' ? t('paywall.perYear') : t('paywall.perWeek')}`
    : null;
  const footer = !priceLabel
    ? t('onboarding.trialPrimer.footer')
    : trialDays
      ? t('onboarding.trialPrimer.footerTrial', { count: trialDays, price: priceLabel })
      : t('onboarding.trialPrimer.footerNoTrial', { price: priceLabel });

  useEffect(() => {
    trackEvent('trial_primer_viewed', { plan: selectedPlan });
  }, [selectedPlan]);

  const handleContinue = async () => {
    trackEvent('trial_primer_continue_tapped', { plan: selectedPlan });

    if (!selectedPackage) {
      if (__DEV__) {
        console.warn('[TrialPrimer] Package unavailable in dev — completing onboarding');
        onComplete();
      }
      return;
    }

    const result = await purchase(selectedPlan);
    if (result) onComplete();
  };

  return (
    <View className="flex-1">
      {!!onDismiss && <PaywallDismiss remaining={0} onDismiss={onDismiss} />}
      <OnboardingLightScreen
        withProgressPadding={false}
        footer={
          <OnboardingCTA
            label={t('onboarding.trialPrimer.cta')}
            onPress={handleContinue}
            loading={purchasing || loadingOffering}
            disabled={!canContinue || purchasing}
          />
        }
      >
        <View className="mb-8 items-center">
          <View className="relative">
            <View className="h-24 w-24 items-center justify-center rounded-3xl bg-primary-tint">
              <Text style={{ fontSize: 52 }}>🔔</Text>
            </View>
            <View className="absolute -right-1 -top-1 h-6 w-6 items-center justify-center rounded-full bg-primary">
              <Text className="text-xs font-bold text-white">1</Text>
            </View>
          </View>
        </View>

        <Text className="mb-6 text-3xl font-bold tracking-tight text-ink">
          <Trans
            i18nKey="onboarding.trialPrimer.headline"
            components={{ em: <Text className="font-accent" /> }}
          />
        </Text>

        <View style={{ gap: 16, marginBottom: 20 }}>
          {TIMELINE_ROWS.map((row) => (
            <View key={row.key} className="flex-row items-start" style={{ gap: 12 }}>
              <Text style={{ fontSize: 22 }}>{row.day}</Text>
              <Text className="flex-1 text-base text-ink">{t(row.key)}</Text>
            </View>
          ))}
        </View>

        <View className="mb-4 rounded-2xl bg-primary-tint px-4 py-3">
          <Text className="text-center text-sm font-semibold text-primary">
            {t('onboarding.trialPrimer.noPayment')}
          </Text>
        </View>

        {!!error && <Text className="text-center text-sm text-red-500">{error}</Text>}
        {!canPurchase && !loadingOffering && !__DEV__ && (
          <Text className="text-center text-sm text-red-500">
            {t('onboarding.trialPrimer.unavailable')}
          </Text>
        )}

        <Text className="mt-4 text-center text-xs text-ink-tertiary">{footer}</Text>
      </OnboardingLightScreen>
    </View>
  );
}
