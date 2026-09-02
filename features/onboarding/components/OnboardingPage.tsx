import { Trans, useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { OnboardingStep } from '../constants';

import { OnboardingIllustration } from './OnboardingIllustration';

interface Props {
  step: OnboardingStep;
  width: number;
}

export function OnboardingPage({ step, width }: Props) {
  const { t } = useTranslation();
  return (
    <View style={{ width }} className="flex-1">
      {/* Centred in the space above the pinned CTA — bottom-aligning would leave the group
          clamped to the button with a dead gap up top. */}
      <View className="flex-1 items-center justify-center px-6 pb-2">
        <OnboardingIllustration stepKey={step.key} />
        <Text
          className="mt-9 text-center font-display text-[30px] text-ink"
          style={{ letterSpacing: -1.5 }}
        >
          {/* Titles may mark a word with <em> for the italic serif accent; steps that do not
              use it render unchanged. */}
          <Trans i18nKey={step.titleKey} components={{ em: <Text className="font-accent" /> }} />
        </Text>
        <Text
          className="mt-3 px-4 text-center font-sans text-[16px] leading-relaxed text-ink-secondary"
          style={{ letterSpacing: -0.4 }}
        >
          {t(step.descriptionKey)}
        </Text>
      </View>
    </View>
  );
}
