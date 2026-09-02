import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Text, View } from 'react-native';

// Wider 11:16 crop so this frame shows the full-height shot without zooming
// eslint-disable-next-line @typescript-eslint/no-require-imports -- static asset
const DEMO_SNAPSHOT = require('../../../../assets/images/onboarding-demo-wide.jpg');

/**
 * The hook slide: a real talking-head demo shot inside a studio-dark camera
 * frame with the teleprompter overlay on top — the product's core promise in
 * one glance. REC pill + record button in iOS system red (DESIGN.md camera
 * rule).
 */
export function TeleprompterDemoIllustration() {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const floatY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, { toValue: 0.82, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseScale, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    );
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -5,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    float.start();
    return () => {
      pulse.stop();
      float.stop();
    };
  }, [pulseScale, floatY]);

  return (
    <View className="items-center">
      {/* Shadow + tilt + float live on the outer wrapper: overflow-hidden on
          the frame would clip the iOS shadow */}
      <Animated.View
        className="rounded-[20px]"
        style={{
          backgroundColor: '#0E0D0F',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.28,
          shadowRadius: 20,
          elevation: 8,
          transform: [{ rotate: '1.5deg' }, { translateY: floatY }],
        }}
      >
        <View className="h-64 w-44 overflow-hidden rounded-[20px] bg-studio">
          {/* Demo snapshot */}
          <Image
            source={DEMO_SNAPSHOT}
            style={{ position: 'absolute', top: 0, left: 0, width: 176, height: 256 }}
            resizeMode="cover"
          />

          {/* Teleprompter overlay */}
          <View className="mx-2 mt-2 rounded-xl bg-black/45 px-3 pb-3 pt-2.5">
            <View className="h-1.5 w-3/4 self-center rounded-full bg-white/35" />
            <View className="mt-1.5 h-2 w-full self-center rounded-full bg-white/85" />
            <View className="mt-1.5 h-1.5 w-5/6 self-center rounded-full bg-white/35" />
            <View className="mt-1.5 h-1.5 w-2/3 self-center rounded-full bg-white/35" />
          </View>

          {/* REC pill */}
          <View className="absolute left-3 top-2 flex-row items-center rounded-full bg-black/50 px-2.5 py-1">
            <View className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: '#FF3B30' }} />
            <Text className="font-mono-semibold text-[10px] text-white">0:07</Text>
          </View>

          {/* Record button */}
          <View className="absolute bottom-3 self-center" style={{ left: 0, right: 0 }}>
            <View className="h-11 w-11 items-center justify-center self-center rounded-full border-[3px] border-white">
              <Animated.View
                className="h-7 w-7 rounded-full"
                style={{ backgroundColor: '#FF3B30', transform: [{ scale: pulseScale }] }}
              />
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
