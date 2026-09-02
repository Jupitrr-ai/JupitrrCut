import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';

/* Springy per DESIGN.md. Tuned slower than the first pass — at ~350ms the entrance was
   finishing before the swipe settled and read as "no animation at all". This lands around
   450ms with a little overshoot. Only opacity/transform are driven, so the whole entrance
   runs on the native driver and never touches layout. */
const SPRING = { damping: 13, mass: 0.9, stiffness: 130 };

/**
 * Drivers for a staggered entrance, one Animated.Value per `delays` entry.
 *
 * `active` — not mount — is the trigger: these slides live in a horizontal FlatList that
 * renders neighbours ahead of time, so a mount-triggered entrance would be spent before the
 * user swiped to it. Going inactive parks the values back at 0 so returning to the slide
 * replays the entrance.
 *
 * Pass a module-level `delays` array: a fresh literal would restart the animation on every
 * render.
 */
export function useMarkEntrance(delays: readonly number[], active: boolean): Animated.Value[] {
  const values = useRef(delays.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const settle = () => values.forEach((value) => value.setValue(1));

    if (!active) {
      values.forEach((value) => value.setValue(0));
      return;
    }

    let cancelled = false;
    let animation: Animated.CompositeAnimation | undefined;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (cancelled) return;
        if (reduceMotion) {
          settle();
          return;
        }
        animation = Animated.parallel(
          values.map((value, i) =>
            Animated.spring(value, {
              toValue: 1,
              delay: delays[i],
              useNativeDriver: true,
              ...SPRING,
            })
          )
        );
        animation.start();
      })
      /* A failed reduced-motion query must never strand the marks invisible — the resting
         state is the safe fallback. */
      .catch(() => {
        if (!cancelled) settle();
      });

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [active, delays, values]);

  return values;
}

interface MarkEntranceProps {
  /** Driver from `useMarkEntrance`. Undefined renders the resting state, never a blank. */
  progress: Animated.Value | undefined;
  /** How far the mark rises into place, in px. */
  rise?: number;
  /** Starting scale — further from 1 reads as a pop, closer as a gentle settle. */
  scaleFrom?: number;
  children: ReactNode;
}

/** Wrapper that fades, lifts and scales its child into place. Purely transform-based, so it
 *  adds no layout of its own and the child keeps whatever size it already had. */
export function MarkEntrance({
  progress,
  rise = 16,
  scaleFrom = 0.92,
  children,
}: MarkEntranceProps) {
  if (!progress) return <View>{children}</View>;

  return (
    <Animated.View
      style={{
        /* Clamped because the spring overshoots past 1. translateY and scale are left
           unclamped on purpose — the overshoot is the bounce. */
        opacity: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        }),
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [scaleFrom, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
