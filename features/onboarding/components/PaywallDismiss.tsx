import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  /** Seconds left on the hold; 0 arms the control. */
  remaining: number;
  onDismiss: () => void;
}

/**
 * The paywall's only exit. It shows the remaining seconds while held rather than sitting
 * inert — a dead control reads as a broken screen, a visible countdown reads as "not yet".
 * Armed, it spells out "Skip": the word is unambiguous where a ✕ can read as "close the app".
 */
export function PaywallDismiss({ remaining, onDismiss }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const armed = remaining <= 0;

  return (
    <View
      className="absolute right-2 z-10"
      style={{ top: insets.top + 4 }}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={armed ? onDismiss : undefined}
        disabled={!armed}
        accessibilityRole="button"
        accessibilityState={{ disabled: !armed }}
        accessibilityLabel={
          armed ? t('paywall.dismiss.label') : t('paywall.dismiss.waiting', { seconds: remaining })
        }
        className="min-h-[44px] min-w-[44px] items-center justify-center px-1"
      >
        {/* Pill rather than a fixed circle so the word and the countdown digit can share one
            shape — the control must not resize when it arms. */}
        <View className="h-8 min-w-[32px] items-center justify-center rounded-full bg-black/5 px-2.5">
          {armed ? (
            <Text className="font-sans-medium text-[14px] text-ink-tertiary">
              {t('onboarding.skip')}
            </Text>
          ) : (
            <Text className="font-mono text-[13px] text-ink-tertiary">{remaining}</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}
