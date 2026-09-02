// How much text to group into each auto-split scene. Exposed as a user setting
// (Settings → Script → "Words per scene"). Auto-split only ever breaks at
// sentence-ending punctuation; this value is a *soft minimum* — it groups roughly
// this many words/chars together, then breaks at the next sentence end. There is
// no hard cap: text with no punctuation is never split.
export const DEFAULT_WORDS_PER_GROUP = 40;
export const MIN_WORDS_PER_GROUP = 8;
export const MAX_WORDS_PER_GROUP = 100;

const CJK_CHAR_REGEX = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;
const SENTENCE_END_REGEX = /[.!?。！？]/;

export interface AutoSplitOptions {
  /** Words per scene soft minimum (clamped to MIN/MAX_WORDS_PER_GROUP). */
  wordsPerGroup?: number;
}

interface SplitThresholds {
  wordThreshold: number;
  charThreshold: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Derive the per-scene grouping thresholds from the single user-facing knob.
 * Biased slightly below the target so that, after rounding up to the next
 * sentence boundary, the average scene lands near the slider value.
 */
function resolveThresholds(wordsPerGroup?: number): SplitThresholds {
  const target = clamp(
    Math.round(wordsPerGroup ?? DEFAULT_WORDS_PER_GROUP),
    MIN_WORDS_PER_GROUP,
    MAX_WORDS_PER_GROUP
  );
  const wordThreshold = Math.max(4, Math.round(target * 0.7));
  // A CJK character carries more than a latin word, so the char threshold scales up.
  const charThreshold = Math.round(wordThreshold * 2.6);
  return { wordThreshold, charThreshold };
}

/**
 * Split a block of space-separated text. Breaks ONLY at sentence-ending
 * punctuation, and only once the scene has reached the word threshold. No hard
 * cap — a run-on with no punctuation stays a single scene.
 */
function splitBlockByWords(text: string, wordThreshold: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];

  const scenes: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    current.push(word);
    const endsSentence = /[.!?]["')\]]*$/.test(word);

    if (endsSentence && current.length >= wordThreshold) {
      scenes.push(current.join(' '));
      current = [];
    }
  }

  // Trailing words after the last sentence break.
  if (current.length > 0) {
    if (scenes.length > 0 && current.length < wordThreshold) {
      scenes[scenes.length - 1] += ' ' + current.join(' ');
    } else {
      scenes.push(current.join(' '));
    }
  }

  return scenes;
}

/**
 * Split a block by chars (for CJK / mixed text). Breaks ONLY at sentence-ending
 * punctuation, once the scene has reached the char threshold. No hard cap.
 */
function splitBlockByChars(text: string, charThreshold: number): string[] {
  const scenes: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const charCount = i - start + 1;
    if (SENTENCE_END_REGEX.test(text[i]!) && charCount >= charThreshold) {
      scenes.push(text.slice(start, i + 1).trim());
      start = i + 1;
    }
  }

  // Trailing text after the last sentence break.
  if (start < text.length) {
    const remainder = text.slice(start).trim();
    if (remainder.length > 0) {
      if (scenes.length > 0 && remainder.length < charThreshold) {
        scenes[scenes.length - 1] += remainder;
      } else {
        scenes.push(remainder);
      }
    }
  }

  return scenes;
}

/**
 * Auto-split text into scenes. Preserves existing \n as scene breaks.
 * Splits ONLY at sentence-ending punctuation (`. ! ?` and CJK `。！？`), grouping
 * up to the words-per-scene soft minimum. There is no hard length cap, and it
 * never splits in the middle of a word or sentence.
 */
export function autoSplitScript(text: string, options: AutoSplitOptions = {}): string[] {
  const { wordThreshold, charThreshold } = resolveThresholds(options.wordsPerGroup);

  const blocks = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const scenes: string[] = [];
  for (const block of blocks) {
    if (CJK_CHAR_REGEX.test(block)) {
      scenes.push(...splitBlockByChars(block, charThreshold));
    } else {
      scenes.push(...splitBlockByWords(block, wordThreshold));
    }
  }

  return scenes;
}

// A "/" the user typed as an explicit clip break. To avoid breaking real slashes
// in URLs ("https://"), dates ("12/25") or words ("and/or"), a slash only counts
// as a delimiter when it has whitespace (or a line/string edge) on both sides.
const DELIMITER_MATCH = /(?:^|\s)\/(?=\s|$)/;
const DELIMITER_SPLIT = /(?:^|\s)\/(?=\s|$)/g;

/** True when the text contains at least one explicit "/" clip delimiter. */
export function hasExplicitDelimiter(text: string): boolean {
  return DELIMITER_MATCH.test(text);
}

/**
 * Split pasted text on explicit "/" delimiters (and blank lines), honoring the
 * user's own break points exactly — no sentence/word grouping is applied.
 */
export function splitByDelimiter(text: string): string[] {
  return text
    .replace(DELIMITER_SPLIT, '\n\n')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
