import { RATING_REVIEWS } from '@features/onboarding/reviews';
import { LAUREL_GOLD } from '@features/onboarding/tokens';
import { Icon } from '@shared/components/ui/Icon';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogoMarquee } from './LogoMarquee';

/* eslint-disable @typescript-eslint/no-require-imports -- static assets */
const LOVED = require('../../../assets/images/loved.png');
const PRODUCT_HUNT = require('../../../assets/images/producthunt-badge.png');
/* eslint-enable @typescript-eslint/no-require-imports */

interface Props {
  /** Pager slides are laid out by explicit width, not flex. */
  width: number;
}

/**
 * The rating ask, backed by real customer reviews. The native prompt is fired by the CTA
 * (see `requestStoreReview`), not by this screen appearing — iOS budgets these prompts, so
 * one is only worth spending on a deliberate tap.
 */
export function OnboardingRating({ width }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ width }} className="flex-1">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 32,
          paddingHorizontal: 24,
          paddingBottom: 8,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          className="text-center font-display text-[30px] text-ink"
          style={{ letterSpacing: -1.2 }}
        >
          {t('onboarding.rating.headline')}
        </Text>

        <View className="mt-2 flex-row items-center justify-center" style={{ gap: 6 }}>
          <Icon name="leaf" size={20} color={LAUREL_GOLD} />
          <View className="items-center">
            <View className="flex-row items-baseline" style={{ gap: 6 }}>
              <Text className="font-display text-[26px] text-ink">{t('paywall.social.stat1')}</Text>
              <Text className="text-base text-yellow-500">{t('icons.stars')}</Text>
            </View>
            <Text className="text-[12px] text-primary font-bold">
              {t('onboarding.rating.topRated')}
            </Text>
          </View>
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <Icon name="leaf" size={20} color={LAUREL_GOLD} />
          </View>
        </View>

        <View className="mt-6 items-center">
          <Image
            source={PRODUCT_HUNT}
            style={{ width: 210, height: 45 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>

        <View className="mb-4 mt-7 flex-row items-center justify-center" style={{ gap: 10 }}>
          <Image
            source={LOVED}
            style={{ width: 96, height: 16 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text className="font-sans text-[14px] text-ink-secondary">
            {t('onboarding.rating.trustedBy')}
          </Text>
        </View>
        <LogoMarquee />

        <Text className="mb-5 mt-8 font-heading text-[17px] text-ink">
          {t('onboarding.rating.madeForYou')}
        </Text>

        <View style={{ gap: 10 }}>
          {RATING_REVIEWS.map((r) => (
            <View key={r.nameKey} className="rounded-2xl bg-surface p-4">
              <View className="mb-2 flex-row items-center" style={{ gap: 10 }}>
                <Image
                  source={r.avatar}
                  style={{ width: 36, height: 36, borderRadius: 18 }}
                  accessibilityIgnoresInvertColors
                />
                <View className="flex-1">
                  <Text className="font-heading text-[15px] text-ink">{t(r.nameKey)}</Text>
                  <Text className="text-[12px] text-ink-tertiary">{t(r.roleKey)}</Text>
                </View>
                <Text className="text-[13px] text-yellow-500">{t('icons.stars')}</Text>
              </View>
              <Text className="text-[14px] leading-5 text-ink-secondary">{t(r.quoteKey)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
