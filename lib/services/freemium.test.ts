import type { SettingsRepository } from '@lib/repositories/types';

import {
  consumeFreeRun,
  decideGate,
  getConsumedFreeRunScope,
  getLimitedOfferRemainingMs,
  hasLimitedOfferExpired,
  isLimitedOfferActive,
  LIMITED_OFFER_DURATION_MS,
  projectScope,
  startLimitedOffer,
  stitchScope,
} from './freemium';

function createSettingsRepo(): SettingsRepository {
  const values = new Map<string, unknown>();
  return {
    get: <T>(key: string, defaultValue: T) =>
      values.has(key) ? (values.get(key) as T) : defaultValue,
    set: <T>(key: string, value: T) => {
      values.set(key, value);
    },
  } as SettingsRepository;
}

describe('one free export', () => {
  it('allows only while no successful export has consumed the allowance', () => {
    expect(decideGate('inactive', null)).toBe('allowed');
    expect(decideGate('inactive', projectScope('first'))).toBe('locked');
    expect(decideGate('inactive', stitchScope('first'))).toBe('locked');
  });

  it('always allows active or unknown entitlement status', () => {
    expect(decideGate('active', projectScope('first'))).toBe('allowed');
    expect(decideGate('unknown', projectScope('first'))).toBe('allowed');
  });

  it('records only the first successful export', () => {
    const repo = createSettingsRepo();
    consumeFreeRun(repo, projectScope('one'));
    consumeFreeRun(repo, stitchScope('two'));
    expect(getConsumedFreeRunScope(repo)).toBe(projectScope('one'));
  });
});

describe('limited offer window', () => {
  it('starts once and never resets', () => {
    const repo = createSettingsRepo();
    expect(startLimitedOffer(repo, 1_000)).toBe(1_000);
    expect(startLimitedOffer(repo, 50_000)).toBe(1_000);
  });

  it('counts down for exactly 24 hours', () => {
    const repo = createSettingsRepo();
    startLimitedOffer(repo, 1_000);

    expect(getLimitedOfferRemainingMs(repo, 1_000)).toBe(LIMITED_OFFER_DURATION_MS);
    expect(isLimitedOfferActive(repo, 1_000 + LIMITED_OFFER_DURATION_MS - 1)).toBe(true);
    expect(hasLimitedOfferExpired(repo, 1_000 + LIMITED_OFFER_DURATION_MS)).toBe(true);
    expect(getLimitedOfferRemainingMs(repo, 1_000 + LIMITED_OFFER_DURATION_MS + 1)).toBe(0);
  });
});
