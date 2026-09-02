const JUPITRR_PLAN_LABELS: Record<string, string> = {
  starter: 'Starter Plan',
  creator: 'Creator Plan',
  growth: 'Growth Plan',
  pro: 'Pro Plan',
  team: 'Team Plan',
  videoos_pro: 'Pro Plan',
  videoos_team: 'Team Plan',
  videoos_scale: 'Scale Plan',
  jupitrr_tier1: 'AppSumo Tier 1',
  jupitrr_tier2: 'AppSumo Tier 2',
  jupitrr_tier3: 'AppSumo Tier 3',
  jupitrr_2025_annual_tier1: 'AppSumo 2025 Annual Tier 1',
  jupitrr_2025_annual_tier2: 'AppSumo 2025 Annual Tier 2',
  jupitrr_2025_annual_tier3: 'AppSumo 2025 Annual Tier 3',
  jupitrr_2025_lifetime_tier1: 'AppSumo 2025 Lifetime Tier 1',
};

/** Matches the customer-facing plan names used by the Jupitrr website. */
export function formatJupitrrPlanName(planName: string | null | undefined): string {
  if (!planName) return 'Premium';
  const normalized = planName.trim().toLowerCase();
  const knownLabel = JUPITRR_PLAN_LABELS[normalized];
  if (knownLabel) return knownLabel;

  const readable = normalized
    .replace(/^videoos[_-]/, '')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  if (!readable || readable === 'Premium') return 'Premium';
  return `${readable} Plan`;
}
