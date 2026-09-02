/**
 * Video Processing Service - Native video export with stitching
 */

import { File, Paths } from 'expo-file-system';
import * as VideoThumbnails from 'expo-video-thumbnails';

import VideoExportModule, {
  type ClipConfig,
  type ExportSettings,
} from '../../modules/video-export';

export interface ProcessableClip {
  sourceUri: string;
  durationSeconds: number;
  startTime?: number;
  endTime?: number;
}

export class VideoProcessor {
  /**
   * Export project with full stitching support
   */
  static async exportProject(
    clips: ProcessableClip[],
    settings: Partial<ExportSettings> = {},
    onProgress?: (progress: number) => void
  ): Promise<string> {
    if (!clips || clips.length === 0) {
      throw new Error('No clips provided for export');
    }

    // Report initial progress
    if (onProgress) onProgress(10);

    // Convert app clips to export format
    const exportClips: ClipConfig[] = clips.map((clip) => ({
      sourceUri: clip.sourceUri,
      startTime: clip.startTime ?? 0,
      ...(clip.endTime != null ? { endTime: clip.endTime } : {}),
      speed: 1.0,
      volume: 1.0,
      crop: {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
      type: 'video',
    }));

    // Generate output path
    const timestamp = Date.now();
    const format = settings.format ?? 'mp4';
    const outputFile = new File(Paths.document, `export_${timestamp}.${format}`);
    const outputPath = outputFile.uri;

    // Progress simulation (native module doesn't support progress yet)
    if (onProgress) onProgress(20);

    // Merge with default settings
    const finalSettings: ExportSettings = {
      quality: settings.quality ?? 'high',
      format: settings.format ?? 'mp4',
      resolution: settings.resolution ?? '2k',
    };

    // Export using native module
    const result = await VideoExportModule.exportVideo(exportClips, outputPath, finalSettings);

    // Final progress
    if (onProgress) onProgress(100);

    return result.path;
  }

  /**
   * Beautify a recorded clip: run face-detected skin smoothing (iOS Vision /
   * Android ML Kit). Writes a new file in the document directory and returns its
   * URI. Caller is responsible for deleting the previous file from its store.
   *
   * Source location handling:
   *  - simulator:// URIs → rejected (no real frames).
   *  - file:// or absolute paths → passed straight through to native.
   *  - http(s):// URIs (imported clips from Jupitrr CDN) → downloaded to a temp
   *    file in the cache directory first, because the native modules (AVAsset on
   *    iOS, Media3 Transformer on Android) refuse remote URIs. The temp file is
   *    cleaned up after beautify completes or throws.
   */
  static async beautifyVideo(
    sourceUri: string,
    projectId: string,
    clipIndex: number,
    intensity: number = 0.7
  ): Promise<string> {
    if (sourceUri.startsWith('simulator://')) {
      throw new Error('Cannot beautify simulator recordings');
    }

    const isRemote = /^https?:\/\//i.test(sourceUri);
    let tempSource: File | null = null;
    let nativeSourceUri = sourceUri;

    if (isRemote) {
      // Download to cache (not document) so the system can reclaim space if needed.
      // We delete it ourselves in the finally below anyway.
      tempSource = new File(
        Paths.cache,
        `beautify_src_${projectId}_${clipIndex}_${Date.now()}.mp4`
      );
      if (tempSource.exists) {
        try {
          await tempSource.delete();
        } catch {
          // downloadFileAsync overwrites — fine if delete fails
        }
      }
      await File.downloadFileAsync(sourceUri, tempSource);
      if (!tempSource.exists) {
        throw new Error(`Failed to download source video for beautify: ${sourceUri}`);
      }
      nativeSourceUri = tempSource.uri;
    }

    try {
      const timestamp = Date.now();
      const outputFile = new File(
        Paths.document,
        `clip_${projectId}_${clipIndex}_beauty_${timestamp}.mp4`
      );
      const result = await VideoExportModule.beautifyVideo(
        nativeSourceUri,
        outputFile.uri,
        intensity
      );
      return result.path;
    } finally {
      if (tempSource) {
        try {
          await tempSource.delete();
        } catch {
          // Best-effort cleanup; cache files get reclaimed by the OS eventually.
        }
      }
    }
  }

  /**
   * Generate a unique filename for a recorded clip
   */
  static generateClipFilename(projectId: string, clipIndex: number): string {
    const timestamp = Date.now();
    return `clip_${projectId}_${clipIndex}_${timestamp}.mp4`;
  }

  /**
   * Get the full path for a clip file
   */
  static getClipPath(filename: string): string {
    const file = new File(Paths.document, filename);
    return file.uri;
  }

  /**
   * Check if a video file exists
   */
  static async videoExists(uri: string): Promise<boolean> {
    try {
      const file = new File(uri);
      return file.exists;
    } catch {
      return false;
    }
  }

  /**
   * Generate a thumbnail from a video file
   */
  static async generateThumbnail(
    videoUri: string,
    projectId: string,
    clipIndex: number
  ): Promise<string | undefined> {
    try {
      // Skip simulator URIs
      if (videoUri.startsWith('simulator://')) return undefined;

      const { uri: cacheUri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 500 });

      // Move from cache to documents directory
      const timestamp = Date.now();
      const destFile = new File(Paths.document, `thumb_${projectId}_${clipIndex}_${timestamp}.jpg`);
      const sourceFile = new File(cacheUri);
      await sourceFile.move(destFile);

      return destFile.uri;
    } catch {
      return undefined;
    }
  }

  /**
   * Delete a thumbnail file
   */
  static async deleteThumbnail(uri: string): Promise<void> {
    return VideoProcessor.deleteVideo(uri);
  }

  /**
   * Delete a video file
   */
  static async deleteVideo(uri: string): Promise<void> {
    try {
      const file = new File(uri);
      if (file.exists) {
        await file.delete();
      }
    } catch {
      // Silently ignore delete failures
    }
  }
}
