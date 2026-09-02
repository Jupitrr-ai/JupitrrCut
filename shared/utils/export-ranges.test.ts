import { buildExportRanges, exportDuration } from '@shared/utils/export-ranges';
import { segmentsFromWindows, splitWindowsAt } from '@shared/utils/trim-windows';

const clip = (
  index: number,
  extra: Partial<{ videoUri: string; durationSeconds: number }> = {}
) => ({
  index,
  videoUri: `file:///clip${index}.mp4`,
  durationSeconds: 10,
  ...extra,
});

describe('buildExportRanges', () => {
  it('emits an untrimmed clip whole, with no start/end', () => {
    const [range] = buildExportRanges([clip(0)], {});
    // The native side reads a missing range as "use the entire track" — setting
    // 0..duration here would re-cut a clip the user never trimmed.
    expect(range).toEqual({ sourceUri: 'file:///clip0.mp4', durationSeconds: 10 });
    expect(range).not.toHaveProperty('startTime');
  });

  it('emits one range per kept window', () => {
    const ranges = buildExportRanges([clip(0)], {
      0: [
        { startTime: 1, endTime: 3 },
        { startTime: 6, endTime: 9 },
      ],
    });
    expect(ranges).toEqual([
      { sourceUri: 'file:///clip0.mp4', durationSeconds: 2, startTime: 1, endTime: 3 },
      { sourceUri: 'file:///clip0.mp4', durationSeconds: 3, startTime: 6, endTime: 9 },
    ]);
  });

  it('carries a split clip through as two ranges over the same source', () => {
    const windows = [{ start: 1, end: 9 }];
    const split = splitWindowsAt(windows, 5)!;
    const ranges = buildExportRanges([clip(0)], { 0: segmentsFromWindows(split) });
    expect(ranges).toHaveLength(2);
    expect(ranges.every((r) => r.sourceUri === 'file:///clip0.mp4')).toBe(true);
    // A bare split drops nothing, so the output length is unchanged.
    expect(exportDuration(ranges)).toBe(8);
  });

  it('drops the gap once the split seam is pulled apart', () => {
    const split = splitWindowsAt([{ start: 1, end: 9 }], 5)!;
    const widened = [split[0]!, { start: 7, end: 9 }];
    const ranges = buildExportRanges([clip(0)], { 0: segmentsFromWindows(widened) });
    expect(ranges.map((r) => [r.startTime, r.endTime])).toEqual([
      [1, 5],
      [7, 9],
    ]);
    expect(exportDuration(ranges)).toBe(6);
  });

  it('keeps clip order and mixes trimmed with untrimmed clips', () => {
    const ranges = buildExportRanges([clip(0), clip(1), clip(2)], {
      1: [
        { startTime: 0, endTime: 2 },
        { startTime: 4, endTime: 5 },
      ],
    });
    expect(ranges.map((r) => r.sourceUri)).toEqual([
      'file:///clip0.mp4',
      'file:///clip1.mp4',
      'file:///clip1.mp4',
      'file:///clip2.mp4',
    ]);
    expect(exportDuration(ranges)).toBe(23);
  });

  it('skips simulator recordings and clips with no usable video', () => {
    const ranges = buildExportRanges(
      [
        clip(0, { videoUri: 'simulator://fake' }),
        clip(1, { videoUri: undefined as unknown as string }),
        clip(2, { durationSeconds: 0 }),
        clip(3),
      ],
      {}
    );
    expect(ranges.map((r) => r.sourceUri)).toEqual(['file:///clip3.mp4']);
  });

  it('ignores a zero-length window rather than emitting an empty range', () => {
    const ranges = buildExportRanges([clip(0)], {
      0: [
        { startTime: 2, endTime: 2 },
        { startTime: 3, endTime: 5 },
      ],
    });
    expect(ranges).toHaveLength(1);
    expect(exportDuration(ranges)).toBe(2);
  });
});
