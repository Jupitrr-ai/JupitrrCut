import { Icon } from '@shared/components/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

const BADGE = 28;
/** Rail runs between the first and last badge centres, so it never pokes out past the ends. */
const RAIL_INSET = BADGE / 2;

const STEPS = [
  { icon: 'gift' as const, titleKey: 'paywall.trial.step1Title', subKey: 'paywall.trial.step1Sub' },
  {
    icon: 'notifications' as const,
    titleKey: 'paywall.trial.step2Title',
    subKey: 'paywall.trial.step2Sub',
  },
  {
    icon: 'clock' as const,
    titleKey: 'paywall.trial.step3Title',
    subKey: 'paywall.trial.step3Sub',
  },
];

export function PaywallTrialTimeline() {
  const { t } = useTranslation();

  return (
    <View className="mb-6">
      <View className="relative">
        {/* Gradient fades toward the end date — the trial visibly running out is the point. */}
        <LinearGradient
          colors={['#5B5EF5', '#C7C9FA', '#C7C9FA']}
          style={{
            position: 'absolute',
            left: RAIL_INSET - 3,
            top: RAIL_INSET,
            bottom: RAIL_INSET,
            width: 6,
            borderRadius: 3,
          }}
        />

        {STEPS.map((step, i) => (
          <View
            key={step.titleKey}
            className="flex-row items-start"
            style={{ marginBottom: i === STEPS.length - 1 ? 0 : 20 }}
          >
            <View
              className="items-center justify-center rounded-full bg-primary"
              style={{ width: BADGE, height: BADGE }}
            >
              <Icon name={step.icon} size={15} color="#FFFFFF" />
            </View>
            <View className="flex-1 pl-3" style={{ paddingTop: 1 }}>
              <Text className="font-heading text-[17px] leading-6 text-ink">
                {t(step.titleKey)}
              </Text>
              <Text className="text-[14px] leading-5 text-ink-tertiary">{t(step.subKey)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
