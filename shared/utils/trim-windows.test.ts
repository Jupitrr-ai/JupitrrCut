import {
  canSplitAt,
  keptDuration,
  keptTimeToSource,
  normalizeWindows,
  removedRanges,
  segmentsFromWindows,
  sourceToKeptTime,
  splitWindowsAt,
  touchesNext,
  windowIndexAt,
  windowsFromSegments,
} from '@shared/utils/trim-windows';

describe('trim-windows', () => {
  const single = [{ start: 1, end: 5 }];
  const split = [
    { start: 1, end: 3 },
    { start: 4, end: 5 },
  ];

  describe('keptDuration', () => {
    it('sums every window', () => {
      expect(keptDuration(single)).toBe(4);
      expect(keptDuration(split)).toBe(3);
    });

    it('falls back when there are no windows', () => {
      expect(keptDuration([], 9)).toBe(9);
      expect(keptDuration(undefined, 9)).toBe(9);
    });
  });

  describe('sourceToKeptTime', () => {
    it('offsets by the trimmed head', () => {
      expect(sourceToKeptTime(single, 2)).toBe(1);
    });

    it('skips the removed gap between windows', () => {
      expect(sourceToKeptTime(split, 4.5)).toBe(2.5);
    });

    it('collapses a time inside the gap onto the previous window end', () => {
      expect(sourceToKeptTime(split, 3.5)).toBe(2);
    });

    it('clamps before the first window and after the last', () => {
      expect(sourceToKeptTime(single, 0)).toBe(0);
      expect(sourceToKeptTime(single, 99)).toBe(4);
    });
  });

  describe('keptTimeToSource', () => {
    it('round-trips for times strictly inside a window', () => {
      for (const t of [1.5, 2, 2.5, 4.25, 4.5]) {
        expect(keptTimeToSource(split, sourceToKeptTime(split, t))).toBeCloseTo(t, 6);
      }
    });

    it('round-trips every kept offset', () => {
      for (const k of [0, 0.5, 1, 2, 2.5, 3]) {
        expect(sourceToKeptTime(split, keptTimeToSource(split, k))).toBeCloseTo(k, 6);
      }
    });

    it('resolves a seam offset to the end of the earlier piece', () => {
      // kept time 2 is both the end of piece 1 and the start of piece 2;
      // resolving to the earlier piece keeps scrubbing monotonic.
      expect(keptTimeToSource(split, 2)).toBe(3);
    });

    it('jumps over the gap', () => {
      expect(keptTimeToSource(split, 2.25)).toBe(4.25);
    });

    it('clamps past the end', () => {
      expect(keptTimeToSource(split, 99)).toBe(5);
    });
  });

  describe('removedRanges', () => {
    it('reports head and tail', () => {
      expect(removedRanges(single, 6)).toEqual([
        { start: 0, end: 1 },
        { start: 5, end: 6 },
      ]);
    });

    it('reports the gap opened by a split', () => {
      expect(removedRanges(split, 5)).toEqual([
        { start: 0, end: 1 },
        { start: 3, end: 4 },
      ]);
    });

    it('is empty when the whole clip is kept', () => {
      expect(removedRanges([{ start: 0, end: 5 }], 5)).toEqual([]);
    });
  });

  describe('splitting', () => {
    it('cuts one window into two touching halves', () => {
      expect(splitWindowsAt(single, 3)).toEqual([
        { start: 1, end: 3 },
        { start: 3, end: 5 },
      ]);
    });

    it('keeps total kept duration unchanged', () => {
      const after = splitWindowsAt(single, 3)!;
      expect(keptDuration(after)).toBe(keptDuration(single));
    });

    it('splits the correct window when several exist', () => {
      expect(splitWindowsAt(split, 4.5)).toEqual([
        { start: 1, end: 3 },
        { start: 4, end: 4.5 },
        { start: 4.5, end: 5 },
      ]);
    });

    it('refuses a split inside a removed gap', () => {
      expect(canSplitAt(split, 3.5)).toBe(false);
      expect(splitWindowsAt(split, 3.5)).toBeNull();
    });

    it('refuses a split that would leave a sliver', () => {
      expect(canSplitAt(single, 1.05)).toBe(false);
      expect(canSplitAt(single, 4.95)).toBe(false);
      expect(splitWindowsAt(single, 1.05)).toBeNull();
    });
  });

  describe('helpers', () => {
    it('finds the window at a time, or -1 in a gap', () => {
      expect(windowIndexAt(split, 2)).toBe(0);
      expect(windowIndexAt(split, 4.5)).toBe(1);
      expect(windowIndexAt(split, 3.5)).toBe(-1);
    });

    it('detects a seam only while the halves still meet', () => {
      const seam = splitWindowsAt(single, 3)!;
      expect(touchesNext(seam, 0)).toBe(true);
      expect(touchesNext(split, 0)).toBe(false);
      expect(touchesNext(split, 1)).toBe(false);
    });

    it('converts to and from jumpcut segments', () => {
      const segs = segmentsFromWindows(split);
      expect(segs).toEqual([
        { startTime: 1, endTime: 3 },
        { startTime: 4, endTime: 5 },
      ]);
      expect(windowsFromSegments(segs)).toEqual(split);
    });

    it('sorts segments coming back from storage', () => {
      expect(
        windowsFromSegments([
          { startTime: 4, endTime: 5 },
          { startTime: 1, endTime: 3 },
        ])
      ).toEqual(split);
    });

    it('drops collapsed windows', () => {
      expect(normalizeWindows([{ start: 1, end: 1.05 }, ...split])).toEqual(split);
    });
  });
});
