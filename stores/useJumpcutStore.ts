import type { SettingsRepository } from '@lib/repositories/types';
import type { JumpcutSegment } from '@shared/utils/jumpcut';

export interface JumpcutState {
  jumpcutSegments: Record<number, JumpcutSegment[]>;
  autoSegments: Record<number, JumpcutSegment[]>;
  jumpcutEnabled: number[];
}

/** Per-session fast path. The settings table is the durable copy — without it a
 * user's trims and splits would silently reset every time the app restarts. */
const cache = new Map<string, JumpcutState>();

/** Settings key holding the trim state for one project or stitch project. */
function storageKey(scopeKey: string): string {
  return `trim.${scopeKey}`;
}

function isSegmentList(value: unknown): value is JumpcutSegment[] {
  return (
    Array.isArray(value) &&
    value.every(
      (s) =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as JumpcutSegment).startTime === 'number' &&
        typeof (s as JumpcutSegment).endTime === 'number'
    )
  );
}

/** Storage is user-writable across app versions, so validate rather than trust:
 * a malformed row must fall back to auto-detection, never crash the review screen. */
function sanitize(value: unknown): JumpcutState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Partial<JumpcutState>;
  const pickSegments = (input: unknown): Record<number, JumpcutSegment[]> => {
    if (typeof input !== 'object' || input === null) return {};
    const out: Record<number, JumpcutSegment[]> = {};
    for (const [key, segs] of Object.entries(input)) {
      const idx = Number(key);
      if (Number.isInteger(idx) && isSegmentList(segs) && segs.length > 0) out[idx] = segs;
    }
    return out;
  };
  return {
    jumpcutSegments: pickSegments(raw.jumpcutSegments),
    autoSegments: pickSegments(raw.autoSegments),
    jumpcutEnabled: Array.isArray(raw.jumpcutEnabled)
      ? raw.jumpcutEnabled.filter((i): i is number => Number.isInteger(i))
      : [],
  };
}

/** In-memory lookup only — used where no repository is at hand. */
export function getJumpcutState(scopeKey: string): JumpcutState | undefined {
  return cache.get(scopeKey);
}

/** Read trim state, preferring the session cache and falling back to storage. */
export function loadJumpcutState(
  repo: SettingsRepository | null,
  scopeKey: string
): JumpcutState | undefined {
  const cached = cache.get(scopeKey);
  if (cached) return cached;
  if (!repo) return undefined;
  const stored = sanitize(repo.get<unknown>(storageKey(scopeKey), null));
  if (stored) cache.set(scopeKey, stored);
  return stored;
}

/** Persist trim state so splits and trims survive an app restart. */
export function setJumpcutState(
  scopeKey: string,
  state: JumpcutState,
  repo?: SettingsRepository | null
): void {
  cache.set(scopeKey, state);
  repo?.set(storageKey(scopeKey), state);
}

export function clearJumpcutState(scopeKey: string, repo?: SettingsRepository | null): void {
  cache.delete(scopeKey);
  repo?.delete(storageKey(scopeKey));
}
