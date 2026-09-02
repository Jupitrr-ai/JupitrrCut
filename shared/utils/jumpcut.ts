import type { AudioLevel } from '@/lib/services/VideoExportModule';

export interface JumpcutSegment {
  startTime: number;
  endTime: number;
}

/** Quiet percentile for noise floor; lower = stricter (use quietest 5% only). */
const NOISE_QUIET_PERCENTILE = 0.05;
/** dB above noise to enter speech (start segment); higher = stricter, only louder counts. */
const SPEECH_ENTER_OFFSET_DB = 14;
/** dB above noise to leave speech (end segment); higher = stricter end (cut tail sooner). */
const SPEECH_LEAVE_OFFSET_DB = 11;
/** Minimum segment length in seconds. */
const MIN_SEGMENT_LENGTH_S = 0.2;
/** Consecutive above-enter frames to trigger speech; more = stricter (avoid marginal noise). */
const ENTER_DEBOUNCE_CHUNKS = 6;
/** Consecutive below-leave frames before considering end; fewer = stricter end, more = spare words in middle. */
const LEAVE_DEBOUNCE_CHUNKS = 4;
/** Hangover after last frame above leave threshold (ms); shorter = stricter end (tighter tail). */
const HANGOVER_MS = 120;

/** Stricter logic only in the ending part of the clip (last fraction of duration). */
const END_ZONE_FRACTION = 0.1;
/** dB above noise to leave speech in the end zone; higher = cut tail even sooner. */
const SPEECH_LEAVE_OFFSET_DB_END = 14;
/** Consecutive below-leave frames to end segment when in end zone. */
const LEAVE_DEBOUNCE_CHUNKS_END = 1;
/** Hangover in end zone (ms); shorter = tighter tail. */
const HANGOVER_MS_END = 30;

/** Set to true to log thresholds, segments, and levels around segment ends (for early cut-off debugging). */
const DEBUG_VAD = false;

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.floor(p * s.length), s.length - 1);
  return s[idx]!;
}

/**
 * Short-time energy VAD with hysteresis + hangover (JS-friendly).
 *
 * - Noise floor = quiet percentile (10th) of all frames.
 * - startThreshold = noise + 10 dB, endThreshold = noise + 6 dB (hysteresis).
 * - Enter: N consecutive frames above start (e.g. 5 × 20ms).
 * - Hangover: keep segment on for HANGOVER_MS after last frame above end.
 */
export function detectKeepSegments(levels: AudioLevel[], videoDurationS: number): JumpcutSegment[] {
  if (levels.length === 0) return [];

  const chunkDurationS =
    levels.length > 1 ? (levels[1]!.timeMs - levels[0]!.timeMs) / 1000 : videoDurationS;
  const hangoverS = HANGOVER_MS / 1000;

  const noiseFloorDb = percentile(
    levels.map((l) => l.volumeDb),
    NOISE_QUIET_PERCENTILE
  );
  const speechEnterDb = noiseFloorDb + SPEECH_ENTER_OFFSET_DB;
  const speechLeaveDb = noiseFloorDb + SPEECH_LEAVE_OFFSET_DB;
  const speechLeaveDbStrict = noiseFloorDb + SPEECH_LEAVE_OFFSET_DB_END;
  const endZoneStartS = videoDurationS * (1 - END_ZONE_FRACTION);
  const hangoverSEnd = HANGOVER_MS_END / 1000;

  if (DEBUG_VAD) {
    console.log(
      '[jumpcut] noiseFloorDb:',
      noiseFloorDb.toFixed(1),
      'enter:',
      speechEnterDb.toFixed(1),
      'leave:',
      speechLeaveDb.toFixed(1),
      'chunkDurationS:',
      chunkDurationS,
      'videoDurationS:',
      videoDurationS
    );
  }

  const raw: JumpcutSegment[] = [];
  let segStart: number | null = null;
  let aboveEnterCount = 0;
  /** Time of first frame in current above-enter run (so we don't clip start). */
  let runStartTimeS: number | null = null;
  let belowLeaveCount = 0;
  let lastAboveLeaveEndTimeS: number | null = null;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]!;
    const timeS = level.timeMs / 1000;
    const frameEndS = timeS + chunkDurationS;
    const inEndZone = timeS >= endZoneStartS;
    const aboveEnter = level.volumeDb >= speechEnterDb;
    const aboveLeave = inEndZone
      ? level.volumeDb >= speechLeaveDbStrict
      : level.volumeDb >= speechLeaveDb;

    if (aboveEnter) {
      if (aboveEnterCount === 0) runStartTimeS = timeS;
      aboveEnterCount++;
      belowLeaveCount = 0;
      if (segStart === null && aboveEnterCount >= ENTER_DEBOUNCE_CHUNKS && runStartTimeS != null) {
        segStart = runStartTimeS;
      }
    } else {
      aboveEnterCount = 0;
      runStartTimeS = null;
    }

    if (aboveLeave && segStart !== null) {
      lastAboveLeaveEndTimeS = frameEndS;
    }

    if (!aboveLeave) {
      belowLeaveCount++;
      const leaveDebounce = inEndZone ? LEAVE_DEBOUNCE_CHUNKS_END : LEAVE_DEBOUNCE_CHUNKS;
      if (segStart !== null && belowLeaveCount >= leaveDebounce) {
        const useStrictHangover =
          lastAboveLeaveEndTimeS != null && lastAboveLeaveEndTimeS >= endZoneStartS;
        const hangover = useStrictHangover ? hangoverSEnd : hangoverS;
        const endTime =
          lastAboveLeaveEndTimeS != null
            ? Math.min(videoDurationS, lastAboveLeaveEndTimeS + hangover)
            : timeS + chunkDurationS;
        raw.push({ startTime: segStart, endTime });
        segStart = null;
        belowLeaveCount = 0;
        lastAboveLeaveEndTimeS = null;
      }
    } else {
      belowLeaveCount = 0;
    }
  }

  if (segStart !== null) {
    const useStrictHangover =
      lastAboveLeaveEndTimeS != null && lastAboveLeaveEndTimeS >= endZoneStartS;
    const hangover = useStrictHangover ? hangoverSEnd : hangoverS;
    const endTime =
      lastAboveLeaveEndTimeS != null
        ? Math.min(videoDurationS, lastAboveLeaveEndTimeS + hangover)
        : videoDurationS;
    raw.push({ startTime: segStart, endTime });
  }

  if (raw.length === 0) return [];

  if (DEBUG_VAD) {
    console.log(
      '[jumpcut] raw segments:',
      raw.map((s) => ({ start: s.startTime.toFixed(2), end: s.endTime.toFixed(2) }))
    );
  }

  // Extend boundaries only until volume drops to speechLeaveDb (not to noise floor)
  const extended = raw.map((seg) => {
    let extStart = seg.startTime;
    for (let i = levels.length - 1; i >= 0; i--) {
      const l = levels[i]!;
      const timeS = l.timeMs / 1000;
      if (timeS >= extStart) continue;
      if (l.volumeDb >= speechLeaveDb) {
        extStart = timeS;
      } else {
        break;
      }
    }

    let extEnd = seg.endTime;
    for (let i = 0; i < levels.length; i++) {
      const l = levels[i]!;
      const timeS = l.timeMs / 1000;
      if (timeS < extEnd) continue;
      const leaveThreshold = timeS >= endZoneStartS ? speechLeaveDbStrict : speechLeaveDb;
      if (l.volumeDb >= leaveThreshold) {
        extEnd = timeS + chunkDurationS;
      } else {
        break;
      }
    }

    return {
      startTime: Math.max(0, extStart),
      endTime: Math.min(videoDurationS, extEnd),
    };
  });

  if (DEBUG_VAD) {
    console.log(
      '[jumpcut] extended segments:',
      extended.map((s) => ({ start: s.startTime.toFixed(2), end: s.endTime.toFixed(2) }))
    );
  }

  const filtered = extended.filter((s) => s.endTime - s.startTime >= MIN_SEGMENT_LENGTH_S);
  if (filtered.length === 0) return [];

  const merged: JumpcutSegment[] = [{ ...filtered[0]! }];
  for (let i = 1; i < filtered.length; i++) {
    const prev = merged[merged.length - 1]!;
    const curr = filtered[i]!;
    if (curr.startTime <= prev.endTime) {
      prev.endTime = Math.max(prev.endTime, curr.endTime);
    } else {
      merged.push({ ...curr });
    }
  }

  if (DEBUG_VAD) {
    console.log(
      '[jumpcut] final segments:',
      merged.map((s) => ({ start: s.startTime.toFixed(2), end: s.endTime.toFixed(2) }))
    );
    for (const seg of merged) {
      const endMs = seg.endTime * 1000;
      const window = levels.filter((l) => l.timeMs >= endMs - 600 && l.timeMs <= endMs + 400);
      const aboveLeave = window.filter((l) => l.volumeDb >= speechLeaveDb);
      console.log(
        `[jumpcut] segment end ${seg.endTime.toFixed(2)}s: levels 0.6s before → 0.4s after:`,
        window.map((l) => `${(l.timeMs / 1000).toFixed(2)}s=${l.volumeDb.toFixed(0)}`).join(', ')
      );
      if (aboveLeave.length > 0) {
        console.log(
          `[jumpcut] ^ ${aboveLeave.length} frames AFTER segment end are still above leave (${speechLeaveDb.toFixed(0)} dB) — possible early cut`
        );
      }
    }
  }

  return merged;
}
