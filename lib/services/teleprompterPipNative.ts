import { requireOptionalNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

export interface TeleprompterPipConfig {
  text: string;
  fontSize: number;
  fontFamily?: string;
  scrollSpeed: number;
  preparationDelaySeconds: number;
  /** Frame dimensions set the PiP aspect ratio. Defaults to vertical 1080x1920. */
  width?: number;
  height?: number;
  /** Attempts to background the app after PiP starts so the system PiP window appears. */
  autoBackgroundAfterStart?: boolean;
}

interface TeleprompterPipNativeModule {
  startTeleprompterPip(config: TeleprompterPipConfig): Promise<void>;
  stopTeleprompterPip(): Promise<void>;
  addListener(
    event: 'onPipStart' | 'onPipStop' | 'onPipError' | 'onPipDebug',
    listener: (payload: { message?: string }) => void
  ): EventSubscription;
}

const nativeModule = requireOptionalNativeModule<TeleprompterPipNativeModule>('TeleprompterPip');

export function isNativeTeleprompterPipAvailable(): boolean {
  return nativeModule != null;
}

export async function startNativeTeleprompterPip(config: TeleprompterPipConfig): Promise<boolean> {
  if (!nativeModule) return false;

  await nativeModule.startTeleprompterPip(config);
  return true;
}

export async function stopNativeTeleprompterPip(): Promise<void> {
  if (!nativeModule) return;

  await nativeModule.stopTeleprompterPip();
}

export interface TeleprompterPipListeners {
  onStart?: () => void;
  onStop?: () => void;
  onError?: (message?: string) => void;
  onDebug?: (message?: string) => void;
}

/**
 * Subscribe to native PiP lifecycle events. Returns a cleanup function that
 * removes all subscriptions. No-op (returns a noop cleanup) when the native
 * module is unavailable.
 */
export function addNativeTeleprompterPipListeners(
  listeners: TeleprompterPipListeners
): () => void {
  if (!nativeModule) return () => {};

  const subscriptions: EventSubscription[] = [];
  if (listeners.onStart) {
    subscriptions.push(nativeModule.addListener('onPipStart', () => listeners.onStart?.()));
  }
  if (listeners.onStop) {
    subscriptions.push(nativeModule.addListener('onPipStop', () => listeners.onStop?.()));
  }
  if (listeners.onError) {
    subscriptions.push(
      nativeModule.addListener('onPipError', (payload) => listeners.onError?.(payload?.message))
    );
  }
  if (listeners.onDebug) {
    subscriptions.push(
      nativeModule.addListener('onPipDebug', (payload) => listeners.onDebug?.(payload?.message))
    );
  }

  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}
