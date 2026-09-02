import type { PostHogEventProperties } from '@posthog/core';

import { posthog } from './posthog';

export function trackEvent(event: string, properties?: Record<string, unknown>): void {
  if (__DEV__) {
    console.log('[Analytics]', event, properties);
  }
  posthog.capture(event, properties as PostHogEventProperties | undefined);
}

export function identifyUser(properties: Record<string, unknown>): void {
  if (__DEV__) {
    console.log('[Analytics] identify', properties);
  }
  posthog.identify(undefined, properties as PostHogEventProperties);
}
