import { Icon } from '@shared/components/ui/Icon';
import { useEffect, useRef } from 'react';
import { Animated, Image, View } from 'react-native';

/* eslint-disable @typescript-eslint/no-require-imports -- static assets */
/* Same frames as the jump-cut slide, so a scene here is visibly the clip that shows up
   there — the two illustrations describe one continuous flow, not two examples. */
const SCENE_FRAMES = [
  require('../../../../assets/images/onboarding-clip-1.jpg'),
  require('../../../../assets/images/onboarding-clip-2.jpg'),
];
/* eslint-enable @typescript-eslint/no-require-imports */

/**
 * Miniature script editor: two auto-split scene groups divided by a dashed cut line, with a
 * blinking cursor. Each group carries the frame it was recorded as, so the pairing of script
 * line to clip is visible at a glance.
 */
/** 9:16 so the thumbnails read as phone-shot clips rather than generic photos. */
const FRAME = { width: 40, height: 71, borderRadius: 8 } as const;

export function ScriptScenesIllustration() {
  const cursorOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [cursorOpacity]);

  return (
    <View className="items-center">
      <View
        className="w-64 rounded-2xl border border-surface-line bg-white p-5"
        style={{
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 4,
        }}
      >
        {/* Scene 1 */}
        <View className="mb-4 flex-row items-start" style={{ gap: 10 }}>
          <View className="flex-1">
            <View className="mb-3 flex-row items-center">
              <View className="mr-2 h-5 w-5 items-center justify-center rounded-md bg-primary-tint">
                <Animated.Text className="font-heading text-[11px] text-primary">1</Animated.Text>
              </View>
              <View className="h-2.5 w-16 rounded-full bg-surface-line" />
            </View>
            <View className="mb-2 h-2.5 w-full rounded-full bg-surface-line" />
            <View className="h-2.5 w-4/5 rounded-full bg-surface-line" />
          </View>
          <Image source={SCENE_FRAMES[0]} style={FRAME} resizeMode="cover" />
        </View>

        {/* Auto-split cut line */}
        <View className="mb-4 flex-row items-center">
          <View
            className="h-px flex-1 border-t border-dashed"
            style={{ borderColor: '#3C3FEF', opacity: 0.4 }}
          />
          <View className="mx-2 h-6 w-6 items-center justify-center rounded-full bg-primary-tint">
            <Icon name="scissors" size={12} color="#3C3FEF" />
          </View>
          <View
            className="h-px flex-1 border-t border-dashed"
            style={{ borderColor: '#3C3FEF', opacity: 0.4 }}
          />
        </View>

        {/* Scene 2 */}
        <View className="flex-row items-start" style={{ gap: 10 }}>
          <View className="flex-1">
            <View className="mb-3 flex-row items-center">
              <View className="mr-2 h-5 w-5 items-center justify-center rounded-md bg-primary-tint">
                <Animated.Text className="font-heading text-[11px] text-primary">2</Animated.Text>
              </View>
              <View className="h-2.5 w-20 rounded-full bg-surface-line" />
            </View>
            <View className="mb-2 h-2.5 w-full rounded-full bg-surface-line" />
            <View className="flex-row items-center">
              <View className="h-2.5 w-1/2 rounded-full bg-surface-line" />
              <Animated.View
                style={{ opacity: cursorOpacity }}
                className="ml-1.5 h-4 w-0.5 rounded-full bg-primary"
              />
            </View>
          </View>
          <Image source={SCENE_FRAMES[1]} style={FRAME} resizeMode="cover" />
        </View>
      </View>
    </View>
  );
}
