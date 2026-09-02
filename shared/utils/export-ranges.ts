import type { JumpcutSegment } from '@shared/utils/jumpcut';
import { isSimulatorRecording } from '@shared/utils/video';

/** Minimal shape the exporter needs from a clip row. */
export interface ExportSourceClip {
  index: number;
  videoUri?: string;
  durationSeconds?: number;
}

/** One contiguous range handed to the native stitcher. A clip contributes one
 * range when untrimmed, or one per kept window once it has been trimmed or
 * split — the stitcher concatenates them in order. */
export interface ExportRange {
  sourceUri: string;
  durationSeconds: number;
  startTime?: number;
  endTime?: number;
}

/** Flatten clips (plus their kept windows) into the ranges the exporter writes.
 *
 * A split clip yields several ranges from ONE source file: no re-encoding, and
 * every piece stays tied to the same script section it came from. Clips with no
 * segments are emitted whole — deliberately WITHOUT start/end, which the native
 * side reads as "use the entire track". */
export function buildExportRanges(
  clips: ExportSourceClip[],
  segmentsByIndex: Record<number, JumpcutSegment[]> | null | undefined
): ExportRange[] {
  const ranges: ExportRange[] = [];
  for (const clip of clips) {
    if (!clip.videoUri || !clip.durationSeconds || isSimulatorRecording(clip.videoUri)) continue;
    const segments = segmentsByIndex?.[clip.index];
    if (segments && segments.length > 0) {
      for (const seg of segments) {
        const durationSeconds = seg.endTime - seg.startTime;
        if (durationSeconds <= 0) continue;
        ranges.push({
          sourceUri: clip.videoUri,
          durationSeconds,
          startTime: seg.startTime,
          endTime: seg.endTime,
        });
      }
    } else {
      ranges.push({ sourceUri: clip.videoUri, durationSeconds: clip.durationSeconds });
    }
  }
  return ranges;
}

/** Duration of the file about to be written, summed from the exact ranges handed
 * to the exporter so it can never drift from the real output. */
export function exportDuration(ranges: ExportRange[]): number {
  return ranges.reduce((sum, r) => sum + r.durationSeconds, 0);
}
