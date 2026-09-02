import { formatJupitrrPlanName } from './subscriptionLogic';

describe('formatJupitrrPlanName', () => {
  it.each([
    ['videoos_pro', 'Pro Plan'],
    ['videoos_team', 'Team Plan'],
    ['starter', 'Starter Plan'],
    ['jupitrr_2025_lifetime_tier1', 'AppSumo 2025 Lifetime Tier 1'],
    ['agency_plus', 'Agency Plus Plan'],
    [null, 'Premium'],
  ])('formats %s as %s', (raw, expected) => {
    expect(formatJupitrrPlanName(raw)).toBe(expected);
  });
});
