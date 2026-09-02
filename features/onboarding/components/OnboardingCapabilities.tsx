import { MarkEntrance, useMarkEntrance } from '@features/onboarding/components/MarkEntrance';
import { Icon } from '@shared/components/ui/Icon';
import type { IconName } from '@shared/components/ui/Icon';
import { Trans, useTranslation } from 'react-i18next';
import type { Animated } from 'react-native';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  /** Pager slides are laid out by explicit width, not flex. */
  width: number;
  /** True only while this slide is the visible page — drives the marks' entrance. */
  active: boolean;
}

/* Every claim here has to match what the app actually ships — this screen sits directly
   before the paywall, so anything aspirational reads as a promise the purchase covers. */
const PLATFORMS: { icon: IconName; label: string }[] = [
  { icon: 'tiktok', label: 'TikTok' },
  { icon: 'instagram', label: 'Instagram' },
  { icon: 'youtube', label: 'YouTube' },
  { icon: 'facebook', label: 'Facebook' },
];

/* Only the two ratios the app genuinely produces. Recording unlocks orientation and review
   toggles 9:16 / 16:9 — there is no 1:1 or 4:5 path, so neither is advertised. */
const SIZES: { icon: IconName; ratio: string; labelKey: string }[] = [
  { icon: 'portrait', ratio: '9:16', labelKey: 'onboarding.capabilities.sizePortrait' },
  { icon: 'landscape', ratio: '16:9', labelKey: 'onboarding.capabilities.sizeLandscape' },
];

const SPECS = [
  { value: '2K', labelKey: 'onboarding.capabilities.specHd' },
  { value: 'MP4/MOV', labelKey: 'onboarding.capabilities.specFormat' },
  { value: 'Auto', labelKey: 'onboarding.capabilities.specJumpcut' },
];

/* Whole cards pop in 140ms apart, top to bottom. The card is what the eye reads as one
   object, so animating it entire lands better than rippling the icons inside it — and one
   moving element per row keeps a screen of three dense blocks calm. Module-level: a fresh
   array each render would restart the entrance. */
const SECTION_DELAYS = [0, 140, 280];

/* Header icon hues, one per card. Tailwind's orange/green/purple 500 — decorative only, and
   deliberately not coral, which DESIGN.md reserves for live/celebration. Each is paired with
   its own 50 tint, so the icon sits on a chip of its own hue rather than bare on the card. */
const ICON_EXPORT = '#F97316';
const ICON_SIZES = '#22C55E';
const ICON_SPECS = '#A855F7';
const ICON_EXPORT_BG = '#FFF7ED';
const ICON_SIZES_BG = '#F0FDF4';
const ICON_SPECS_BG = '#FAF5FF';

function Section({
  icon,
  progress,
  title,
  iconColor,
  iconBg,
  children,
}: {
  icon: IconName;
  progress: Animated.Value | undefined;
  title: string;
  iconColor: string;
  iconBg: string;
  children: React.ReactNode;
}) {
  return (
    <MarkEntrance progress={progress} rise={18} scaleFrom={0.96}>
      <View className="mb-4 rounded-2xl bg-surface p-4">
        <View className="mb-3 flex-row items-center" style={{ gap: 8 }}>
          <View
            style={{ backgroundColor: iconBg }}
            className="flex-row items-center rounded-lg pr-2"
          >
            <View
              className="h-7 w-7 items-center justify-center rounded-lg "
              style={{ backgroundColor: iconBg }}
            >
              <Icon name={icon} size={16} color={iconColor} />
            </View>
            <Text className="font-heading text-[15px] text-ink" style={{ backgroundColor: iconBg }}>
              {title}
            </Text>
          </View>
        </View>
        {children}
      </View>
    </MarkEntrance>
  );
}

export function OnboardingCapabilities({ width, active }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [exportBlock, sizesBlock, specsBlock] = useMarkEntrance(SECTION_DELAYS, active);

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
        <Text
          className="mb-1 text-center font-display text-[30px] leading-9 text-ink"
          style={{ letterSpacing: -1.2 }}
        >
          <Trans
            i18nKey="onboarding.capabilities.headline"
            components={{ em: <Text className="font-accent" /> }}
          />
        </Text>
        <Text className="mb-6 text-center font-sans text-[16px] text-ink-secondary">
          {t('onboarding.capabilities.subhead')}
        </Text>

        <Section
          icon="download"
          progress={exportBlock}
          iconColor={ICON_EXPORT}
          iconBg={ICON_EXPORT_BG}
          title={t('onboarding.capabilities.exportTitle')}
        >
          <View className="flex-row" style={{ gap: 8 }}>
            {PLATFORMS.map((p) => (
              <View
                key={p.label}
                className="flex-1 items-center rounded-xl bg-white/70 py-3"
                style={{ gap: 6 }}
              >
                <Icon name={p.icon} size={22} color="#181A22" />
                <Text className="text-center font-sans-medium text-[11px] text-ink-secondary">
                  {p.label}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section
          icon="resize"
          progress={sizesBlock}
          iconColor={ICON_SIZES}
          iconBg={ICON_SIZES_BG}
          title={t('onboarding.capabilities.sizesTitle')}
        >
          <View className="flex-row" style={{ gap: 8 }}>
            {SIZES.map((s) => (
              <View
                key={s.ratio}
                className="flex-1 items-center rounded-xl bg-white/70 py-3"
                style={{ gap: 4 }}
              >
                <Icon name={s.icon} size={24} color="#3C3FEF" />
                <Text className="font-mono-semibold text-[14px] text-primary">{s.ratio}</Text>
                <Text className="text-[11px] text-ink-tertiary">{t(s.labelKey)}</Text>
              </View>
            ))}
          </View>
        </Section>

        <Section
          icon="clapperboard"
          progress={specsBlock}
          iconColor={ICON_SPECS}
          iconBg={ICON_SPECS_BG}
          title={t('onboarding.capabilities.specsTitle')}
        >
          <View className="flex-row" style={{ gap: 8 }}>
            {SPECS.map((s) => (
              <View key={s.value} className="flex-1 items-center rounded-xl bg-white/70 py-3">
                <Text className="font-mono-semibold text-[15px] text-primary">{s.value}</Text>
                <Text className="mt-0.5 text-[11px] text-ink-tertiary">{t(s.labelKey)}</Text>
              </View>
            ))}
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}
