import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  children: ReactNode;
  footer: ReactNode;
  /** Leave room for the top progress bar (S3–S9) */
  withProgressPadding?: boolean;
  scrollable?: boolean;
}

/**
 * Shared shell for light onboarding screens (S4–S9, paywall).
 * Consistent padding, safe area, and progress-bar offset.
 */
export function OnboardingLightScreen({
  children,
  footer,
  withProgressPadding = true,
  scrollable = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top + (withProgressPadding ? 52 : 24);

  const content = scrollable ? (
    <ScrollView
      className="flex-1 px-6"
      contentContainerStyle={{ paddingBottom: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View className="flex-1 px-6">{children}</View>
  );

  return (
    <View className="flex-1 bg-white" style={{ paddingTop: topPad }}>
      {content}
      <View className="px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        {footer}
      </View>
    </View>
  );
}
