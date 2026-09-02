import { PAYWALL_REVIEWS } from '@features/onboarding/reviews';
import { LAUREL_GOLD } from '@features/onboarding/tokens';
import { Icon } from '@shared/components/ui/Icon';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, Text, View } from 'react-native';

const PRODUCT_HUNT_CORAL = '#FF6154';

function ProductHuntAwardBadge({ award }: { award: string }) {
  const { t } = useTranslation();
  const brand = t('paywall.social.productHunt');

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${brand}, ${award}`}
      className="h-11 flex-1 flex-row items-center rounded-xl border bg-white px-2"
      style={{ borderColor: PRODUCT_HUNT_CORAL, gap: 7 }}
    >
      <View className="h-6 w-6 items-center justify-center rounded-full bg-yellow-400">
        <Icon name="starFilled" size={12} color="#FFFFFF" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-[7px] font-bold leading-[9px]" style={{ color: PRODUCT_HUNT_CORAL }}>
          {brand}
        </Text>
        <Text
          className="text-[11px] font-bold leading-[14px]"
          style={{ color: PRODUCT_HUNT_CORAL }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {award}
        </Text>
      </View>
    </View>
  );
}

/** Award laurel framing a headline stat. The wreath is a mirrored glyph pair rather than
 *  artwork — this project has no react-native-svg, and a raster laurel would cost an asset
 *  per density for something this small. */
function LaurelStat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-row items-center" style={{ gap: 4 }}>
      <Icon name="leaf" size={22} color={LAUREL_GOLD} />
      <View className="items-center">
        <Text className="font-display text-[22px] leading-7 text-ink">{value}</Text>
        <Text className="text-[11px] leading-4 text-ink-tertiary">{label}</Text>
      </View>
      <View style={{ transform: [{ scaleX: -1 }] }}>
        <Icon name="leaf" size={22} color={LAUREL_GOLD} />
      </View>
    </View>
  );
}

export function PaywallSocialProof() {
  const { t } = useTranslation();

  return (
    <View className="mb-6">
      <View className="mb-5 flex-row items-center justify-center" style={{ gap: 20 }}>
        <LaurelStat value={t('paywall.social.stat1')} label={t('paywall.social.stat1Label')} />
        <LaurelStat value={t('paywall.social.stat2')} label={t('paywall.social.stat2Label')} />
      </View>

      <View className="mb-5 flex-row" style={{ gap: 8 }}>
        <ProductHuntAwardBadge award={t('paywall.social.productOfDay')} />
        <ProductHuntAwardBadge award={t('paywall.social.productOfWeek')} />
      </View>

      <Text className="mb-1 text-center font-display text-[22px] text-ink">
        {t('paywall.social.headline')}
      </Text>
      <Text className="mb-4 text-center text-[13px] text-ink-tertiary">
        {t('paywall.social.subhead')}
      </Text>

      {/* Cards bleed past the parent's 24pt padding so the next one peeks in — that peek is
          what signals "scroll me" without adding a control. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        /* Vertical padding gives the card shadows room *inside* the scroll bounds — a
           ScrollView clips to its frame, so without it the shadow is sliced off flush with
           the card. The negative margin cancels that padding so the layout is unchanged. */
        contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 12, gap: 12 }}
        style={{ marginHorizontal: -24, marginVertical: -12 }}
        snapToInterval={300}
        decelerationRate="fast"
      >
        {PAYWALL_REVIEWS.map((r) => (
          <View
            key={r.quoteKey}
            className="rounded-card bg-surface p-4"
            style={{
              width: 288,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 6,
              elevation: 2,
            }}
          >
            <View className="mb-3 flex-row items-center" style={{ gap: 10 }}>
              <Image
                source={r.avatar}
                style={{ width: 36, height: 36, borderRadius: 18 }}
                accessibilityIgnoresInvertColors
              />
              <View className="flex-1">
                <Text className="font-heading text-sm text-ink">{t(r.nameKey)}</Text>
                <Text className="text-[11px] text-ink-tertiary">{t(r.roleKey)}</Text>
              </View>
              <Text className="text-xs text-yellow-500">{t('icons.stars')}</Text>
            </View>
            <Text className="text-[15px] leading-5 text-ink">{t(r.quoteKey)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
