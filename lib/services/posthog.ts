import PostHog from 'posthog-react-native';

/**
 * Standalone client (rather than letting PostHogProvider create its own) so trackEvent/identifyUser
 * in analytics.ts can call capture()/identify() directly outside of React's render tree.
 *
 * Opt-in — set EXPO_PUBLIC_POSTHOG_KEY to your own PostHog project key. Disabled (no-op) if unset.
 */
export const posthog = new PostHog(process.env.EXPO_PUBLIC_POSTHOG_KEY ?? 'phc_disabled', {
  host: 'https://us.i.posthog.com',
  // Don't pollute analytics from dev sessions, and no-op entirely without a configured key
  disabled: __DEV__ || !process.env.EXPO_PUBLIC_POSTHOG_KEY,
  captureAppLifecycleEvents: true,
});
