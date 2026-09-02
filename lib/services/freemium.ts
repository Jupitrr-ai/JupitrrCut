import type { SettingsRepository } from '@lib/repositories/types';
import type { EntitlementStatus } from '@lib/services/purchases';

/**
 * The free tier grants exactly one successful export. The value stores which flow consumed
 * it for debugging/migration, but any stored value means the allowance is spent: re-exporting
 * the same project is a second export and therefore requires Premium too.
 */
export const SETTINGS_KEY_FREE_RUN_SCOPE = 'monetization.freeRunScope';
export const SETTINGS_KEY_LIMITED_OFFER_STARTED_AT = 'monetization.limitedOfferStartedAt';
export const LIMITED_OFFER_DURATION_MS = 24 * 60 * 60 * 1000;

/** Namespaced so a scope can never collide with an id from another flow. */
export function projectScope(projectId: string): string {
  return `project:${projectId}`;
}

export function stitchScope(projectId: string): string {
  return `stitch:${projectId}`;
}

export function getConsumedFreeRunScope(settingsRepo: SettingsRepository): string | null {
  return settingsRepo.get<string | null>(SETTINGS_KEY_FREE_RUN_SCOPE, null);
}

/** First writer wins — a later export must not hand the allowance to a different project. */
export function consumeFreeRun(settingsRepo: SettingsRepository, scope: string): void {
  if (getConsumedFreeRunScope(settingsRepo) !== null) return;
  settingsRepo.set(SETTINGS_KEY_FREE_RUN_SCOPE, scope);
}

/** Starts once, after both offers are declined. Reopening the funnel never resets urgency. */
export function startLimitedOffer(
  settingsRepo: SettingsRepository,
  now: number = Date.now()
): number {
  const existing = settingsRepo.get<number | null>(SETTINGS_KEY_LIMITED_OFFER_STARTED_AT, null);
  if (existing !== null) return existing;
  settingsRepo.set(SETTINGS_KEY_LIMITED_OFFER_STARTED_AT, now);
  return now;
}

export function getLimitedOfferStartedAt(settingsRepo: SettingsRepository): number | null {
  return settingsRepo.get<number | null>(SETTINGS_KEY_LIMITED_OFFER_STARTED_AT, null);
}

export function getLimitedOfferRemainingMs(
  settingsRepo: SettingsRepository,
  now: number = Date.now()
): number {
  const startedAt = getLimitedOfferStartedAt(settingsRepo);
  if (startedAt === null) return 0;
  return Math.max(0, startedAt + LIMITED_OFFER_DURATION_MS - now);
}

export function isLimitedOfferActive(
  settingsRepo: SettingsRepository,
  now: number = Date.now()
): boolean {
  return getLimitedOfferRemainingMs(settingsRepo, now) > 0;
}

export function hasLimitedOfferExpired(
  settingsRepo: SettingsRepository,
  now: number = Date.now()
): boolean {
  return (
    getLimitedOfferStartedAt(settingsRepo) !== null && !isLimitedOfferActive(settingsRepo, now)
  );
}

export type GateDecision = 'allowed' | 'locked';

/**
 * Fails open on `unknown`: a network blip or an unconfigured store must never lock out a
 * subscriber. The only state that can lock anything is a positive "this user has no
 * entitlement" from RevenueCat.
 */
export function decideGate(
  entitlement: EntitlementStatus,
  consumedScope: string | null
): GateDecision {
  if (entitlement !== 'inactive') return 'allowed';
  return consumedScope === null ? 'allowed' : 'locked';
}
