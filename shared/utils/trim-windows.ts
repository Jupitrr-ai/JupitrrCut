import type { JumpcutSegment } from '@shared/utils/jumpcut';

/** A stretch of a source clip that survives into the final cut. A clip keeps a
 * LIST of these: one after auto-trim, more once the user splits it. Every
 * window belongs to the same script section — splitting never creates a new
 * clip row, it only carves the existing one into pieces. */
export interface KeptWindow {
  start: number;
  end: number;
}

/** Shortest window a drag or split may produce (s). */
export const MIN_WINDOW_S = 0.2;

/** Windows within this distance count as touching — i.e. a split seam with no
 * material removed between the two pieces yet. */
export const SEAM_EPSILON_S = 0.01;

export function windowsFromSegments(segments: JumpcutSegment[] | undefined): KeptWindow[] {
  if (!segments || segments.length === 0) return [];
  return segments
    .map((s) => ({ start: s.startTime, end: s.endTime }))
    .sort((a, b) => a.start - b.start);
}

export function segmentsFromWindows(windows: KeptWindow[]): JumpcutSegment[] {
  return windows.map((w) => ({ startTime: w.start, endTime: w.end }));
}

/** Total kept time across all windows. */
export function keptDuration(windows: KeptWindow[] | undefined, fallback = 0): number {
  if (!windows || windows.length === 0) return fallback;
  return windows.reduce((sum, w) => sum + Math.max(0, w.end - w.start), 0);
}

/** Map a source timestamp to its position in kept time. Times inside a removed
 * stretch collapse onto the end of the preceding kept window. */
export function sourceToKeptTime(windows: KeptWindow[], sourceT: number): number {
  let acc = 0;
  for (const w of windows) {
    if (sourceT < w.start) return acc;
    if (sourceT <= w.end) return acc + (sourceT - w.start);
    acc += w.end - w.start;
  }
  return acc;
}

/** Inverse of sourceToKeptTime: where a kept-time offset lands in the source. */
export function keptTimeToSource(windows: KeptWindow[], keptT: number): number {
  if (windows.length === 0) return keptT;
  const clamped = Math.max(0, keptT);
  let acc = 0;
  for (const w of windows) {
    const span = Math.max(0, w.end - w.start);
    if (clamped <= acc + span) return w.start + (clamped - acc);
    acc += span;
  }
  return windows[windows.length - 1]!.end;
}

/** The stretches NOT kept — head, tail, and any gap opened by trimming a split
 * seam apart. These are what the filmstrip dims. */
export function removedRanges(windows: KeptWindow[], sourceDurationS: number): KeptWindow[] {
  const out: KeptWindow[] = [];
  let cursor = 0;
  for (const w of windows) {
    if (w.start > cursor) out.push({ start: cursor, end: w.start });
    cursor = Math.max(cursor, w.end);
  }
  if (cursor < sourceDurationS) out.push({ start: cursor, end: sourceDurationS });
  return out;
}

/** Index of the window containing a source timestamp, or -1 inside a removed stretch. */
export function windowIndexAt(windows: KeptWindow[], sourceT: number): number {
  return windows.findIndex((w) => sourceT >= w.start && sourceT <= w.end);
}

/** True when splitting at `sourceT` would leave two usable pieces. */
export function canSplitAt(
  windows: KeptWindow[],
  sourceT: number,
  minSpan = MIN_WINDOW_S
): boolean {
  const i = windowIndexAt(windows, sourceT);
  if (i === -1) return false;
  const w = windows[i]!;
  return sourceT - w.start >= minSpan && w.end - sourceT >= minSpan;
}

/** Cut the window under `sourceT` in two at that point. The halves touch (no
 * material is dropped) — the user then drags the seam handles apart to remove
 * what they don't want. Returns null when the split isn't valid. */
export function splitWindowsAt(
  windows: KeptWindow[],
  sourceT: number,
  minSpan = MIN_WINDOW_S
): KeptWindow[] | null {
  if (!canSplitAt(windows, sourceT, minSpan)) return null;
  const i = windowIndexAt(windows, sourceT);
  const w = windows[i]!;
  return [
    ...windows.slice(0, i),
    { start: w.start, end: sourceT },
    { start: sourceT, end: w.end },
    ...windows.slice(i + 1),
  ];
}

/** Whether two neighbouring windows still meet at a split seam. */
export function touchesNext(windows: KeptWindow[], i: number, eps = SEAM_EPSILON_S): boolean {
  const cur = windows[i];
  const next = windows[i + 1];
  if (!cur || !next) return false;
  return next.start - cur.end <= eps;
}

/** Drop windows that a drag collapsed to nothing, keeping the list sorted. */
export function normalizeWindows(windows: KeptWindow[], minSpan = MIN_WINDOW_S): KeptWindow[] {
  return windows.filter((w) => w.end - w.start >= minSpan - 1e-6).sort((a, b) => a.start - b.start);
}
