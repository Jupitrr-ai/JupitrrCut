import { MarkEntrance, useMarkEntrance } from '@features/onboarding/components/MarkEntrance';
import { Icon } from '@shared/components/ui/Icon';
import { useTranslation } from 'react-i18next';
import { Image, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


interface Props {
  /** Pager slides are laid out by explicit width, not flex. */
  width: number;
  /** True only while this slide is the visible page — drives the marks' entrance. */
  active: boolean;
}

/* eslint-disable @typescript-eslint/no-require-imports -- static assets */
const AFTER = require('../../../assets/images/onboarding-eyes-after.jpg');
const BEFORE = require('../../../assets/images/onboarding-eyes-before.jpg');
const VIEW_COUNT = require('../../../assets/images/view-count.png');
/* eslint-enable @typescript-eslint/no-require-imports */

/** Source frames are 0.70 w/h; matching it keeps both faces uncropped at the same scale. */
const PANE_ASPECT = 0.7;

/** Shared gutter for the blue marks, so both captions start on the same x. */
const MARK_W = 62;

/** One mark per row, 100ms apart, so the eye is walked down the list rather than shown three
 *  claims at once. Module-level: a fresh array each render would restart the entrance. */
const MARK_DELAYS = [0, 140, 280];

function Pane({
  source,
  label,
  views,
  highlighted,
}: {
  source: number;
  label: string;
  views: string;
  highlighted: boolean;
}) {
  return (
    <View className="flex-1 overflow-hidden" style={{ aspectRatio: PANE_ASPECT }}>
      <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      {/* Top-right: keeps the badge off the subject's face and clear of the centre arrow. */}
      <View className="absolute right-2 top-2">
        <View className={`rounded-full px-2.5 py-1 ${highlighted ? 'bg-primary' : 'bg-ink/70'}`}>
          <Text className="font-heading text-[11px] tracking-wide text-white">{label}</Text>
        </View>
      </View>

      {/* View count reads straight off the photo, so it carries its own scrim — white on a
          bright wall would otherwise disappear. */}
      <View
        className="absolute bottom-2 left-2 flex-row items-center rounded-full bg-ink/55 px-2 py-1"
        style={{ gap: 5 }}
      >
        <Image
          source={VIEW_COUNT}
          style={{ width: 15, height: 11 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Text className="font-mono-semibold text-[11px] text-white">{views}</Text>
      </View>
    </View>
  );
}

export function OnboardingConfidence({ width, active }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [boost, stat, lens] = useMarkEntrance(MARK_DELAYS, active);

  return (
    <View style={{ width }} className="flex-1">
      <ScrollView
        contentContainerStyle={{
          /* flexGrow + centre so short content sits mid-screen, while long content still
             scrolls normally instead of being clipped. */
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + 32,
          paddingHorizontal: 24,
          paddingBottom: 8,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row overflow-hidden rounded-2xl">
          <Pane
            source={BEFORE}
            label={t('onboarding.confidence.before')}
            views={t('onboarding.confidence.beforeViews')}
            highlighted={false}
          />
          <Pane
            source={AFTER}
            label={t('onboarding.confidence.after')}
            views={t('onboarding.confidence.afterViews')}
            highlighted
          />

          {/* Sits on the seam so the pair reads as one transformation rather than two photos.
              The white ring keeps it legible against whatever falls behind it. */}
          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
            <View className="h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-primary">
              <Icon name="arrowRight" size={20} color="#FFFFFF" />
            </View>
          </View>
        </View>

        {/* Three matched points rather than a headline over a paragraph over a stat: every
            line is one blue mark plus one claim, sharing a gutter so the copy aligns. The
            captions are deliberately identical in weight — the blue mark carries emphasis. */}
        <View className="mt-7" style={{ gap: 22 }}>
          <View className="flex-row items-center" style={{ gap: 14 }}>
            {/* Numerals start further under 1 than the icons do, so the spring reads as a
                pop on the figure that carries the claim. */}
            <MarkEntrance progress={boost} scaleFrom={0.86}>
              <View style={{ width: MARK_W }} className="flex-row items-baseline justify-center">
                <Text className="font-display text-[38px] leading-[42px] text-primary">
                  {t('onboarding.confidence.boostValue')}
                </Text>
                <Text className="font-display text-[20px] text-primary">
                  {t('onboarding.confidence.boostUnit')}
                </Text>
              </View>
            </MarkEntrance>
            <Text className="flex-1 font-sans text-[15px] leading-5 text-ink-secondary">
              {t('onboarding.confidence.boostLabel')}
            </Text>
          </View>

          <View className="flex-row items-center" style={{ gap: 14 }}>
            <MarkEntrance progress={stat} scaleFrom={0.86}>
              <View style={{ width: MARK_W }} className="flex-row items-baseline justify-center">
                <Text className="font-display text-[38px] leading-[42px] text-primary">
                  {t('onboarding.confidence.statValue')}
                </Text>
                <Text className="font-display text-[20px] text-primary">
                  {t('onboarding.confidence.statUnit')}
                </Text>
              </View>
            </MarkEntrance>
            <Text className="flex-1 font-sans text-[15px] leading-5 text-ink-secondary">
              {t('onboarding.confidence.statLabel')}
            </Text>
          </View>

          <View className="flex-row items-center" style={{ gap: 14 }}>
            {/* All three marks centre in the same gutter, so the numerals and the icon share
                one optical axis regardless of how wide each one is. */}
            <MarkEntrance progress={lens} scaleFrom={0.9}>
              <View style={{ width: MARK_W }} className="items-center">
                <Icon name="sparkles" size={32} color="#3C3FEF" />
              </View>
            </MarkEntrance>
            <Text className="flex-1 font-sans text-[15px] leading-5 text-ink-secondary">
              {t('onboarding.confidence.lensLabel')}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
