import { PAYWALL_DISMISS_HOLD_SECONDS, type PlanKey } from '@lib/constants/revenuecat';
import type { PurchaseSuccess, UsePurchasesResult } from '@lib/hooks/usePurchases';
import { trackEvent } from '@lib/services/analytics';
import { getFreeTrialDays } from '@lib/services/storeOffer';
import { Icon } from '@shared/components/ui/Icon';
import { useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JUPITRR } from '../tokens';
import { useDismissHold } from '../useDismissHold';

import { DottedBackground } from './DottedBackground';
import { OnboardingCTA } from './OnboardingCTA';
import { PaywallDismiss } from './PaywallDismiss';
import { PaywallFAQ } from './PaywallFAQ';
import { PaywallLegalFooter } from './PaywallLegalFooter';
import { PaywallSocialProof } from './PaywallSocialProof';

/* eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset */
const HERO = require('../../../assets/images/downsell-hero.png');
/** Native pixel size of the source asset — used to hold its aspect ratio at display width. */
const HERO_NATIVE = { width: 277, height: 600 };
const HERO_WIDTH = 200;

interface Props {
  purchases: UsePurchasesResult;
  /** Which package this step sells — comes from `PAYWALL_STEPS.downsell`. */
  plan: PlanKey;
  onPurchased: (result: PurchaseSuccess) => void;
  onDismiss: () => void;
}

const BULLETS = ['paywall.bullet1', 'paywall.bullet2', 'paywall.bullet3', 'paywall.bullet4'];

/**
 * Second rung of the funnel, shown when the primary offer is dismissed. One product, no
 * plan picker, no trial primer in between — the whole point is fewer decisions than the
 * screen the user just walked away from, so the CTA buys immediately.
 *
 * Every claim on this screen is read off the live product. If the configured package carries
 * a free introductory offer the trial is sold in the store's own terms; if it does not, the
 * screen sells "no commitment" instead rather than promising a trial that will not appear in
 * the purchase sheet.
 */
export function PaywallDownsell({ purchases, plan, onPurchased, onDismiss }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const dismissHold = useDismissHold(PAYWALL_DISMISS_HOLD_SECONDS);

  const { loadingOffering, purchasing, error, annualPackage, weeklyPackage, purchase, restore } =
    purchases;

  const pkg = plan === 'annual' ? annualPackage : weeklyPackage;
  const trialDays = getFreeTrialDays(pkg?.product);
  useEffect(() => {
    trackEvent('paywall_downsell_viewed', { plan, trialDays });
  }, [plan, trialDays]);

  const handlePurchase = async () => {
    const result = await purchase(plan);
    if (result) onPurchased(result);
  };

  const handleRestore = async () => {
    const result = await restore();
    if (result) onPurchased(result);
  };

  const price = pkg?.product.priceString;
  const planLabel = t(plan === 'annual' ? 'paywall.annualLabel' : 'paywall.weeklyLabel');
  const period = plan === 'annual' ? t('paywall.perYear') : t('paywall.perWeek');
  const compareAtPrice = t('paywall.downsell.originalWeeklyPrice');
  const ctaLabel = trialDays
    ? t('paywall.ctaTrialLong')
    : t(plan === 'annual' ? 'paywall.ctaSubscribeAnnual' : 'paywall.ctaSubscribeWeekly');
  const priceAccessibility = trialDays
    ? t('paywall.downsell.priceAccessibilityTrial', {
        count: trialDays,
        current: `${price}${period}`,
        original: `${compareAtPrice}${period}`,
      })
    : t('paywall.downsell.priceAccessibility', {
        current: `${price}${period}`,
        original: `${compareAtPrice}${period}`,
      });

  return (
    /* Dotted paper backdrop, not the primary paywall's flat white — the downsell is a
       different moment (you already said no once), and should read that way rather than
       looking like the same screen replayed. */
    <DottedBackground className="flex-1">
      <PaywallDismiss remaining={dismissHold} onDismiss={onDismiss} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingTop: insets.top + 48,
          paddingHorizontal: 24,
          paddingBottom: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="mb-4 text-center text-3xl font-bold tracking-tight text-ink">
          <Trans
            i18nKey="paywall.downsell.headline"
            components={{ em: <Text className="font-accent" /> }}
          />
        </Text>

        {loadingOffering && (
          <View className="items-center py-4">
            <ActivityIndicator size="small" color={JUPITRR.primary} />
          </View>
        )}

        {!!price && (
          <View className="relative mb-3">
            <View pointerEvents="none" accessible={false} className="absolute -left-2 -top-3 z-10">
              <Icon name="sparkles" size={24} color="#EAB308" />
            </View>
            <View
              pointerEvents="none"
              accessible={false}
              className="absolute -right-2 top-2 z-10"
              style={{ transform: [{ rotate: '12deg' }] }}
            >
              <Icon name="sparkles" size={20} color="#EAB308" />
            </View>
            <View
              pointerEvents="none"
              accessible={false}
              className="absolute -bottom-2 right-5 z-10"
              style={{ transform: [{ rotate: '-10deg' }] }}
            >
              <Icon name="starFilled" size={14} color="#EAB308" />
            </View>

            <View
              accessible
              accessibilityLabel={priceAccessibility}
              className="overflow-hidden rounded-3xl border-2 border-primary/20 bg-blue-50"
            >
              {!!trialDays && (
                <View className="items-center bg-black/80 py-1.5 ">
                  <Text className="text-sm font-bold tracking-[1px] text-white">
                    {t('paywall.downsell.trialBadge', { count: trialDays })}
                  </Text>
                </View>
              )}

              <View className="items-center px-6 py-5">
                <View className="flex-row items-baseline justify-center" style={{ gap: 12 }}>
                  <View className="flex-row items-baseline">
                    <Text className="font-display text-[40px] leading-[46px] text-primary">
                      {price}
                    </Text>
                    <Text className="text-sm text-ink-secondary">{period}</Text>
                  </View>
                  <Text
                    className="text-lg text-ink-tertiary"
                    style={{ textDecorationLine: 'line-through' }}
                  >
                    {compareAtPrice}
                    {period}
                  </Text>
                </View>
                <View className="mt-2 rounded-full bg-primary px-4 py-1.5">
                  <Text className="text-[13px] font-bold text-white">
                    {t('paywall.downsell.discountForever')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <View className="mb-5 flex-row items-center justify-center" style={{ gap: 6 }}>
          <Text className="font-bold text-primary">{t('icons.checkmark')}</Text>
          <Text className="text-[15px] font-bold text-ink">
            {t('paywall.downsell.noPaymentDue')}
          </Text>
        </View>

        {/* A real capture of the teleprompter overlay live on camera, not a mockup — the
            product proving the pitch reads more credible than another line of copy. */}
        <View className="mb-6 items-center">
          <Image
            source={HERO}
            style={{
              width: HERO_WIDTH,
              height: (HERO_WIDTH / HERO_NATIVE.width) * HERO_NATIVE.height,
              borderRadius: 20,
            }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>

        <View className="mt-5" style={{ gap: 10 }}>
          {BULLETS.map((key) => (
            <View key={key} className="flex-row items-start" style={{ gap: 10 }}>
              <Text className="mt-0.5 font-bold text-primary">{t('icons.checkmark')}</Text>
              <Text className="flex-1 text-base text-ink">{t(key)}</Text>
            </View>
          ))}
        </View>

        {!!error && <Text className="mt-3 text-center text-sm text-red-500">{error}</Text>}

        <View className="mt-8">
          <PaywallSocialProof />
          <PaywallFAQ />
        </View>
      </ScrollView>

      <View className="px-6" style={{ paddingBottom: insets.bottom + 12, gap: 6 }}>
        <OnboardingCTA
          label={ctaLabel}
          onPress={handlePurchase}
          disabled={loadingOffering || purchasing || !pkg}
          loading={loadingOffering || purchasing}
        />
        {/* The one place this screen states what actually gets charged and when — every other
            surface sells "free", this line is required to say "day {{count}}" and the real
            price, or the CTA above is a claim the fine print never backs up. */}
        {!!price && (
          <Text className="text-center text-xs text-ink-secondary">
            {trialDays
              ? t('paywall.billingFineprintTrial', {
                  plan: planLabel,
                  price: `${price}${period}`,
                  count: trialDays,
                })
              : t('paywall.billingFineprintNow', {
                  plan: planLabel,
                  price: `${price}${period}`,
                })}
          </Text>
        )}
        {!pkg && !loadingOffering && (
          <Text className="text-center text-sm text-red-500">
            {t('paywall.downsell.unavailable')}
          </Text>
        )}
        <PaywallLegalFooter onRestore={handleRestore} restoring={purchasing} />
      </View>
    </DottedBackground>
  );
}
