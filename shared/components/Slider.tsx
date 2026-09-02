import React, { useRef } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  minimumTrackColor?: string;
  maximumTrackColor?: string;
  thumbColor?: string;
  testID?: string;
}

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 4;

/**
 * Lightweight, dependency-free slider built on PanResponder.
 * Supports tap-to-set and drag. Snaps to `step`.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  minimumTrackColor = '#3C3FEF',
  maximumTrackColor = '#E5E7EB',
  thumbColor = '#3C3FEF',
  testID,
}: SliderProps) {
  const widthRef = useRef(0);
  // Keep latest props in a ref so the PanResponder (created once) never reads stale values.
  const cfgRef = useRef({ min, max, step, value, onChange });
  cfgRef.current = { min, max, step, value, onChange };

  const emitFromX = (x: number) => {
    const { min: lo, max: hi, step: s, onChange: cb } = cfgRef.current;
    const width = widthRef.current;
    if (width <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / width));
    const raw = lo + ratio * (hi - lo);
    const snapped = Math.round((raw - lo) / s) * s + lo;
    cb(Math.max(lo, Math.min(hi, snapped)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => emitFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => emitFromX(e.nativeEvent.locationX),
    })
  ).current;

  const handleLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  const ratio = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) : 0;

  return (
    <View
      testID={testID}
      onLayout={handleLayout}
      hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
      style={{ height: THUMB_SIZE, justifyContent: 'center' }}
      {...responder.panHandlers}
    >
      {/* Background track */}
      <View
        style={{
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: maximumTrackColor,
        }}
      />
      {/* Filled track */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          height: TRACK_HEIGHT,
          width: `${ratio * 100}%`,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: minimumTrackColor,
        }}
      />
      {/* Thumb */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: `${ratio * 100}%`,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          marginLeft: -THUMB_SIZE / 2,
          borderRadius: THUMB_SIZE / 2,
          backgroundColor: '#FFFFFF',
          borderWidth: 2,
          borderColor: thumbColor,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.2,
          shadowRadius: 2,
          elevation: 2,
        }}
      />
    </View>
  );
}
