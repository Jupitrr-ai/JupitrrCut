import { PAYWALL_DISMISS_HOLD_SECONDS } from '@lib/constants/revenuecat';
import type { PlanKey, PurchaseSuccess, UsePurchasesResult } from '@lib/hooks/usePurchases';
import { trackEvent } from '@lib/services/analytics';
import {
  formatDividedPrice,
  getAnnualSavingsPercent,
  getFreeTrialDays,
} from '@lib/services/storeOffer';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JUPITRR } from '../tokens';
import { useDismissHold } from '../useDismissHold';

import { OnboardingCTA } from './OnboardingCTA';
import { PaywallComparison, ProPill } from './PaywallComparison';
import { PaywallDismiss } from './PaywallDismiss';
import { PaywallFAQ } from './PaywallFAQ';
import { PaywallLegalFooter } from './PaywallLegalFooter';
import { PaywallSocialProof } from './PaywallSocialProof';
import { PaywallTrialTimeline } from './PaywallTrialTimeline';

interface Props {
  purchases: UsePurchasesResult;
  onPurchased: (result: PurchaseSuccess) => void;
  /** Omit to make the paywall inescapable; supplied, it arms a ✕ after the hold. */
  onDismiss?: () => void;
}

const BULLETS = ['paywall.bullet1', 'paywall.bullet2', 'paywall.bullet3', 'paywall.bullet4'];

interface PlanCardProps {
  selected: boolean;
  onPress: () => void;
  label: string;
  caption: string;
  price: string;
  period: string;
  badge?: string;
  footnote?: string;
}

/** Selection reads three ways at once — border, fill, and a filled radio — because on a
 *  two-card row a border alone is easy to miss at a glance. */
function PlanCard({
  selected,
  onPress,
  label,
  caption,
  price,
  period,
  badge,
  footnote,
}: PlanCardProps) {
  const { t } = useTranslation();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-1 rounded-2xl border-2 p-4 ${
        selected ? 'border-primary bg-primary-tint' : 'border-surface-line bg-white'
      }`}
    >
      {!!badge && (
        <View className="absolute -top-3 left-0 right-0 items-center">
          <View className="rounded-full bg-primary px-2.5 py-1">
            <Text className="text-[10px] font-bold text-white">{badge}</Text>
          </View>
        </View>
      )}

      <View className="mb-1 flex-row items-center justify-between">
        <Text className="font-heading text-[17px] text-ink">{label}</Text>
        <View
          className={`h-5 w-5 items-center justify-center rounded-full ${
            selected ? 'bg-primary' : 'border-2 border-surface-line'
          }`}
        >
          {selected && <Text className="text-[10px] text-white">{t('icons.checkmark')}</Text>}
        </View>
      </View>

      {/* Fixed 2-line height regardless of actual caption length — captions differ between
          cards ("Cheaper than a cup of coffee" wraps, "≈ US$1.54 / week" doesn't), and without
          a shared height the price row below lands at a different level on each card. */}
      <View className="mb-2 h-8 justify-start">
        <Text className="text-xs text-ink-tertiary" numberOfLines={2}>
          {caption}
        </Text>
      </View>

      <View className="flex-row items-baseline">
        <Text className="font-display text-[22px] text-ink">{price}</Text>
        <Text className="text-xs text-ink-tertiary">{period}</Text>
      </View>

      {/* Reserved even when empty: only the annual card carries a footnote, and without the
          slot the weekly card would sit a line short next to it on the shared row. */}
      <View className="mt-1 h-4 justify-center">
        {!!footnote && <Text className="text-[11px] font-bold text-primary">{footnote}</Text>}
      </View>
    </Pressable>
  );
}

export function Paywall({ purchases, onPurchased, onDismiss }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('annual');
  const dismissHold = useDismissHold(PAYWALL_DISMISS_HOLD_SECONDS);

  const { loadingOffering, purchasing, error, annualPackage, weeklyPackage, purchase, restore } =
    purchases;

  useEffect(() => {
    trackEvent('paywall_viewed');
  }, []);

  const handleSelectPlan = (plan: PlanKey) => {
    setSelectedPlan(plan);
    trackEvent('plan_selected', { plan });
  };

  const handleContinue = async () => {
    const result = await purchase(selectedPlan);
    if (result) onPurchased(result);
  };

  const handleRestore = async () => {
    const result = await restore();
    if (result) onPurchased(result);
  };

  const isAnnual = selectedPlan === 'annual';

  /* The annual card advertises a per-week figure, which must be derived from the live store
     price — a hardcoded one silently lies the moment pricing or currency changes. The i18n
     fallback only covers the store being unreachable, where there is no product to divide. */
  const annualWeekly = formatDividedPrice(annualPackage?.product, 52) ?? t('paywall.annualWeekly');
  const annualSavingsPercent = getAnnualSavingsPercent(
    weeklyPackage?.product,
    annualPackage?.product
  );
  const annualSavings = annualSavingsPercent
    ? t('paywall.annualSavings', { percent: annualSavingsPercent })
    : t('paywall.annualSavingsBare');

  /* Keep the conversion area explicit about the plan the user just tapped. Price and trial
     terms still come from the live store product, while the CTA and fine print both name the
     selected billing cadence. */
  const selectedPackage = isAnnual ? annualPackage : weeklyPackage;
  const selectedTrialDays = getFreeTrialDays(selectedPackage?.product);
  const planLabel = t(isAnnual ? 'paywall.annualLabel' : 'paywall.weeklyLabel');
  const ctaLabel = selectedTrialDays
    ? t('paywall.ctaTrialLong')
    : t(isAnnual ? 'paywall.ctaSubscribeAnnual' : 'paywall.ctaSubscribeWeekly');
  const selectedPriceString =
    selectedPackage?.product.priceString ??
    t(isAnnual ? 'paywall.annualPriceBare' : 'paywall.weeklyPrice');
  const selectedPeriod = isAnnual ? t('paywall.perYear') : t('paywall.perWeek');
  const billingFineprintPrice = isAnnual
    ? `${selectedPriceString}${selectedPeriod} (${annualWeekly}/week)`
    : `${selectedPriceString}${selectedPeriod}`;
  const billingFineprint = selectedTrialDays
    ? t('paywall.billingFineprintTrial', {
        plan: planLabel,
        price: billingFineprintPrice,
        count: selectedTrialDays,
      })
    : t('paywall.billingFineprintNow', { plan: planLabel, price: billingFineprintPrice });

  return (
    <View className="flex-1 bg-white">
      {!!onDismiss && <PaywallDismiss remaining={dismissHold} onDismiss={onDismiss} />}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          /* Extra room when the dismiss control is present so the wordmark clears it. */
          paddingTop: insets.top + (onDismiss ? 52 : 32),
          paddingHorizontal: 24,
          paddingBottom: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="mb-1 flex-row items-center justify-center" style={{ gap: 6 }}>
          <Text className="font-display text-lg text-ink">{t('paywall.appName')}</Text>
          <ProPill />
        </View>
        <Text className="mb-6 text-center text-3xl font-bold tracking-tight text-ink">
          {/* Italic serif on the emphasised words — the same editorial accent the landing
              hero uses, so the app and the site sound alike. */}
          <Trans
            i18nKey={isAnnual ? 'paywall.trial.headline' : 'paywall.featuresHeadline'}
            components={{ em: <Text className="font-accent" /> }}
          />
        </Text>

        {/* Annual sells the trial mechanics (what happens, and when); weekly has no trial to
            explain, so it sells the feature set instead. */}
        {isAnnual ? (
          <PaywallTrialTimeline />
        ) : (
          <View className="mb-6" style={{ gap: 10 }}>
            {BULLETS.map((key) => (
              <View key={key} className="flex-row items-start" style={{ gap: 10 }}>
                <Text className="mt-0.5 font-bold text-primary">{t('icons.checkmark')}</Text>
                <Text className="flex-1 text-base text-ink">{t(key)}</Text>
              </View>
            ))}
          </View>
        )}

        {loadingOffering ? (
          <View className="items-center py-8">
            <ActivityIndicator size="small" color={JUPITRR.primary} />
          </View>
        ) : (
          /* Side-by-side so the two prices are compared at a glance rather than by scrolling. */
          <View>
            {/* Top padding leaves room for the annual card's badge, which overhangs its edge. */}
            <View className="flex-row items-stretch" style={{ gap: 10, paddingTop: 10 }}>
              <PlanCard
                selected={!isAnnual}
                onPress={() => handleSelectPlan('weekly')}
                label={t('paywall.weeklyLabel')}
                caption={t('paywall.weeklySub')}
                price={weeklyPackage?.product.priceString ?? t('paywall.weeklyPrice')}
                period={t('paywall.perWeek')}
              />
              <PlanCard
                selected={isAnnual}
                onPress={() => handleSelectPlan('annual')}
                label={t('paywall.annualLabel')}
                /* Restates the annual price in the weekly card's unit, so the two cards can
                   be compared without doing the arithmetic. It sits in the caption slot, not
                   the price slot: both cards must put the amount actually charged in the big
                   type, or the annual card looks like the cheaper *charge* rather than the
                   cheaper rate. */
                caption={t('paywall.annualWeeklyEquivalent', { price: annualWeekly })}
                price={annualPackage?.product.priceString ?? t('paywall.annualPriceBare')}
                period={t('paywall.perYear')}
                badge={t('paywall.annualBadgeTrial')}
                footnote={annualSavings}
              />
            </View>

            <Text className="mt-3 text-center text-xs text-ink-tertiary">
              {isAnnual ? t('paywall.annualFootnote') : t('paywall.weeklyFootnote')}
            </Text>
            <Text className="mt-1 text-center text-xs font-bold text-primary">
              {t('paywall.oneTimeOffer')}
            </Text>
          </View>
        )}

        {!!error && <Text className="mt-3 text-center text-sm text-red-500">{error}</Text>}

        {/* Proof sits below the offer: the first viewport has to carry the decision (what you
            get, what it costs), and this is what reinforces it once they start scrolling. */}
        <View className="mt-8">
          <PaywallSocialProof />
          <PaywallComparison />
          <PaywallFAQ />
        </View>
      </ScrollView>

      <View className="px-6" style={{ paddingBottom: insets.bottom + 12, gap: 10 }}>
        <OnboardingCTA
          label={ctaLabel}
          onPress={handleContinue}
          disabled={loadingOffering || purchasing || !selectedPackage}
          loading={loadingOffering || purchasing}
        />
        {!loadingOffering && (
          <Text className="text-center text-xs text-ink-secondary">{billingFineprint}</Text>
        )}

        <PaywallLegalFooter onRestore={handleRestore} restoring={purchasing} />
      </View>
    </View>
  );
}
