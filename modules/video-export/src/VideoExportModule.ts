import { requireOptionalNativeModule } from 'expo-modules-core';

export interface ClipConfig {
  sourceUri: string;
  startTime: number;
  endTime?: number;
  speed: number;
  volume: number;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  type?: string;
}

export interface ExportSettings {
  quality: 'low' | 'medium' | 'high';
  format: 'mp4' | 'mov';
  resolution: '720p' | '1080p' | '2k' | '4k';
}

export interface ExportResult {
  path: string;
  success: boolean;
}

export interface AudioLevel {
  timeMs: number;
  volumeDb: number;
}

interface VideoExportModuleType {
  exportVideo(
    clips: ClipConfig[],
    outputPath: string,
    settings: ExportSettings
  ): Promise<ExportResult>;
  analyzeAudioLevels(videoUri: string, chunkMs: number): Promise<AudioLevel[]>;
  beautifyVideo(videoUri: string, outputPath: string, intensity: number): Promise<ExportResult>;
}

const nativeModule = requireOptionalNativeModule<VideoExportModuleType>('VideoExport');

const notAvailable = (): Promise<never> =>
  Promise.reject(new Error('VideoExport native module is not available on this platform'));

const VideoExportModule: VideoExportModuleType = {
  exportVideo: nativeModule
    ? (clips, outputPath, settings) => nativeModule.exportVideo(clips, outputPath, settings)
    : () => notAvailable(),
  analyzeAudioLevels: nativeModule
    ? (videoUri, chunkMs) => nativeModule.analyzeAudioLevels(videoUri, chunkMs)
    : () => notAvailable(),
  beautifyVideo: nativeModule
    ? (videoUri, outputPath, intensity) =>
        nativeModule.beautifyVideo(videoUri, outputPath, intensity)
    : () => notAvailable(),
};

export default VideoExportModule;
