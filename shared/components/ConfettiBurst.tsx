import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

// Studio Pop celebration mix (DESIGN.md): confetti fires once on wrap/success
// screens using the blue/coral/amber/green mix. Celebration is one of the two
// sanctioned coral moments.
const CONFETTI_COLORS = ['#3C3FEF', '#EE6061', '#D97706', '#1E9E6A'];

const PIECE_COUNT = 42;
const MIN_DURATION_MS = 1900;
const MAX_EXTRA_DURATION_MS = 900;
const MAX_DELAY_MS = 500;

interface PieceSpec {
  startX: number;
  width: number;
  height: number;
  color: string;
  borderRadius: number;
  delay: number;
  duration: number;
  sway: number;
  spinDegrees: number;
  progress: Animated.Value;
}

function createPieces(screenWidth: number): PieceSpec[] {
  return Array.from({ length: PIECE_COUNT }, (_, index) => {
    const size = 6 + Math.random() * 5;
    const isRound = index % 4 === 0;
    return {
      startX: Math.random() * screenWidth,
      width: size,
      height: isRound ? size : size * 1.6,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length] ?? '#3C3FEF',
      borderRadius: isRound ? size : 2,
      delay: Math.random() * MAX_DELAY_MS,
      duration: MIN_DURATION_MS + Math.random() * MAX_EXTRA_DURATION_MS,
      sway: 16 + Math.random() * 40,
      spinDegrees: (Math.random() < 0.5 ? -1 : 1) * (540 + Math.random() * 720),
      progress: new Animated.Value(0),
    };
  });
}

interface ConfettiBurstProps {
  /** Called once every piece has settled and the overlay has removed itself. */
  onComplete?: () => void;
}

/**
 * One-shot full-screen confetti rain. Mount it on a success screen and it
 * fires immediately, then unmounts its own pieces. Touches pass through.
 */
export function ConfettiBurst({ onComplete }: ConfettiBurstProps) {
  const { width, height } = useWindowDimensions();
  const [done, setDone] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const pieces = useMemo(() => createPieces(width), [width]);

  useEffect(() => {
    const animations = pieces.map((piece) =>
      Animated.timing(piece.progress, {
        toValue: 1,
        duration: piece.duration,
        delay: piece.delay,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      })
    );
    Animated.parallel(animations).start();

    const timer = setTimeout(
      () => {
        setDone(true);
        onCompleteRef.current?.();
      },
      MAX_DELAY_MS + MIN_DURATION_MS + MAX_EXTRA_DURATION_MS
    );

    return () => {
      clearTimeout(timer);
      animations.forEach((animation) => animation.stop());
    };
  }, [pieces]);

  if (done) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.overlay]}>
      {pieces.map((piece, index) => (
        <Animated.View
          key={`confetti-${index}`}
          style={[
            styles.piece,
            {
              left: piece.startX,
              width: piece.width,
              height: piece.height,
              backgroundColor: piece.color,
              borderRadius: piece.borderRadius,
              opacity: piece.progress.interpolate({
                inputRange: [0, 0.75, 1],
                outputRange: [1, 1, 0],
              }),
              transform: [
                {
                  translateY: piece.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, height + 48],
                  }),
                },
                {
                  translateX: piece.progress.interpolate({
                    inputRange: [0, 0.25, 0.5, 0.75, 1],
                    outputRange: [0, piece.sway, -piece.sway * 0.6, piece.sway * 0.8, 0],
                  }),
                },
                {
                  rotate: piece.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', `${piece.spinDegrees}deg`],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    zIndex: 50,
  },
  piece: {
    position: 'absolute',
    top: -24,
  },
});
