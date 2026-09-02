import { requireOptionalNativeModule } from 'expo-modules-core';

export interface TeleprompterPipConfig {
  text: string;
  fontSize: number;
  fontFamily?: string;
  scrollSpeed: number;
  preparationDelaySeconds: number;
  width?: number;
  height?: number;
  autoBackgroundAfterStart?: boolean;
}

interface TeleprompterPipModuleType {
  startTeleprompterPip(config: TeleprompterPipConfig): Promise<void>;
  stopTeleprompterPip(): Promise<void>;
}

const nativeModule = requireOptionalNativeModule<TeleprompterPipModuleType>('TeleprompterPip');

const notAvailable = (): Promise<never> =>
  Promise.reject(new Error('TeleprompterPip native module is not available on this platform'));

const TeleprompterPipModule: TeleprompterPipModuleType = {
  startTeleprompterPip: nativeModule
    ? (config) => nativeModule.startTeleprompterPip(config)
    : () => notAvailable(),
  stopTeleprompterPip: nativeModule
    ? () => nativeModule.stopTeleprompterPip()
    : () => notAvailable(),
};

export default TeleprompterPipModule;
