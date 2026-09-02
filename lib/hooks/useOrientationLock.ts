import { useFocusEffect } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback } from 'react';

type Props = {
  lock: ScreenOrientation.OrientationLock;
  onBlurLock?: ScreenOrientation.OrientationLock;
};

export function useOrientationLock({ lock, onBlurLock }: Props) {
  useFocusEffect(
    useCallback(() => {
      void ScreenOrientation.lockAsync(lock);

      return () => {
        if (onBlurLock) {
          void ScreenOrientation.lockAsync(onBlurLock);
        }
      };
    }, [lock, onBlurLock])
  );
}
