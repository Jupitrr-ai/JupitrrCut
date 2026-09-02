import React from 'react';
import { StyleSheet, View } from 'react-native';

interface AppBackgroundProps {
  children: React.ReactNode;
}

/**
 * App-wide backdrop. Studio Pop (DESIGN.md): clean cool surface — the old
 * background image is gone; cards now sit on a flat subtle wash.
 */
export function AppBackground({ children }: AppBackgroundProps) {
  return <View style={styles.background}>{children}</View>;
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#F4F6FB',
  },
});
