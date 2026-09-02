export interface ParsedClip {
  index: number;
  text: string;
}

// Treat blank lines (including spaces/tabs/non-breaking spaces) as clip separators.
const CLIP_SEPARATOR_REGEX = /\n[ \t\u00A0\u200B\uFEFF]*\n+/g;

function normalizeLineBreaks(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\u2028|\u2029|\u0085/g, '\n')
    .replace(/\u200B/g, '');
}

/**
 * @deprecated Title is now stored in project.name, not extracted from script.
 * Returns empty string for backwards compatibility.
 */
export function parseTitle(_script: string): string {
  return '';
}

/**
 * Parse a script into clips.
 * Splits on paragraph breaks (2+ consecutive newlines).
 * Single newlines within a segment are preserved.
 *
 * Example: "First clip\n\nSecond clip" → 2 clips
 * Example: "Line one\nLine two\n\nSecond clip" → 2 clips (first has internal newline)
 */
export function parseClips(script: string): ParsedClip[] {
  const normalized = normalizeLineBreaks(script);
  if (!normalized.trim()) {
    return [];
  }

  // Split by blank lines (2+ newlines, optionally containing whitespace).
  return normalized
    .split(CLIP_SEPARATOR_REGEX)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((text, index) => ({
      index,
      text,
    }));
}

/**
 * Normalize a script by parsing and re-serializing.
 * Ensures consistent storage format.
 */
export function normalizeScript(script: string): string {
  if (!script.trim()) {
    return '';
  }

  const clips = parseClips(script);
  return serializeClips(clips);
}

/**
 * Serialize clips back to script format.
 * Joins clips with blank lines (no slash delimiters).
 */
export function serializeClips(clips: ParsedClip[]): string {
  if (clips.length === 0) {
    return '';
  }
  return clips.map((clip) => clip.text).join('\n\n');
}

/**
 * Get the starting character offset of each clip in the (migrated) script text.
 * Used for tap-chip-to-scroll: given a clip index, you can find where it starts
 * in the text and scroll the TextInput to that position.
 */
export function getClipOffsets(script: string): number[] {
  const normalized = normalizeLineBreaks(script);
  if (!normalized.trim()) {
    return [];
  }

  const offsets: number[] = [];
  const parts = normalized.split(/(\n[ \t\u00A0\u200B\uFEFF]*\n+)/);
  let currentOffset = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    // Even indices are content, odd indices are delimiters
    if (i % 2 === 0) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        // Find the actual start of non-whitespace content
        const leadingWhitespace = part.length - part.trimStart().length;
        offsets.push(currentOffset + leadingWhitespace);
      }
    }
    currentOffset += part.length;
  }

  return offsets;
}
