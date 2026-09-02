import { Icon } from '@shared/components/ui/Icon';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, View } from 'react-native';

/* eslint-disable @typescript-eslint/no-require-imports -- static assets */
const CLIPS = [
  require('../../../../assets/images/onboarding-clip-1.jpg'),
  require('../../../../assets/images/onboarding-clip-2.jpg'),
  require('../../../../assets/images/onboarding-clip-3.jpg'),
];
/* eslint-enable @typescript-eslint/no-require-imports */

/** raw = untrimmed takes · cutting = pauses marked for removal · trimmed = the final cut */
type Phase = 'raw' | 'cutting' | 'trimmed';

const CLIP_W: Record<Phase, number> = { raw: 84, cutting: 60, trimmed: 50 };
const GAP_W: Record<Phase, number> = { raw: 3, cutting: 34, trimmed: 3 };
const HOLD_MS: Record<Phase, number> = { raw: 900, cutting: 1300, trimmed: 1600 };
const NEXT: Record<Phase, Phase> = { raw: 'cutting', cutting: 'trimmed', trimmed: 'raw' };

const CLIP_H = 96;
const DURATION = 240;

/* Fixed spread so the burst is identical every loop — Math.random() here would make the
   celebration read as noise rather than as part of the animation. */
const CONFETTI = [
  { dx: -104, dy: -46, color: '#3C3FEF', size: 7, rotate: '20deg' },
  { dx: -72, dy: -74, color: '#EE6061', size: 5, rotate: '-35deg' },
  { dx: -34, dy: -58, color: '#F5B21A', size: 6, rotate: '10deg' },
  { dx: 0, dy: -84, color: '#1E9E6A', size: 5, rotate: '45deg' },
  { dx: 36, dy: -56, color: '#3C3FEF', size: 6, rotate: '-15deg' },
  { dx: 74, dy: -76, color: '#F5B21A', size: 5, rotate: '30deg' },
  { dx: 106, dy: -44, color: '#EE6061', size: 7, rotate: '-25deg' },
  { dx: -58, dy: -18, color: '#1E9E6A', size: 4, rotate: '60deg' },
  { dx: 58, dy: -20, color: '#3C3FEF', size: 4, rotate: '-50deg' },
];

/**
 * The jump-cut, shown as it happens: full takes spread apart to expose the dead air,
 * scissors mark each pause, then everything collapses into one tight strip. Mirrors the
 * timeline animation on the teleprompter landing page so web and app tell one story.
 */
export function AutoStitchIllustration() {
  const [phase, setPhase] = useState<Phase>('raw');

  /* Widths and padding drive layout, so these animate on the JS thread — the tree is three
     images deep, which stays smooth where a larger one would not. */
  const clipW = useRef(new Animated.Value(CLIP_W.raw)).current;
  const gapW = useRef(new Animated.Value(GAP_W.raw)).current;
  const cut = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const confetti = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timing = (value: Animated.Value, toValue: number) =>
      Animated.timing(value, {
        toValue,
        duration: DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      });

    const animation = Animated.parallel([
      timing(clipW, CLIP_W[phase]),
      timing(gapW, GAP_W[phase]),
      timing(cut, phase === 'cutting' ? 1 : 0),
      timing(ring, phase === 'trimmed' ? 1 : 0),
    ]);
    animation.start();

    /* Confetti waits out the collapse so it celebrates the finished cut, not the motion
       toward it. Reset is instant on the way out, otherwise the pieces drift back inward. */
    let burst: Animated.CompositeAnimation | undefined;
    if (phase === 'trimmed') {
      confetti.setValue(0);
      burst = Animated.timing(confetti, {
        toValue: 1,
        duration: 850,
        delay: DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });
      burst.start();
    } else {
      confetti.setValue(0);
    }

    const timer = setTimeout(() => setPhase(NEXT[phase]), HOLD_MS[phase]);
    return () => {
      animation.stop();
      burst?.stop();
      clearTimeout(timer);
    };
  }, [phase, clipW, gapW, cut, ring, confetti]);

  return (
    <View className="items-center">
      <Animated.View
        className="flex-row items-center rounded-2xl"
        style={{
          borderWidth: 3,
          borderRadius: 18,
          padding: ring.interpolate({ inputRange: [0, 1], outputRange: [0, 6] }),
          borderColor: ring.interpolate({
            inputRange: [0, 1],
            outputRange: ['rgba(60,63,239,0)', 'rgba(60,63,239,1)'],
          }),
        }}
      >
        {CLIPS.map((frame, i) => (
          <View key={i} className="flex-row items-center">
            <Animated.View
              className="overflow-hidden rounded-lg bg-studio"
              style={{ width: clipW, height: CLIP_H }}
            >
              <Image source={frame} style={{ width: '100%', height: CLIP_H }} resizeMode="cover" />
            </Animated.View>

            {i < CLIPS.length - 1 && (
              <Animated.View
                className="items-center justify-center overflow-hidden"
                style={{ width: gapW, opacity: cut }}
              >
                <View className="items-center" style={{ gap: 2 }}>
                  <View
                    className="border-l-2 border-dashed border-danger"
                    style={{ height: 22, width: 2 }}
                  />
                  <Icon name="scissors" size={16} color="#DC2626" />
                  <View
                    className="border-l-2 border-dashed border-danger"
                    style={{ height: 22, width: 2 }}
                  />
                </View>
              </Animated.View>
            )}
          </View>
        ))}
      </Animated.View>

      {/* The payoff is the number dropping, so the duration gets its own line. */}
      <View className="mt-4 flex-row items-center" style={{ gap: 6 }}>
        {/* Burst fires from behind the duration, the moment the trimmed number lands. */}
        <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
          {CONFETTI.map((c, i) => (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                width: c.size,
                height: c.size * 2,
                borderRadius: 1,
                backgroundColor: c.color,
                opacity: confetti.interpolate({
                  inputRange: [0, 0.15, 0.7, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  {
                    translateX: confetti.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, c.dx],
                    }),
                  },
                  {
                    translateY: confetti.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, c.dy],
                    }),
                  },
                  { rotate: c.rotate },
                ],
              }}
            />
          ))}
        </View>

        <Animated.Text
          className="font-mono text-[13px] text-ink-tertiary"
          style={{
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
            textDecorationLine: 'line-through',
          }}
        >
          0:12
        </Animated.Text>
        <Icon name="arrowRight" size={12} color="#8A8FA3" />
        <Animated.Text
          className="font-mono-semibold text-[15px] text-primary"
          style={{ opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) }}
        >
          0:09
        </Animated.Text>
      </View>
    </View>
  );
}
