/**
 * VideoExportModule - Native iOS module for video export
 *
 * This module provides a bridge to native iOS code for stitching
 * and exporting video clips with various transformations.
 */

import { NativeModules, Platform } from 'react-native';

export interface AudioLevel {
  timeMs: number;
  volumeDb: number;
}

// Type definitions for the native module
interface VideoExportModuleInterface {
  exportVideo(
    clips: ClipConfig[],
    outputPath: string,
    settings: ExportSettings
  ): Promise<ExportResult>;
  analyzeAudioLevels(videoUri: string, chunkMs: number): Promise<AudioLevel[]>;
}

// Clip configuration interface
export interface ClipConfig {
  /** Source video file path (file:// URI or absolute path) */
  sourceUri: string;

  /** Trim start time in seconds */
  startTime: number;

  /** Trim end time in seconds */
  endTime?: number;

  /** Playback speed multiplier (0.5 = half speed, 2.0 = double speed) */
  speed: number;

  /** Audio volume (0.0 = mute, 1.0 = normal, 2.0 = double volume) */
  volume: number;

  /** Crop settings as percentages (0-100) */
  crop: {
    x: number; // Horizontal offset percentage
    y: number; // Vertical offset percentage
    width: number; // Crop width percentage
    height: number; // Crop height percentage
  };

  /** Clip type - currently only video is fully supported */
  type?: 'video' | 'image';
}

// Export settings interface
export interface ExportSettings {
  /** Video quality preset */
  quality: 'low' | 'medium' | 'high';

  /** Output format */
  format: 'mp4' | 'mov';

  /** Output resolution */
  resolution: '720p' | '1080p' | '2k' | '4k';
}

// Export result interface
export interface ExportResult {
  /** Path to the exported video file */
  path: string;

  /** Export success status */
  success: boolean;
}

// Get the native module
const { VideoExportModule: NativeVideoExportModule } = NativeModules;

// Type-safe wrapper class
class VideoExportModuleWrapper implements VideoExportModuleInterface {
  /**
   * Export video clips to a single file
   *
   * @example
   * ```typescript
   * const result = await VideoExportModule.exportVideo(
   *   [
   *     {
   *       sourceUri: 'file:///path/to/video1.mp4',
   *       startTime: 0,
   *       endTime: 10,
   *       speed: 1.0,
   *       volume: 1.0,
   *       crop: { x: 0, y: 0, width: 100, height: 100 }
   *     },
   *     {
   *       sourceUri: 'file:///path/to/video2.mp4',
   *       startTime: 5,
   *       endTime: 15,
   *       speed: 1.5,
   *       volume: 0.8,
   *       crop: { x: 10, y: 10, width: 80, height: 80 }
   *     }
   *   ],
   *   '/path/to/output.mp4',
   *   {
   *     quality: 'high',
   *     format: 'mp4',
   *     resolution: '1080p'
   *   }
   * );
   *
   * console.log('Exported to:', result.path);
   * ```
   */
  async analyzeAudioLevels(videoUri: string, chunkMs: number = 20): Promise<AudioLevel[]> {
    if (Platform.OS !== 'ios') {
      throw new Error('VideoExportModule is only available on iOS');
    }
    if (!NativeVideoExportModule) {
      throw new Error('VideoExportModule native module not found. Did you run pod install?');
    }
    if (!videoUri) {
      throw new Error('videoUri is required');
    }
    if (chunkMs <= 0) {
      throw new Error('chunkMs must be > 0');
    }
    return await NativeVideoExportModule.analyzeAudioLevels(videoUri, chunkMs);
  }

  async exportVideo(
    clips: ClipConfig[],
    outputPath: string,
    settings: ExportSettings
  ): Promise<ExportResult> {
    // Validate platform
    if (Platform.OS !== 'ios') {
      throw new Error('VideoExportModule is only available on iOS');
    }

    // Validate native module
    if (!NativeVideoExportModule) {
      throw new Error('VideoExportModule native module not found. Did you run pod install?');
    }

    // Validate inputs
    if (!clips || clips.length === 0) {
      throw new Error('At least one clip is required for export');
    }

    if (!outputPath) {
      throw new Error('Output path is required');
    }

    // Validate each clip
    clips.forEach((clip, index) => {
      if (!clip.sourceUri) {
        throw new Error(`Clip ${index}: sourceUri is required`);
      }
      if (clip.startTime < 0) {
        throw new Error(`Clip ${index}: startTime must be >= 0`);
      }
      if (clip.endTime != null && clip.endTime <= clip.startTime) {
        throw new Error(`Clip ${index}: endTime must be > startTime`);
      }
      if (clip.speed <= 0) {
        throw new Error(`Clip ${index}: speed must be > 0`);
      }
      if (clip.volume < 0) {
        throw new Error(`Clip ${index}: volume must be >= 0`);
      }
    });

    // Call native module
    try {
      const result = await NativeVideoExportModule.exportVideo(clips, outputPath, settings);
      return result;
    } catch (error) {
      // Re-throw with better error message
      if (error instanceof Error) {
        throw new Error(`Video export failed: ${error.message}`);
      }
      throw error;
    }
  }
}

// Export singleton instance
export const VideoExportModule = new VideoExportModuleWrapper();

// Default export for convenience
export default VideoExportModule;
