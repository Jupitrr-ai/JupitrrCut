import { estimateDuration } from '@shared/utils/duration';

interface RenderTeleprompterVideoParams {
  projectId: string;
  clipIndex: number;
  text: string;
  fontFamily: string;
  textSize: number;
  scrollSpeed: number;
  preparationDelaySeconds: number;
  width: number;
  height: number;
}

export interface TeleprompterPiPVideo {
  uri: string;
  durationSeconds: number;
}

const MIN_PIP_DURATION_SECONDS = 8;
const PIP_DURATION_PADDING_SECONDS = 3;

export function estimateTeleprompterPiPDuration(text: string): number {
  return Math.max(MIN_PIP_DURATION_SECONDS, estimateDuration(text) + PIP_DURATION_PADDING_SECONDS);
}

/**
 * Cloud teleprompter PiP rendering is not part of this OSS build — it required a call to
 * Jupitrr's backend. The caller (record.tsx) already treats a rejection here as non-fatal:
 * it warns and continues the export without the PiP overlay. Kept as an async function with
 * the original signature so record.tsx needs no changes.
 */
export async function generateTeleprompterPiPVideo(
  _params: RenderTeleprompterVideoParams
): Promise<TeleprompterPiPVideo> {
  throw new Error('Cloud teleprompter rendering is not available in this build.');
}
