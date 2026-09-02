import { useFreemiumGate } from '@lib/hooks/useFreemiumGate';
import {
  useClipRepository,
  useSettingsRepository,
  useStitchProjectRepository,
} from '@lib/providers/DatabaseProvider';
import { projectScope, stitchScope } from '@lib/services/freemium';
import { AppBackground } from '@shared/components/AppBackground';
import { Icon } from '@shared/components/ui/Icon';
import { IconButton } from '@shared/components/ui/IconButton';
import type { Clip, StitchProject } from '@shared/types';
import { parseClips } from '@shared/utils/clip-parser';
import { detectKeepSegments, type JumpcutSegment } from '@shared/utils/jumpcut';
import {
  canSplitAt,
  keptDuration,
  keptTimeToSource,
  type KeptWindow,
  MIN_WINDOW_S,
  removedRanges,
  segmentsFromWindows,
  sourceToKeptTime,
  splitWindowsAt,
  touchesNext,
  windowsFromSegments,
} from '@shared/utils/trim-windows';
import { isSimulatorRecording } from '@shared/utils/video';
import { loadJumpcutState, setJumpcutState } from '@stores/useJumpcutStore';
import { useProjectStore } from '@stores/useProjectStore';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { memo, useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, Pressable, StatusBar, Image, Platform, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import VideoExportModule, { type AudioLevel } from '@/modules/video-export';

/** Format seconds as M:SS.s for timeline display. */
function formatTimestamp(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const secStr = sec.toFixed(1);
  return `${m}:${sec < 10 ? '0' : ''}${secStr}`;
}

/** Format seconds for display (max 2 decimal places). */
function formatSeconds(s: number): string {
  return Number.isFinite(s) ? s.toFixed(2) : '0.00';
}

/** Merge overlapping or adjacent jumpcut segments so stitching gets clean ranges. */
function mergeOverlappingSegments(segments: JumpcutSegment[]): JumpcutSegment[] {
  if (segments.length <= 1) return segments;
  const sorted = [...segments].sort((a, b) => a.startTime - b.startTime);
  const out: JumpcutSegment[] = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1]!;
    const curr = sorted[i]!;
    if (curr.startTime <= prev.endTime) {
      prev.endTime = Math.max(prev.endTime, curr.endTime);
    } else {
      out.push(curr);
    }
  }
  return out;
}

/** Collapse to a single keep range (one start, one end) so UI shows one bar with one pair of handles. */
function toSingleSegment(segments: JumpcutSegment[]): JumpcutSegment[] {
  if (segments.length === 0) return [];
  if (segments.length === 1) return segments;
  const start = Math.min(...segments.map((s) => s.startTime));
  const end = Math.max(...segments.map((s) => s.endTime));
  return [{ startTime: start, endTime: end }];
}

/** Fallback dB range when dynamic range is too narrow. */
const DB_FALLBACK_MIN = -55;
const DB_FALLBACK_MAX = 0;

function percentileSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(Math.floor(p * sorted.length), sorted.length - 1);
  return sorted[idx]!;
}

const SEGMENT_HANDLE_WIDTH = 28;
/** Visible width of a trim handle bar. */
const TRIM_HANDLE_BAR_WIDTH = 14;
/** A touch this close (pt) to a handle belongs to the handle, not to strip scrubbing. */
const HANDLE_GRAB_RADIUS = 22;

// Android seek latency compensation: trigger seeks this many seconds before the cut boundary
// so the new frame is visible by the time the cut boundary is actually reached.
const JUMPCUT_SEEK_LOOKAHEAD_S = Platform.OS === 'android' ? 0.1 : 0.02;
// Debounce window (ms) to avoid re-issuing a seek while the previous one is settling.
const JUMPCUT_SEEK_DEBOUNCE_MS = 120;

interface FilmstripItem {
  index: number;
  thumbnailUri?: string;
  /** Evenly-spaced frames tiled across the segment (vertical slices). */
  frames?: string[];
  /** Full source duration of the clip. */
  sourceDurationS: number;
  /** Kept ranges — one after auto-trim, more once the clip is split.
   * undefined = untrimmed, whole clip kept. */
  keptWindows?: KeptWindow[];
  hasVideo: boolean;
}

/** Compact waveform band along a segment's bottom edge. Shows ONLY kept audio —
 * trimmed stretches are collapsed out of view entirely. */
const MiniWaveform = memo(function MiniWaveform({
  levels,
  windows,
  height,
}: {
  levels: AudioLevel[];
  windows?: KeptWindow[];
  height: number;
}) {
  // Sample + normalize from the FULL clip so each bar has a FIXED height;
  // the window only decides which bars are visible. Otherwise heights
  // re-normalize while dragging and the whole waveform appears to move.
  const allBars = useMemo(() => {
    if (levels.length === 0) return [];
    const step = Math.max(1, Math.floor(levels.length / 48));
    const out: { timeMs: number; volumeDb: number }[] = [];
    for (let i = 0; i < levels.length; i += step) out.push(levels[i]!);
    return out;
  }, [levels]);
  const { lo, hi } = useMemo(() => {
    if (allBars.length === 0) return { lo: DB_FALLBACK_MIN, hi: DB_FALLBACK_MAX };
    const sorted = [...allBars.map((b) => b.volumeDb)].sort((a, b) => a - b);
    const l = percentileSorted(sorted, 0.05);
    const h = percentileSorted(sorted, 0.95);
    return h - l < 2 ? { lo: DB_FALLBACK_MIN, hi: DB_FALLBACK_MAX } : { lo: l - 2, hi: h + 2 };
  }, [allBars]);
  const windowed = useMemo(() => {
    if (!windows || windows.length === 0) return allBars;
    return allBars.filter((b) => {
      const t = b.timeMs / 1000;
      return windows.some((w) => t >= w.start && t <= w.end);
    });
  }, [allBars, windows]);
  // Fit the bar count to the measured band width (~4pt per bar) so narrow
  // segments still show a legible waveform instead of zero-width slivers.
  const [bandWidth, setBandWidth] = useState(0);
  const bars = useMemo(() => {
    if (windowed.length === 0 || bandWidth <= 0) return windowed;
    const target = Math.max(5, Math.floor(bandWidth / 4));
    if (windowed.length <= target) return windowed;
    const step = windowed.length / target;
    const out: { timeMs: number; volumeDb: number }[] = [];
    for (let i = 0; i < target; i++) out.push(windowed[Math.floor(i * step)]!);
    return out;
  }, [windowed, bandWidth]);
  if (windowed.length === 0) return null;
  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row items-end justify-between gap-px px-0.5"
      style={{ height, backgroundColor: '#3235D6' }}
      pointerEvents="none"
      onLayout={(e) => setBandWidth(e.nativeEvent.layout.width)}
    >
      {bars.map((b, i) => {
        const range = hi - lo;
        const normalized = range <= 0 ? 0.5 : Math.max(0, Math.min(1, (b.volumeDb - lo) / range));
        return (
          <View
            key={`${b.timeMs}-${i}`}
            className="flex-1 rounded-sm"
            style={{
              height: Math.max(2, normalized * (height - 3)),
              backgroundColor: '#FFFFFF',
              opacity: 0.85,
            }}
          />
        );
      })}
    </View>
  );
});

/** Trim overlay for the selected segment. The card spans the clip's FULL source:
 * kept windows stay bright while everything trimmed away — head, tail, and any
 * gap opened by pulling a split seam apart — is dimmed in place. Each window
 * carries its own pair of edge handles, clamped so windows never cross. */
const TrimWindows = memo(function TrimWindows({
  windows,
  sourceDurationS,
  playbackTimeS,
  editable,
  onWindowsChange,
  onDragActiveChange,
}: {
  windows: KeptWindow[];
  sourceDurationS: number;
  playbackTimeS: number;
  editable: boolean;
  onWindowsChange?: (w: KeptWindow[]) => void;
  /** Lets the strip lock out scrubbing for the whole handle gesture. */
  onDragActiveChange?: (active: boolean) => void;
}) {
  const { t } = useTranslation();
  const [layoutWidth, setLayoutWidth] = useState(0);
  const [dragging, setDragging] = useState<{ index: number; edge: 'left' | 'right' } | null>(null);
  /** Local mirror of the windows while dragging so a handle tracks the finger
   * without waiting for the parent state round-trip. */
  const [drag, setDrag] = useState<KeptWindow[] | null>(null);
  const widthRef = useRef(0);
  const windowsRef = useRef(windows);
  const sourceRef = useRef(sourceDurationS);
  const onChangeRef = useRef(onWindowsChange);
  const onDragActiveRef = useRef(onDragActiveChange);
  const dragStartRef = useRef<KeptWindow[] | null>(null);
  widthRef.current = layoutWidth;
  windowsRef.current = windows;
  sourceRef.current = sourceDurationS;
  onChangeRef.current = onWindowsChange;
  onDragActiveRef.current = onDragActiveChange;

  const endDrag = () => {
    dragStartRef.current = null;
    setDrag(null);
    setDragging(null);
    onDragActiveRef.current?.(false);
  };

  /** Responders MUST be stable across renders: PanResponder keeps its gesture
   * state (and therefore dx) inside the instance, so handing the view a fresh
   * instance mid-drag resets dx to zero on every re-render and the handle
   * crawls instead of following the finger. Handlers read live values from
   * refs, so a cached instance stays correct as the windows change. */
  const respondersRef = useRef(new Map<string, ReturnType<typeof PanResponder.create>>());
  const edgeResponder = (index: number, edge: 'left' | 'right') => {
    const key = `${index}:${edge}`;
    const existing = respondersRef.current.get(key);
    if (existing) return existing;
    const created = makeEdgeResponder(index, edge);
    respondersRef.current.set(key, created);
    return created;
  };

  function makeEdgeResponder(index: number, edge: 'left' | 'right') {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        dragStartRef.current = windowsRef.current;
        setDrag(windowsRef.current);
        setDragging({ index, edge });
        onDragActiveRef.current?.(true);
      },
      onPanResponderMove: (_evt, gesture) => {
        const init = dragStartRef.current?.[index];
        const width = widthRef.current;
        const source = sourceRef.current;
        const cur = windowsRef.current;
        const self = cur[index];
        if (!init || !self || width <= 0 || source <= 0) return;
        // The card spans the whole source clip, so pixels map straight to seconds.
        const deltaT = (gesture.dx / width) * source;
        // Neighbours are hard walls: pieces of a split may meet at a seam but
        // must never cross, or the export would emit overlapping ranges.
        const floor = cur[index - 1]?.end ?? 0;
        const ceiling = cur[index + 1]?.start ?? source;
        const next = cur.map((w, i) => {
          if (i !== index) return w;
          return edge === 'left'
            ? {
                start: Math.max(floor, Math.min(self.end - MIN_WINDOW_S, init.start + deltaT)),
                end: self.end,
              }
            : {
                start: self.start,
                end: Math.min(ceiling, Math.max(self.start + MIN_WINDOW_S, init.end + deltaT)),
              };
        });
        setDrag(next);
        onChangeRef.current?.(next);
      },
      onPanResponderRelease: endDrag,
      onPanResponderTerminate: endDrag,
    });
  }

  // Display space: the FULL source clip. Trimmed stretches are dimmed in place.
  const source = Math.max(0.001, sourceDurationS);
  const shown = drag ?? windows;
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const hasWidth = layoutWidth > 0;
  const xOf = (time: number) => clamp01(time / source) * layoutWidth;
  const pctOf = (time: number) => clamp01(time / source) * 100;
  const clampX = (x: number, size: number) => Math.max(0, Math.min(layoutWidth - size, x));
  const playPct = clamp01(playbackTimeS / source) * 100;
  const keptSpan = keptDuration(shown);
  const removed = removedRanges(shown, source);

  /** Handles sit in measured pixels and are clamped INSIDE the card: a target
   * hanging past the edge gets no touches on iOS (hit-testing is clipped to the
   * parent's bounds), so the grab would fall through to strip scrubbing. At a
   * split seam the two facing handles claim opposite sides of the boundary so
   * each stays grabbable. */
  const barStyle = (time: number, side: 'left' | 'right', atSeam: boolean) => {
    if (!hasWidth) {
      return side === 'left'
        ? { left: `${pctOf(time)}%` as const, marginLeft: atSeam ? 0 : 1 }
        : { right: `${100 - pctOf(time)}%` as const, marginRight: atSeam ? 0 : 1 };
    }
    const x = xOf(time);
    const raw =
      side === 'left' ? x + (atSeam ? 0 : 1) : x - TRIM_HANDLE_BAR_WIDTH - (atSeam ? 0 : 1);
    return { left: clampX(raw, TRIM_HANDLE_BAR_WIDTH) };
  };
  const targetStyle = (time: number, side: 'left' | 'right', atSeam: boolean) => {
    if (!hasWidth) {
      return side === 'left'
        ? { left: `${pctOf(time)}%` as const, marginLeft: atSeam ? 0 : -10 }
        : { right: `${100 - pctOf(time)}%` as const, marginRight: atSeam ? 0 : -10 };
    }
    const x = xOf(time);
    const raw =
      side === 'left' ? x - (atSeam ? 0 : 10) : x - SEGMENT_HANDLE_WIDTH + (atSeam ? 0 : 10);
    return { left: clampX(raw, SEGMENT_HANDLE_WIDTH) };
  };

  return (
    <View
      className="absolute inset-0"
      pointerEvents="box-none"
      onLayout={(e) => setLayoutWidth(e.nativeEvent.layout.width)}
    >
      {/* Trimmed-away stretches: always visible, dimmed out of the final cut */}
      {removed.map((gap) => {
        const leftPct = pctOf(gap.start);
        const widthPct = Math.max(0, pctOf(gap.end) - leftPct);
        if (widthPct <= 0) return null;
        const atHead = gap.start <= 0;
        const atTail = gap.end >= source;
        return (
          <View
            key={`gap-${gap.start}-${gap.end}`}
            pointerEvents="none"
            className="absolute bottom-0 top-0"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              backgroundColor: 'rgba(24,26,34,0.6)',
              borderTopLeftRadius: atHead ? 8 : 0,
              borderBottomLeftRadius: atHead ? 8 : 0,
              borderTopRightRadius: atTail ? 8 : 0,
              borderBottomRightRadius: atTail ? 8 : 0,
            }}
          />
        );
      })}
      {/* Playhead — position is always true since the card shows the whole clip */}
      <View
        pointerEvents="none"
        className="absolute bottom-0 top-0"
        style={{ left: `${playPct}%`, marginLeft: -1 }}
      >
        <View style={{ flex: 1, width: 2, borderRadius: 1, backgroundColor: '#EC4899' }} />
        <View
          style={{
            position: 'absolute',
            top: -4,
            left: -3,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#EC4899',
          }}
        />
      </View>
      {/* Amount badge while dragging: resulting kept duration + delta */}
      {dragging && dragStartRef.current && (
        <View
          pointerEvents="none"
          className="absolute rounded-md bg-black/80 px-1.5 py-0.5"
          style={dragging.edge === 'left' ? { left: 0, top: -24 } : { right: 0, top: -24 }}
        >
          <Text className="font-mono text-[10px] text-white">
            {(() => {
              const delta = keptSpan - keptDuration(dragStartRef.current);
              return t('review.trimBadge', {
                duration: formatTimestamp(Math.round(keptSpan * 10) / 10),
                delta: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`,
              });
            })()}
          </Text>
        </View>
      )}
      {editable &&
        shown.map((win, i) => {
          const seamBefore = touchesNext(shown, i - 1);
          const seamAfter = touchesNext(shown, i);
          const leftResponder = edgeResponder(i, 'left');
          const rightResponder = edgeResponder(i, 'right');
          return (
            <React.Fragment key={`win-${i}`}>
              <View
                pointerEvents="none"
                className="absolute items-center justify-center"
                style={{
                  ...barStyle(win.start, 'left', seamBefore),
                  top: 2,
                  bottom: 2,
                  width: TRIM_HANDLE_BAR_WIDTH,
                  backgroundColor: 'rgba(255,184,0,0.75)',
                  borderRadius: 6,
                }}
              >
                <View
                  style={{ width: 2.5, height: 12, borderRadius: 1, backgroundColor: '#D97706' }}
                />
              </View>
              <View
                pointerEvents="none"
                className="absolute items-center justify-center"
                style={{
                  ...barStyle(win.end, 'right', seamAfter),
                  top: 2,
                  bottom: 2,
                  width: TRIM_HANDLE_BAR_WIDTH,
                  backgroundColor: 'rgba(255,184,0,0.75)',
                  borderRadius: 6,
                }}
              >
                <View
                  style={{ width: 2.5, height: 12, borderRadius: 1, backgroundColor: '#D97706' }}
                />
              </View>
              <View
                className="absolute bottom-0 top-0"
                style={{
                  ...targetStyle(win.start, 'left', seamBefore),
                  width: SEGMENT_HANDLE_WIDTH,
                }}
                {...leftResponder.panHandlers}
              />
              <View
                className="absolute bottom-0 top-0"
                style={{ ...targetStyle(win.end, 'right', seamAfter), width: SEGMENT_HANDLE_WIDTH }}
                {...rightResponder.panHandlers}
              />
            </React.Fragment>
          );
        })}
    </View>
  );
});

interface FilmstripTimelineProps {
  items: FilmstripItem[];
  selectedIndex: number;
  /** Audio levels per clip index — waveform band on every segment. */
  levelsByIndex: Record<number, AudioLevel[]>;
  playbackTimeS: number;
  onSelect: (index: number) => void;
  onSeek: (timeS: number) => void;
  /** Scrub crossed into another clip: switch to it at the given source time. */
  onScrubToClip: (index: number, timeS: number) => void;
  /** Live trim adjustment for the selected clip (kept windows in source time). */
  onWindowsChange?: (w: KeptWindow[]) => void;
  /** Handles render only while true; playhead always shows. */
  trimActive: boolean;
  onActivateTrim: () => void;
}

const STRIP_HEIGHT = 68;
const WAVE_BAND_HEIGHT = 22;
/** Width of one tiled frame — 9:16 slice of the strip height. */
const FRAME_TILE_WIDTH = Math.round(STRIP_HEIGHT * (9 / 16));
/** Frames generated per clip for the filmstrip. */
const FRAMES_PER_CLIP = 6;

/** One continuous strip showing the FINAL cut: unselected segments display only
 * their kept content ("clean trim"). The selected clip is a yellow card laid out
 * over its WHOLE source, with the trimmed head/tail dimmed in place and edge
 * handles that move the kept window live. */
const FilmstripTimeline = memo(function FilmstripTimeline({
  items,
  selectedIndex,
  levelsByIndex,
  playbackTimeS,
  onSelect,
  onSeek,
  onScrubToClip,
  onWindowsChange,
  trimActive,
  onActivateTrim,
}: FilmstripTimelineProps) {
  // One continuous timeline: measured segment layouts let a single drag scrub
  // across clip boundaries, switching clips as the finger crosses them.
  const segLayoutsRef = useRef<Record<number, { x: number; w: number }>>({});
  const stripRef = useRef<View>(null);
  const stripPageXRef = useRef(0);
  const itemsRef = useRef(items);
  const selectedRef = useRef(selectedIndex);
  const onSelectSeekRef = useRef({ onSeek, onScrubToClip, onActivateTrim });
  const trimActiveRef = useRef(trimActive);
  /** True for the whole duration of a trim-handle gesture. Once a handle hits the
   * clip edge it stops moving, and any further finger travel would otherwise be
   * read as strip scrubbing and jump to the neighbouring clip mid-trim. */
  const trimDraggingRef = useRef(false);
  itemsRef.current = items;
  selectedRef.current = selectedIndex;
  trimActiveRef.current = trimActive;
  onSelectSeekRef.current = { onSeek, onScrubToClip, onActivateTrim };

  /** True when x (strip-local) is close enough to an armed trim handle that the
   * gesture belongs to that handle. Without this the strip's scrub responder can
   * claim a grab meant for a handle sitting at a clip edge and jump to the
   * neighbouring clip mid-trim. */
  const nearArmedHandle = (x: number) => {
    if (!trimActiveRef.current) return false;
    const idx = selectedRef.current;
    const it = itemsRef.current.find((i) => i.index === idx);
    const l = segLayoutsRef.current[idx];
    if (!it?.keptWindows?.length || !l || it.sourceDurationS <= 0) return false;
    const xOf = (time: number) => l.x + (time / it.sourceDurationS) * l.w;
    return it.keptWindows.some(
      (w) =>
        Math.abs(x - xOf(w.start)) <= HANDLE_GRAB_RADIUS ||
        Math.abs(x - xOf(w.end)) <= HANDLE_GRAB_RADIUS
    );
  };
  const nearArmedHandleRef = useRef(nearArmedHandle);
  nearArmedHandleRef.current = nearArmedHandle;

  const scrubAt = (x: number) => {
    if (trimDraggingRef.current) return;
    const layouts = segLayoutsRef.current;
    const its = itemsRef.current;
    let best: { index: number; frac: number } | null = null;
    for (const it of its) {
      const l = layouts[it.index];
      if (!l) continue;
      if (x >= l.x && x <= l.x + l.w) {
        best = { index: it.index, frac: (x - l.x) / Math.max(1, l.w) };
        break;
      }
    }
    if (!best) {
      // Before the first / after the last / in a gap: clamp to nearest edge
      let nearest: { index: number; frac: number; dist: number } | null = null;
      for (const it of its) {
        const l = layouts[it.index];
        if (!l) continue;
        const dist = x < l.x ? l.x - x : x - (l.x + l.w);
        if (dist >= 0 && (!nearest || dist < nearest.dist)) {
          nearest = { index: it.index, frac: x < l.x ? 0 : 1, dist };
        }
      }
      if (!nearest) return;
      best = { index: nearest.index, frac: nearest.frac };
    }
    const item = its.find((i) => i.index === best!.index);
    if (!item) return;
    // The selected segment shows its FULL source (trim dimmed, not removed), so
    // its scrub space is the whole clip; other segments show kept content only,
    // which means walking their windows to skip the removed stretches.
    const isSelectedSeg = best.index === selectedRef.current;
    const wins = item.keptWindows;
    const timeS =
      isSelectedSeg || !wins?.length
        ? best.frac * item.sourceDurationS
        : keptTimeToSource(wins, best.frac * keptDuration(wins));
    const cb = onSelectSeekRef.current;
    if (best.index === selectedRef.current) {
      cb.onActivateTrim();
      cb.onSeek(timeS);
    } else {
      cb.onScrubToClip(best.index, timeS);
    }
  };

  const stripScrubResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) =>
        !trimDraggingRef.current &&
        !nearArmedHandleRef.current(evt.nativeEvent.pageX - stripPageXRef.current),
      onMoveShouldSetPanResponder: (evt) =>
        !trimDraggingRef.current &&
        !nearArmedHandleRef.current(evt.nativeEvent.pageX - stripPageXRef.current),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      // pageX-based: locationX is relative to the touched CHILD view, which
      // skews the position by that child's offset inside the strip
      onPanResponderGrant: (evt) => scrubAt(evt.nativeEvent.pageX - stripPageXRef.current),
      onPanResponderMove: (evt) => scrubAt(evt.nativeEvent.pageX - stripPageXRef.current),
    })
  ).current;

  return (
    <View
      ref={stripRef}
      className="flex-row items-stretch"
      style={{ height: STRIP_HEIGHT, gap: 3 }}
      onLayout={() => {
        stripRef.current?.measureInWindow((x) => {
          stripPageXRef.current = x;
        });
      }}
      {...stripScrubResponder.panHandlers}
    >
      {items.map((it) => {
        const keptSpan = keptDuration(it.keptWindows, it.sourceDurationS);
        const isSel = it.index === selectedIndex;
        // Selected segment is laid out over its whole source so the trimmed
        // head/tail stay visible (dimmed); the rest show kept content only.
        const displaySpan = isSel ? it.sourceDurationS : keptSpan;
        const weight = Math.max(displaySpan, 0.5);
        const levels = levelsByIndex[it.index];
        const body = (
          <>
            {it.frames && it.frames.length > 0 ? (
              <View className="absolute inset-0 flex-row overflow-hidden">
                {it.frames.map((frame, fi) => (
                  <Image
                    key={`${frame}-${fi}`}
                    source={{ uri: frame }}
                    style={{ width: FRAME_TILE_WIDTH, height: '100%' }}
                    resizeMode="cover"
                  />
                ))}
              </View>
            ) : it.thumbnailUri ? (
              <Image
                source={{ uri: it.thumbnailUri }}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                resizeMode="cover"
              />
            ) : (
              <View className="flex-1 items-center justify-center bg-surface-subtle">
                <Text className="font-display text-[14px]" style={{ color: '#C4C9D6' }}>
                  {String(it.index + 1).padStart(2, '0')}
                </Text>
              </View>
            )}
            {levels && levels.length > 0 && (
              <MiniWaveform
                levels={levels}
                windows={isSel ? undefined : it.keptWindows}
                height={WAVE_BAND_HEIGHT}
              />
            )}
            {/* Duration badge: kept duration (plus full length on the selected clip) */}
            <View
              className="absolute rounded bg-black/60 px-1 py-px"
              style={{ left: 3, top: 3, zIndex: 2 }}
            >
              <Text className="font-mono text-[9px] text-white">
                {isSel && it.keptWindows?.length && keptSpan < it.sourceDurationS - 0.05
                  ? `${formatTimestamp(Math.round(keptSpan * 10) / 10)} / ${formatTimestamp(
                      Math.round(it.sourceDurationS * 10) / 10
                    )}`
                  : formatTimestamp(Math.round(keptSpan * 10) / 10)}
              </Text>
            </View>
          </>
        );

        if (isSel) {
          const wins = it.keptWindows?.length
            ? it.keptWindows
            : [{ start: 0, end: it.sourceDurationS }];
          return (
            <View
              key={it.index}
              onLayout={(e) => {
                segLayoutsRef.current[it.index] = {
                  x: e.nativeEvent.layout.x,
                  w: e.nativeEvent.layout.width,
                };
              }}
              style={{
                flexGrow: weight * 2,
                flexBasis: 0,
                minWidth: 88,
                zIndex: 10,
                elevation: 10,
              }}
            >
              <View
                className="flex-1 overflow-hidden rounded-[10px] border-2 border-solid"
                style={{ borderColor: '#FFB800' }}
              >
                {body}
              </View>
              <TrimWindows
                windows={wins}
                sourceDurationS={it.sourceDurationS}
                playbackTimeS={playbackTimeS}
                editable={trimActive && !!onWindowsChange && !!it.keptWindows?.length}
                onWindowsChange={onWindowsChange}
                onDragActiveChange={(active) => {
                  trimDraggingRef.current = active;
                }}
              />
            </View>
          );
        }
        return (
          <Pressable
            key={it.index}
            onPress={() => onSelect(it.index)}
            onLayout={(e) => {
              segLayoutsRef.current[it.index] = {
                x: e.nativeEvent.layout.x,
                w: e.nativeEvent.layout.width,
              };
            }}
            className="overflow-hidden rounded-[10px] border border-solid border-surface-line"
            style={{ flexGrow: weight, flexBasis: 0, minWidth: 28 }}
          >
            {body}
          </Pressable>
        );
      })}
    </View>
  );
});

export default function ReviewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const isStitch = source === 'stitch';
  const exportGate = useFreemiumGate(id ? (isStitch ? stitchScope(id) : projectScope(id)) : null);
  const { getProject, refreshProjects } = useProjectStore();
  const clipRepository = useClipRepository();
  const stitchRepository = useStitchProjectRepository();
  const settingsRepository = useSettingsRepository();
  const projectFromStore = getProject(id ?? '');
  // Load the stitch project synchronously so recordedClips is populated on the
  // first render — the video player's initialSource memoises once, so an
  // async load would leave the player stuck on a null source.
  const [stitchRefreshKey, setStitchRefreshKey] = useState(0);
  const stitchProject = useMemo<StitchProject | null>(() => {
    if (!isStitch || !id) return null;
    return stitchRepository.getById(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStitch, id, stitchRepository, stitchRefreshKey]);

  // Refresh data on focus so exported path is up to date after stitching
  useFocusEffect(
    useCallback(() => {
      if (isStitch) {
        setStitchRefreshKey((k) => k + 1);
      } else {
        refreshProjects();
      }
    }, [isStitch, refreshProjects])
  );

  const project = isStitch ? null : projectFromStore;
  const exportedVideoPath = isStitch ? stitchProject?.outputVideoPath : project?.exportedVideoPath;
  const exportedVideoDuration = isStitch
    ? stitchProject?.outputVideoDuration
    : project?.exportedVideoDuration;

  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingAll, setIsPlayingAll] = useState(false);

  // Trim state — restored from storage (session cache first) so trims and splits
  // survive an app restart. Stitch-project keys are prefixed so they don't
  // collide with regular projects.
  const jumpcutCacheKey = id ? (isStitch ? `stitch:${id}` : id) : '';
  const cached = useMemo(
    () => (jumpcutCacheKey ? loadJumpcutState(settingsRepository, jumpcutCacheKey) : undefined),
    [jumpcutCacheKey, settingsRepository]
  );
  const [jumpcutSegments, setJumpcutSegments] = useState<Record<number, JumpcutSegment[]>>(
    () => cached?.jumpcutSegments ?? {}
  );
  /** Original auto-detected segments per clip, preserved so manual edits can be reset. */
  const [autoSegments, setAutoSegments] = useState<Record<number, JumpcutSegment[]>>(
    () => cached?.autoSegments ?? {}
  );
  const [jumpcutEnabled, setJumpcutEnabled] = useState<Set<number>>(
    () => new Set(cached?.jumpcutEnabled ?? [])
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  /** Cached audio levels per clip for the volume visualizer (and jumpcut analysis). */
  const [audioLevelsByClip, setAudioLevelsByClip] = useState<Record<number, AudioLevel[]>>({});
  /** Frame strips per clip index for the filmstrip (vertical slices). */
  const [frameStripsByIndex, setFrameStripsByIndex] = useState<Record<number, string[]>>({});
  /** Generated thumbnails for stitch-source videos (regular projects use clip.thumbnailUri from DB). */
  const [stitchThumbnailsByIndex, setStitchThumbnailsByIndex] = useState<Record<number, string>>(
    {}
  );
  /** Current playback time (s) for the selected clip — drives timeline playhead. */
  const [playbackTimeS, setPlaybackTimeS] = useState<number>(0);
  /** Actual duration (s) from the loaded video player for the selected clip; more accurate than DB. */
  const [actualDurationS, setActualDurationS] = useState<number | null>(null);
  /** Whether the video card is shown in landscape (16:9) vs portrait (9:16) mode. */
  const [isLandscape, setIsLandscape] = useState(false);
  const hasDetectedOrientationRef = useRef(false);

  // Refs to avoid stale closures in event callbacks
  const isPlayingAllRef = useRef(false);
  const selectedClipIndexRef = useRef(0);
  const jumpcutSegmentsRef = useRef<Record<number, JumpcutSegment[]>>({});
  const jumpcutEnabledRef = useRef<Set<number>>(new Set());
  const hasInitializedDefaultJumpcutRef = useRef(false);
  // Debounce seeks to avoid re-triggering while a seek is in progress (especially on Android)
  const lastSeekTimeRef = useRef(0);

  // Persist jumpcut state to in-memory cache so it survives navigation
  useEffect(() => {
    if (!jumpcutCacheKey) return;
    setJumpcutState(
      jumpcutCacheKey,
      {
        jumpcutSegments,
        autoSegments,
        jumpcutEnabled: [...jumpcutEnabled],
      },
      settingsRepository
    );
  }, [jumpcutCacheKey, jumpcutSegments, autoSegments, jumpcutEnabled, settingsRepository]);

  // Fetch recorded clips — from clipRepository for projects, or synthesised from
  // StitchVideo[] for stitch projects so the rest of the screen stays generic.
  const recordedClips = useMemo<Clip[]>(() => {
    if (!id) return [];
    if (isStitch) {
      if (!stitchProject) return [];
      return stitchProject.videos.map((v, i) => ({
        id: v.id,
        projectId: id,
        index: i,
        text: v.filename ?? `Video ${i + 1}`,
        status: 'done',
        source: 'imported',
        videoUri: v.uri,
        thumbnailUri: stitchThumbnailsByIndex[i],
        durationSeconds: v.durationMs != null ? v.durationMs / 1000 : undefined,
      }));
    }
    return clipRepository.getByProject(id);
  }, [id, isStitch, stitchProject, clipRepository, stitchThumbnailsByIndex]);

  // Generate thumbnails for stitch-source videos so the thumbnail row matches the
  // recorded-project experience (regular clips already carry thumbnailUri from the DB).
  useEffect(() => {
    if (!isStitch || !stitchProject) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < stitchProject.videos.length; i++) {
        const v = stitchProject.videos[i]!;
        if (stitchThumbnailsByIndex[i] || !v.uri || isSimulatorRecording(v.uri)) continue;
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(v.uri, { time: 500 });
          if (cancelled) return;
          setStitchThumbnailsByIndex((prev) => ({ ...prev, [i]: uri }));
        } catch {
          // ignore individual failures; row falls back to numbered placeholder
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStitch, stitchProject]);

  // Thumbnail-row source: parsed script clips for projects, synthesised one-per-video
  // items for stitch projects. Only `index` and `text` are read downstream.
  const scriptClips = useMemo<{ index: number; text: string }[]>(() => {
    if (isStitch) {
      return recordedClips.map((c) => ({ index: c.index, text: c.text }));
    }
    if (!project?.script) return [];
    return parseClips(project.script);
  }, [isStitch, project?.script, recordedClips]);

  // Ordered list of clip indices that have real video (not simulator)
  const doneClipIndices = useMemo(() => {
    return recordedClips
      .filter(
        (c) => c.status === 'done' && c.videoUri && !isSimulatorRecording(c.videoUri ?? undefined)
      )
      .map((c) => c.index)
      .sort((a, b) => a - b);
  }, [recordedClips]);

  // Get the selected clip's video URI
  const selectedClip = useMemo(() => {
    return recordedClips.find((c) => c.index === selectedClipIndex);
  }, [recordedClips, selectedClipIndex]);

  // Generate a small strip of frames per recorded clip so vertical videos show
  // multiple 9:16 slices instead of one landscape-cropped frame.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const clip of recordedClips) {
        if (
          !clip.videoUri ||
          clip.status !== 'done' ||
          isSimulatorRecording(clip.videoUri) ||
          frameStripsByIndex[clip.index]
        ) {
          continue;
        }
        const durationS = clip.durationSeconds ?? 0;
        if (durationS <= 0) continue;
        const frames: string[] = [];
        for (let i = 0; i < FRAMES_PER_CLIP; i++) {
          try {
            const timeMs = Math.floor(((i + 0.5) / FRAMES_PER_CLIP) * durationS * 1000);
            const { uri } = await VideoThumbnails.getThumbnailAsync(clip.videoUri, {
              time: timeMs,
              quality: 0.4,
            });
            frames.push(uri);
          } catch {
            // skip failed frames; whatever succeeded still tiles
          }
          if (cancelled) return;
        }
        if (frames.length > 0 && !cancelled) {
          setFrameStripsByIndex((prev) => ({ ...prev, [clip.index]: frames }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordedClips]);

  // Filmstrip items: one per script clip. A clip keeps a LIST of windows — one
  // after auto-trim, more once it has been split — and unselected segments are
  // sized by the total kept content.
  const filmstripItems = useMemo<FilmstripItem[]>(() => {
    return scriptClips.map((sc) => {
      const rec = recordedClips.find((c) => c.index === sc.index);
      const levels = audioLevelsByClip[sc.index];
      const sourceDurationS =
        levels && levels.length > 0
          ? (levels[levels.length - 1]!.timeMs + 20) / 1000
          : (rec?.durationSeconds ?? 3);
      const segs = jumpcutEnabled.has(sc.index) ? jumpcutSegments[sc.index] : undefined;
      const keptWindows = segs && segs.length > 0 ? windowsFromSegments(segs) : undefined;
      return {
        index: sc.index,
        thumbnailUri: rec?.thumbnailUri,
        frames: frameStripsByIndex[sc.index],
        sourceDurationS,
        keptWindows,
        hasVideo: !!rec?.videoUri && rec.status === 'done' && !isSimulatorRecording(rec.videoUri),
      };
    });
  }, [
    scriptClips,
    recordedClips,
    audioLevelsByClip,
    jumpcutEnabled,
    jumpcutSegments,
    frameStripsByIndex,
  ]);

  // Global timeline position: kept time of all segments before the selected
  // clip, plus the position within it — matches what the strip displays.
  const { globalPlaybackS, totalStripS } = useMemo(() => {
    let acc = 0;
    let global = 0;
    let found = false;
    for (const it of filmstripItems) {
      const span = keptDuration(it.keptWindows, it.sourceDurationS);
      if (it.index === selectedClipIndex) {
        global =
          acc +
          (it.keptWindows?.length
            ? sourceToKeptTime(it.keptWindows, playbackTimeS)
            : Math.max(0, Math.min(span, playbackTimeS)));
        found = true;
      }
      acc += span;
    }
    return { globalPlaybackS: found ? global : acc, totalStripS: acc };
  }, [filmstripItems, selectedClipIndex, playbackTimeS]);

  const hasVideo =
    !!selectedClip?.videoUri &&
    selectedClip.status === 'done' &&
    !isSimulatorRecording(selectedClip.videoUri ?? undefined);

  // Jumpcut computed values
  const isCurrentClipJumpcutEnabled = jumpcutEnabled.has(selectedClipIndex);
  const currentClipSegments = isCurrentClipJumpcutEnabled
    ? jumpcutSegments[selectedClipIndex]
    : undefined;

  /** Duration (s) from audio analysis when available (last chunk end); matches what jumpcut uses. */
  const durationFromLevelsS = useMemo(() => {
    const levels = audioLevelsByClip[selectedClipIndex];
    if (!levels || levels.length === 0) return null;
    const last = levels[levels.length - 1]!;
    const chunkMs = 20;
    return (last.timeMs + chunkMs) / 1000;
  }, [audioLevelsByClip, selectedClipIndex]);

  /** Single source of truth for selected clip duration: player > analysis > DB. */
  const clipDurationS =
    (typeof actualDurationS === 'number' && actualDurationS > 0 ? actualDurationS : null) ??
    durationFromLevelsS ??
    selectedClip?.durationSeconds ??
    0;

  /** Whether the current clip's segments have been manually edited away from the auto-detected values. */
  const isCurrentClipManuallyEdited = useMemo(() => {
    const auto = autoSegments[selectedClipIndex];
    const current = jumpcutSegments[selectedClipIndex];
    if (!auto || !current) return false;
    if (auto.length !== current.length) return true;
    return auto.some(
      (seg, i) => seg.startTime !== current[i]!.startTime || seg.endTime !== current[i]!.endTime
    );
  }, [autoSegments, jumpcutSegments, selectedClipIndex]);

  // Calculate total duration accounting for jumpcut
  // Use audio analysis duration when available (more accurate, especially for imported videos)
  const totalDuration = useMemo(() => {
    const total =
      Math.round(
        recordedClips.reduce((sum, clip) => {
          const segments = jumpcutEnabled.has(clip.index) ? jumpcutSegments[clip.index] : undefined;
          if (segments && segments.length > 0) {
            // With jumpcut: use trimmed segment durations
            return sum + segments.reduce((s, seg) => s + (seg.endTime - seg.startTime), 0);
          }
          // Without jumpcut: prefer audio analysis duration (more accurate), fallback to database
          const levels = audioLevelsByClip[clip.index];
          const durationS =
            levels && levels.length > 0
              ? (levels[levels.length - 1]!.timeMs + 20) / 1000
              : (clip.durationSeconds ?? 0);

          console.log(
            `[Review] Clip ${clip.index} duration: ${durationS.toFixed(2)}s (from ${levels ? 'audio analysis' : 'database'})`
          );
          return sum + durationS;
        }, 0) * 10
      ) / 10;

    console.log(
      `[Review] Total duration: ${total.toFixed(2)}s (${recordedClips.length} clips, ${Object.keys(audioLevelsByClip).length} analyzed)`
    );
    return total;
  }, [recordedClips, jumpcutEnabled, jumpcutSegments, audioLevelsByClip]);

  // Initial video source — first done clip or null
  const initialSource = useMemo(() => {
    if (doneClipIndices.length === 0) return null;
    const firstDone = recordedClips.find((c) => c.index === doneClipIndices[0]);
    return firstDone?.videoUri ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable player instance — initialized once with first done clip
  const player = useVideoPlayer(initialSource, (p) => {
    p.loop = false;
  });

  // Keep refs in sync
  useEffect(() => {
    isPlayingAllRef.current = isPlayingAll;
  }, [isPlayingAll]);

  useEffect(() => {
    selectedClipIndexRef.current = selectedClipIndex;
  }, [selectedClipIndex]);

  useEffect(() => {
    jumpcutSegmentsRef.current = jumpcutSegments;
  }, [jumpcutSegments]);

  useEffect(() => {
    jumpcutEnabledRef.current = jumpcutEnabled;
  }, [jumpcutEnabled]);

  // Detect video orientation from the first clip's thumbnail
  useEffect(() => {
    if (hasDetectedOrientationRef.current) return;
    const firstWithThumb = recordedClips.find((c) => c.thumbnailUri);
    if (!firstWithThumb?.thumbnailUri) return;
    Image.getSize(
      firstWithThumb.thumbnailUri,
      (w, h) => {
        hasDetectedOrientationRef.current = true;
        setIsLandscape(w > h);
      },
      () => {}
    );
  }, [recordedClips]);

  // Load audio levels for ALL clips upfront on mount (for accurate duration + visualizer)
  useEffect(() => {
    const analyzeAllClips = async () => {
      const newLevels: Record<number, AudioLevel[]> = { ...audioLevelsByClip };

      for (const clip of recordedClips) {
        // Skip if already analyzed or invalid
        if (
          !clip.videoUri ||
          clip.status !== 'done' ||
          isSimulatorRecording(clip.videoUri) ||
          newLevels[clip.index]
        ) {
          continue;
        }

        try {
          const levels = await VideoExportModule.analyzeAudioLevels(clip.videoUri, 20);
          newLevels[clip.index] = levels;
        } catch (error) {
          console.warn(`Failed to analyze audio for clip ${clip.index}:`, error);
        }
      }

      setAudioLevelsByClip(newLevels);
    };

    analyzeAllClips();
    // Only run once on mount or when recordedClips changes
  }, [recordedClips]);

  // Replace player source when selected clip changes; capture actual duration from player when loaded
  useEffect(() => {
    if (!player) return;

    const clip = recordedClips.find((c) => c.index === selectedClipIndex);
    const uri = clip?.videoUri;
    const isReal = uri && clip.status === 'done' && !isSimulatorRecording(uri ?? undefined);

    if (isReal && uri) {
      setActualDurationS(null);
      setPlaybackTimeS(0);
      player.replaceAsync(uri).then(() => {
        const pendingSeek = pendingSeekRef.current;
        pendingSeekRef.current = null;
        const segments = jumpcutSegmentsRef.current[selectedClipIndex];
        if (pendingSeek != null) {
          player.currentTime = pendingSeek;
          setPlaybackTimeS(pendingSeek);
        } else if (jumpcutEnabledRef.current.has(selectedClipIndex) && segments?.[0]) {
          player.currentTime = segments[0].startTime;
          setPlaybackTimeS(segments[0].startTime);
        }
        if (isPlayingAllRef.current) {
          player.play();
        }
        const d = player.duration;
        if (typeof d === 'number' && d > 0 && Number.isFinite(d)) {
          setActualDurationS(d);
        } else {
          const id = setInterval(() => {
            const dur = player.duration;
            if (typeof dur === 'number' && dur > 0 && Number.isFinite(dur)) {
              setActualDurationS(dur);
              clearInterval(id);
            }
          }, 100);
          setTimeout(() => clearInterval(id), 5000);
        }
      });
    } else {
      setActualDurationS(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClipIndex]);

  // Sync playback time to state for timeline playhead; clamp to clip duration so we never show time > duration
  useEffect(() => {
    if (!player || !hasVideo) return;
    const interval = setInterval(() => {
      const t = player.currentTime;
      setPlaybackTimeS(clipDurationS > 0 ? Math.min(t, clipDurationS) : t);
    }, 100);
    return () => clearInterval(interval);
  }, [player, hasVideo, selectedClipIndex, clipDurationS]);

  // Subscribe to player events
  useEffect(() => {
    if (!player) return;

    const playingSubscription = player.addListener('playingChange', (payload) => {
      setIsPlaying(payload.isPlaying);
    });

    const playToEndSubscription = player.addListener('playToEnd', () => {
      if (!isPlayingAllRef.current) return;

      // If jumpcut is enabled, the polling interval handles clip advancement
      const clipIdx = selectedClipIndexRef.current;
      if (jumpcutEnabledRef.current.has(clipIdx)) return;

      const currentPos = doneClipIndices.indexOf(clipIdx);

      const nextIdx = doneClipIndices[currentPos + 1];
      if (currentPos >= 0 && nextIdx !== undefined) {
        // Advance to next done clip
        setSelectedClipIndex(nextIdx);
      } else {
        // Last clip finished — stop play-all
        setIsPlayingAll(false);
      }
    });

    return () => {
      playingSubscription.remove();
      playToEndSubscription.remove();
    };
  }, [player, doneClipIndices]);

  // Jumpcut playback monitor — skip silent regions during playback.
  // Poll at 16 ms (one frame at 60 fps) for tight detection.
  // On Android, video player seeks carry ~80-120 ms render latency, so we trigger the seek
  // SEEK_LOOKAHEAD_S seconds before the cut point to compensate.
  useEffect(() => {
    if (!player) return;

    const interval = setInterval(() => {
      if (!player.playing) return;

      const clipIndex = selectedClipIndexRef.current;
      if (!jumpcutEnabledRef.current.has(clipIndex)) return;

      const segments = jumpcutSegmentsRef.current[clipIndex];
      if (!segments || segments.length === 0) return;

      const currentTime = player.currentTime;

      // Check if past last keep segment (with lookahead so we act before the cut)
      const lastSeg = segments[segments.length - 1]!;
      if (currentTime >= lastSeg.endTime - JUMPCUT_SEEK_LOOKAHEAD_S) {
        if (isPlayingAllRef.current) {
          const currentPos = doneClipIndices.indexOf(clipIndex);
          const nextIdx = doneClipIndices[currentPos + 1];
          if (nextIdx !== undefined) {
            setSelectedClipIndex(nextIdx);
          } else {
            setIsPlayingAll(false);
            player.pause();
          }
        } else {
          player.pause();
        }
        return;
      }

      // Check if in a keep segment. We consider ourselves "in keep" only if we are
      // at least JUMPCUT_SEEK_LOOKAHEAD_S away from the segment end, so we pre-seek on
      // Android before the cut boundary is visually reached.
      const inKeep = segments.some(
        (seg) =>
          currentTime >= seg.startTime - 0.02 &&
          currentTime < seg.endTime - JUMPCUT_SEEK_LOOKAHEAD_S
      );

      if (!inKeep) {
        // Debounce: skip if we just issued a seek (prevents seek-loop at 16 ms rate)
        const now = Date.now();
        if (now - lastSeekTimeRef.current < JUMPCUT_SEEK_DEBOUNCE_MS) return;

        // In a cut region — seek to next keep segment
        const nextSeg = segments.find((seg) => seg.startTime > currentTime);
        if (nextSeg) {
          lastSeekTimeRef.current = now;
          player.currentTime = nextSeg.startTime;
        }
      }
    }, 16);

    return () => clearInterval(interval);
  }, [player, doneClipIndices]);

  const togglePlayback = useCallback(() => {
    if (!player || !hasVideo) return;

    if (isPlaying) {
      player.pause();
      if (isPlayingAll) {
        setIsPlayingAll(false);
      }
    } else {
      // If jumpcut enabled and at the end, seek to first segment
      if (isCurrentClipJumpcutEnabled && currentClipSegments?.[0]) {
        const lastSeg = currentClipSegments[currentClipSegments.length - 1]!;
        if (player.currentTime >= lastSeg.endTime - 0.05) {
          player.currentTime = currentClipSegments[0].startTime;
        }
      }
      // Filmstrip model: play continues through the remaining clips
      setIsPlayingAll(true);
      player.play();
    }
  }, [player, isPlaying, hasVideo, isPlayingAll, isCurrentClipJumpcutEnabled, currentClipSegments]);

  const handleTimelineSeek = useCallback(
    (timeS: number) => {
      if (!player || !hasVideo) return;
      player.currentTime = timeS;
      setPlaybackTimeS(timeS);
    },
    [player, hasVideo]
  );

  /** Drag handles reveal on first touch of the selected card. */
  const [isTrimming, setIsTrimming] = useState(false);

  /** Kept windows of the selected clip (source time). One after auto-trim, more
   * once it has been split — every piece stays tied to the same script section. */
  const currentClipWindows = useMemo<KeptWindow[]>(
    () => windowsFromSegments(currentClipSegments),
    [currentClipSegments]
  );

  /** Commit a whole window list: dragging an edge, or splitting a window in two. */
  const handleWindowsChange = useCallback(
    (windows: KeptWindow[]) => {
      setJumpcutSegments((prev) => ({
        ...prev,
        [selectedClipIndex]: segmentsFromWindows(windows),
      }));
      // Keep playback on kept material, clamping to the NEAREST edge so trimming
      // a tail doesn't yank the playhead (and the video) back to the head.
      if (!player) return;
      const t = player.currentTime;
      if (windows.some((w) => t >= w.start && t <= w.end)) return;
      let nearest = windows[0]?.start ?? 0;
      let bestDist = Infinity;
      for (const w of windows) {
        for (const edge of [w.start, w.end]) {
          const dist = Math.abs(edge - t);
          if (dist < bestDist) {
            bestDist = dist;
            nearest = edge;
          }
        }
      }
      player.currentTime = nearest;
      setPlaybackTimeS(nearest);
    },
    [player, selectedClipIndex]
  );

  /** A split needs the playhead on kept material with room for two pieces. */
  const canSplitHere = useMemo(
    () => hasVideo && canSplitAt(currentClipWindows, playbackTimeS, MIN_WINDOW_S),
    [hasVideo, currentClipWindows, playbackTimeS]
  );

  /** Cut the window under the playhead in two. The halves touch, so nothing is
   * dropped and the export is unchanged until the user drags the seam apart. */
  const handleSplitAtPlayhead = useCallback(() => {
    const next = splitWindowsAt(currentClipWindows, playbackTimeS, MIN_WINDOW_S);
    if (!next) return;
    setJumpcutSegments((prev) => ({
      ...prev,
      [selectedClipIndex]: segmentsFromWindows(next),
    }));
    // Handles must be live for the new seam to be draggable straight away.
    setIsTrimming(true);
  }, [currentClipWindows, playbackTimeS, selectedClipIndex]);

  /** Seek target consumed after the player swaps to a newly scrubbed clip. */
  const pendingSeekRef = useRef<number | null>(null);

  const handleScrubToClip = useCallback(
    (index: number, timeS: number) => {
      if (isPlayingAllRef.current) setIsPlayingAll(false);
      player?.pause();
      pendingSeekRef.current = timeS;
      setIsTrimming(false);
      setSelectedClipIndex(index);
      setPlaybackTimeS(timeS);
    },
    [player]
  );

  const handleSelectClip = useCallback(
    (index: number) => {
      if (isPlayingAll) {
        setIsPlayingAll(false);
        player?.pause();
      }
      setIsTrimming(false);
      setSelectedClipIndex(index);
    },
    [isPlayingAll, player]
  );

  const handleToggleAllJumpcut = useCallback(
    async (enable: boolean) => {
      const eligibleClips = recordedClips.filter(
        (c) => c.status === 'done' && c.videoUri && !isSimulatorRecording(c.videoUri ?? undefined)
      );

      if (!enable) {
        setJumpcutEnabled(new Set());
        return;
      }

      setIsAnalyzing(true);
      const newSegments = { ...jumpcutSegments };
      const newAutoSegments = { ...autoSegments };
      const newAudioLevels: Record<number, AudioLevel[]> = { ...audioLevelsByClip };
      const newEnabled = new Set(jumpcutEnabled);

      for (const clip of eligibleClips) {
        if (!newSegments[clip.index]) {
          try {
            const levels = await VideoExportModule.analyzeAudioLevels(clip.videoUri!, 20);
            newAudioLevels[clip.index] = levels;
            const durationS =
              levels.length > 0
                ? (levels[levels.length - 1]!.timeMs + 20) / 1000
                : (clip.durationSeconds ?? 0);
            const detected = toSingleSegment(detectKeepSegments(levels, durationS));
            // If detection found nothing (e.g., silent/muted video), default to full range
            // so the user still gets draggable handles to trim manually.
            const finalSegments =
              detected.length > 0 ? detected : [{ startTime: 0, endTime: durationS }];
            newSegments[clip.index] = finalSegments;
            newAutoSegments[clip.index] = finalSegments;
          } catch {
            // Skip clips that fail analysis
            continue;
          }
        }
        newEnabled.add(clip.index);
      }

      setAudioLevelsByClip(newAudioLevels);
      setAutoSegments(newAutoSegments);
      setJumpcutSegments(newSegments);
      setJumpcutEnabled(newEnabled);
      setIsAnalyzing(false);
    },
    [recordedClips, jumpcutEnabled, jumpcutSegments, autoSegments, audioLevelsByClip]
  );

  const handleToggleJumpcut = useCallback(async () => {
    // Toggle enables/disables jumpcut for ALL clips at once
    await handleToggleAllJumpcut(!isCurrentClipJumpcutEnabled);
  }, [isCurrentClipJumpcutEnabled, handleToggleAllJumpcut]);

  // Default behavior: first time opening review for a project, auto-enable jumpcut for all clips.
  // If cached state exists, preserve it instead of overriding user choices.
  useEffect(() => {
    if (hasInitializedDefaultJumpcutRef.current) return;
    if (!id) return;
    if (cached) {
      hasInitializedDefaultJumpcutRef.current = true;
      return;
    }

    const eligibleCount = recordedClips.filter(
      (c) => c.status === 'done' && c.videoUri && !isSimulatorRecording(c.videoUri ?? undefined)
    ).length;
    if (eligibleCount === 0) return;

    hasInitializedDefaultJumpcutRef.current = true;
    void handleToggleAllJumpcut(true);
  }, [cached, handleToggleAllJumpcut, id, recordedClips]);

  const handleResetJumpcut = useCallback(() => {
    const auto = autoSegments[selectedClipIndex];
    if (!auto) return;
    setJumpcutSegments((prev) => ({ ...prev, [selectedClipIndex]: auto }));
    if (player && auto.length > 0 && auto[0]) {
      player.currentTime = auto[0].startTime;
    }
  }, [selectedClipIndex, autoSegments, player]);

  const handleViewExportedVideo = () => {
    if (!exportedVideoPath) return;
    if (isStitch) {
      router.push({
        pathname: '/(main)/video-stitches-complete',
        params: { id: id! },
      });
      return;
    }
    router.push({
      pathname: '/(main)/projects/[id]/complete',
      params: {
        id: id!,
        videoPath: exportedVideoPath,
        videoDuration: String(exportedVideoDuration ?? 0),
      },
    });
  };

  const handleStartStitching = async () => {
    // The export is the deliverable, so it is the last point where the gate can still be
    // honoured — past here the user has the finished video.
    if (!(await exportGate.requireAccess())) return;

    // Build jumpcut data for enabled clips
    const jumpcutData: Record<number, JumpcutSegment[]> = {};
    jumpcutEnabled.forEach((clipIndex) => {
      const segments = jumpcutSegments[clipIndex];
      if (segments && segments.length > 0) {
        jumpcutData[clipIndex] = mergeOverlappingSegments(segments);
      }
    });

    const hasJumpcutData = Object.keys(jumpcutData).length > 0;

    if (isStitch) {
      router.push({
        pathname: '/(main)/video-stitches-stitching',
        params: hasJumpcutData ? { id: id!, jumpcut: JSON.stringify(jumpcutData) } : { id: id! },
      });
      return;
    }

    if (hasJumpcutData) {
      router.push({
        pathname: '/(main)/projects/[id]/stitching',
        params: { id: id!, jumpcut: JSON.stringify(jumpcutData) },
      });
    } else {
      // Use replace to clear any cached jumpcut params
      router.replace({
        pathname: '/(main)/projects/[id]/stitching',
        params: { id: id! },
      });
    }
  };

  const hasData = isStitch ? !!stitchProject : !!project;
  if (!hasData || scriptClips.length === 0) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-subtle">
        <Text className="font-sans text-ink-tertiary">{t('review.noClipsToReview')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <AppBackground>
      <SafeAreaView className="flex-1 bg-transparent" edges={['top']}>
        {Platform.OS === 'ios' && <StatusBar barStyle="dark-content" />}

        {/* Header: Final Review + Retake */}
        <View className="flex-row items-center justify-between px-6 py-3">
          <View className="flex-row items-center gap-2">
            <IconButton
              icon="arrowLeft"
              accessibilityLabel={t('common.back')}
              onPress={() => router.back()}
              size={24}
              color="#8A8FA3"
              className="-ml-2"
            />
            <Text className="font-heading text-[20px] text-ink" style={{ letterSpacing: -0.4 }}>
              {t('review.title')}
            </Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <Pressable
              onPress={() => setIsLandscape((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={isLandscape ? 'Portrait' : 'Landscape'}
              className="h-11 w-11 items-center justify-center rounded-full border border-solid border-surface-line bg-white"
            >
              <Icon name={isLandscape ? 'portrait' : 'landscape'} size={16} color="#4E5265" />
            </Pressable>
            <Pressable
              onPress={handleToggleJumpcut}
              disabled={isAnalyzing}
              accessibilityRole="button"
              accessibilityLabel={t('review.jumpcut')}
              accessibilityState={{ selected: isCurrentClipJumpcutEnabled }}
              className={`h-11 flex-row items-center rounded-full border border-solid px-3.5 ${
                isCurrentClipJumpcutEnabled
                  ? 'border-primary bg-primary'
                  : 'border-surface-line bg-white'
              }`}
              style={{ opacity: isAnalyzing ? 0.5 : 1 }}
            >
              <Icon
                name={isCurrentClipJumpcutEnabled ? 'lightningFilled' : 'lightning'}
                size={15}
                color={isCurrentClipJumpcutEnabled ? '#FFFFFF' : '#4E5265'}
                style={{ marginRight: 5 }}
              />
              <Text
                className={`font-sans-medium text-[13px] ${
                  isCurrentClipJumpcutEnabled ? 'text-white' : 'text-ink-secondary'
                }`}
              >
                {t('review.jumpcut')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Video Preview - centered portrait card */}
        <View className="flex-1 items-center justify-center px-6">
          <Pressable
            onPress={togglePlayback}
            className="overflow-hidden rounded-[20px] bg-white"
            style={{
              aspectRatio: isLandscape ? 16 / 9 : 9 / 16,
              ...(isLandscape ? { width: '100%' } : { flex: 1 }),
              borderWidth: 1,
              borderColor: '#E6E9F4',
              shadowColor: '#181A22',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            {hasVideo && player ? (
              <VideoView
                player={player}
                style={{ flex: 1 }}
                contentFit="cover"
                nativeControls={false}
              />
            ) : (
              <View className="flex-1 items-center justify-center bg-surface-subtle">
                <Icon name="video" size={36} color="#98A2B3" />
                <Text className="mt-2 text-xs text-ink-tertiary">
                  {t('review.noVideoRecorded')}
                </Text>
              </View>
            )}

            {/* Play overlay */}
            {hasVideo && !isPlaying && (
              <View className="absolute inset-0 items-center justify-center">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-white/30">
                  <Icon name="play" size={24} color="#FFFFFF" />
                </View>
              </View>
            )}

            {/* Stats chips — clips total (left) + est duration (right) */}
            <View className="absolute left-2.5 top-2.5 flex-row items-center rounded-full bg-black/55 px-2.5 py-[5px]">
              <Icon name="clapperboard" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text className="font-sans-medium text-[11px] text-white">
                {t('finalReview.clipsTotal', { count: scriptClips.length })}
              </Text>
            </View>
            <View className="absolute right-2.5 top-2.5 flex-row items-center rounded-full bg-black/55 px-2.5 py-[5px]">
              <Icon name="clock" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text className="font-mono text-[11px] text-white">
                {t('finalReview.durationChip', { seconds: formatSeconds(totalDuration) })}
              </Text>
            </View>
          </Pressable>
        </View>

        {/* Filmstrip timeline: every clip in one strip; selected clip expands
          into the live waveform with inline trim handles */}
        <View className="px-6 pb-3 pt-1">
          <View className="mb-3 mt-2 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <Text className="font-sans text-[12px] text-ink-tertiary">
                {t('review.timeline')}
              </Text>
              {isAnalyzing && (
                <Text className="ml-2 font-sans text-[11px] text-ink-disabled">
                  {t('review.analyzing')}
                </Text>
              )}
              {isCurrentClipJumpcutEnabled && isCurrentClipManuallyEdited && (
                <Pressable onPress={handleResetJumpcut} className="ml-2" hitSlop={8}>
                  <Text className="text-[11px] text-orange-500 underline">
                    {t('review.jumpcutReset')}
                  </Text>
                </Pressable>
              )}
              {isCurrentClipJumpcutEnabled && (
                <Pressable
                  onPress={handleSplitAtPlayhead}
                  disabled={!canSplitHere}
                  hitSlop={8}
                  className="ml-3 min-h-[28px] flex-row items-center rounded-full border border-solid px-2.5 py-1 active:opacity-70"
                  style={{
                    borderColor: canSplitHere ? '#3C3FEF' : '#EAECF0',
                    backgroundColor: canSplitHere ? 'rgba(60,63,239,0.08)' : 'transparent',
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('review.splitClip')}
                  accessibilityState={{ disabled: !canSplitHere }}
                >
                  <Icon
                    name="scissors"
                    size={11}
                    color={canSplitHere ? '#3C3FEF' : '#98A2B3'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    className="font-sans-medium text-[11px]"
                    style={{ color: canSplitHere ? '#3C3FEF' : '#98A2B3' }}
                  >
                    {t('review.splitClip')}
                  </Text>
                </Pressable>
              )}
            </View>
            <Text className="font-mono text-[11px] text-ink-tertiary">
              {formatTimestamp(Math.round(globalPlaybackS * 10) / 10)} /{' '}
              {formatTimestamp(Math.round(totalStripS * 10) / 10)}
            </Text>
          </View>
          <View className="flex-row items-center">
            <View className="flex-1">
              <FilmstripTimeline
                items={filmstripItems}
                selectedIndex={selectedClipIndex}
                levelsByIndex={audioLevelsByClip}
                playbackTimeS={
                  clipDurationS > 0 ? Math.min(playbackTimeS, clipDurationS) : playbackTimeS
                }
                onSelect={handleSelectClip}
                onSeek={handleTimelineSeek}
                onScrubToClip={handleScrubToClip}
                trimActive={isTrimming}
                onActivateTrim={() => setIsTrimming(true)}
                onWindowsChange={isCurrentClipJumpcutEnabled ? handleWindowsChange : undefined}
              />
            </View>
          </View>
        </View>

        {/* Footer */}
        <View className="px-6 pb-8 pt-3">
          {exportedVideoPath && (
            <Pressable
              onPress={handleViewExportedVideo}
              className="mb-3 min-h-[56px] flex-row items-center justify-center rounded-2xl border-2 border-solid active:bg-primary-tint"
              style={{ borderColor: '#3C3FEF' }}
            >
              <Text className="font-heading text-[17px]" style={{ color: '#3C3FEF' }}>
                {t('review.viewExportedVideo')}
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => void handleStartStitching()}
            className="min-h-[56px] flex-row items-center justify-center rounded-2xl active:scale-95"
            style={{ backgroundColor: '#3C3FEF' }}
          >
            <Text className="font-heading text-[17px] text-white">
              {t('stitching.startStitching')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </AppBackground>
  );
}
