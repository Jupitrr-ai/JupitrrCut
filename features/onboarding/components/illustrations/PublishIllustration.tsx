import { Icon } from '@shared/components/ui/Icon';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Image, Text, View } from 'react-native';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset
const DEMO_SNAPSHOT = require('../../../../assets/images/onboarding-demo.jpg');

interface ConfettiAccent {
  color: string;
  size: number;
  delay: number;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

// Celebration mix from DESIGN.md — coral is sanctioned here (celebration)
const CONFETTI_ACCENTS: ConfettiAccent[] = [
  { color: '#3C3FEF', top: -10, left: -18, size: 8, delay: 0 },
  { color: '#EE6061', top: 18, right: -22, size: 7, delay: 300 },
  { color: '#D97706', top: -16, right: 24, size: 6, delay: 600 },
  { color: '#1E9E6A', bottom: -8, left: 10, size: 7, delay: 150 },
  { color: '#EE6061', bottom: 24, left: -24, size: 6, delay: 450 },
  { color: '#3C3FEF', bottom: -14, right: -10, size: 8, delay: 750 },
];

function FloatingDot({ color, size, delay, ...position }: ConfettiAccent) {
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -6, duration: 1100, delay, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1100, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [floatY, delay]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: 2,
        backgroundColor: color,
        transform: [{ translateY: floatY }, { rotate: '15deg' }],
        ...position,
      }}
    />
  );
}

/**
 * The payoff: finished video with B-roll, ready for Jupitrr or the camera
 * roll, with floating celebration confetti accents.
 */
export function PublishIllustration() {
  const { t } = useTranslation();
  return (
    <View className="items-center">
      {/* Finished video card with confetti accents */}
      <View className="relative mb-5">
        {CONFETTI_ACCENTS.map((accent, index) => (
          <FloatingDot key={`accent-${index}`} {...accent} />
        ))}
        <View
          className="rounded-2xl"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.2,
            shadowRadius: 16,
            elevation: 6,
          }}
        >
          {/* The in-flow snapshot defines the card size; absolute siblings
              (chips, play, duration) align to it. Explicit Image dimensions:
              absoluteFill mis-measures under the new architecture. */}
          <View className="h-56 w-[126px] overflow-hidden rounded-2xl bg-studio">
            {/* Overscan shifted so the subject's face sits centered */}
            <Image
              source={DEMO_SNAPSHOT}
              style={{ position: 'absolute', top: -14, left: 0, width: 142, height: 252 }}
              resizeMode="cover"
            />
          </View>

          {/* Play button, centered on the card */}
          <View
            className="items-center justify-center"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-black/35">
              <Icon name="play" size={20} color="#FFFFFF" style={{ marginLeft: 2 }} />
            </View>
          </View>

          {/* B-roll chip */}
          <View className="absolute -right-9 top-8 rounded-full bg-primary px-3 py-1.5">
            <Text className="font-heading text-[11px] text-white">{t('onboarding.broll')}</Text>
          </View>

          {/* Subtitles chip */}
          <View
            className="absolute -left-5 top-44 rounded-full px-3 py-1.5"
            style={{ backgroundColor: '#D97706' }}
          >
            <Text className="font-heading text-[11px] text-white">{t('onboarding.subtitles')}</Text>
          </View>

          {/* Duration */}
          <View className="absolute right-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5">
            <Text className="font-mono-semibold text-[10px] text-white">0:12</Text>
          </View>
        </View>
      </View>

      {/* Destination */}
      <View className="flex-row items-center rounded-full bg-primary-tint px-4 py-2.5">
        <Icon name="sparkles" size={14} color="#3C3FEF" style={{ marginRight: 6 }} />
        <Text className="font-heading text-[13px] text-primary">{t('onboarding.jupitrr')}</Text>
      </View>
    </View>
  );
}
