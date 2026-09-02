import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Text, View } from 'react-native';

export function ImportScriptIllustration() {
  const { t } = useTranslation();
  const bounceY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceY, {
          toValue: 8,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(bounceY, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [bounceY]);

  return (
    <View className="items-center">
      {/* Cloud / Jupitrr platform */}
      <View className="items-center rounded-2xl bg-white/90 px-8 py-4 shadow-lg">
        <Text className="text-2xl">🌐</Text>
        <Text className="mt-1 text-sm font-bold text-amber-700">{t('onboarding.jupitrr')}</Text>
      </View>

      {/* Download arrow */}
      <Animated.View className="my-4 items-center" style={{ transform: [{ translateY: bounceY }] }}>
        <Text className="text-3xl">📥</Text>
      </Animated.View>

      {/* Phone / App */}
      <View className="items-center rounded-2xl border-2 border-white/40 bg-white/20 px-10 py-5">
        <View className="mb-3 w-24 rounded-xl bg-white/80 p-3">
          <View className="mb-1.5 h-2 w-full rounded-full bg-amber-300/60" />
          <View className="mb-1.5 h-2 w-3/4 rounded-full bg-amber-300/40" />
          <View className="h-2 w-full rounded-full bg-amber-300/40" />
        </View>
        <Text className="text-sm font-semibold text-white">{t('onboarding.yourScript')}</Text>
      </View>
    </View>
  );
}
