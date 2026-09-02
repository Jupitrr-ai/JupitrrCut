const WORDS_PER_SECOND = 2.5;
const MIN_DURATION_SECONDS = 3;

export function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const estimated = Math.ceil(words / WORDS_PER_SECOND);
  return Math.max(MIN_DURATION_SECONDS, estimated);
}

/** Format seconds as a mm:ss studio timecode (e.g. 134 -> "02:14"). */
export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
