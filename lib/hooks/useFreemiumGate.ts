import { useSettingsRepository } from '@lib/providers/DatabaseProvider';
import { trackEvent } from '@lib/services/analytics';
import {
  consumeFreeRun,
  decideGate,
  getConsumedFreeRunScope,
  type GateDecision,
} from '@lib/services/freemium';
import { getCombinedEntitlementStatus } from '@lib/services/purchases';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

export interface FreemiumGate {
  /** `checking` until the first entitlement lookup lands. */
  decision: GateDecision | 'checking';
  /**
   * Call on the tap that would start gated work. Returns false when the user was sent to the
   * paywall instead, in which case the caller must not navigate.
   */
  requireAccess: () => Promise<boolean>;
  /** Spend the free run on this scope. Call once the user has actually received the output. */
  consume: () => void;
}

/**
 * Gates the core flow on the premium entitlement or the one free run (see `freemium.ts`).
 *
 * The decision is refreshed on focus so returning from the paywall — or from the App Store
 * sheet — re-reads the entitlement rather than trusting a value captured on mount.
 */
export function useFreemiumGate(scope: string | null): FreemiumGate {
  const router = useRouter();
  const settingsRepo = useSettingsRepository();
  const [decision, setDecision] = useState<GateDecision | 'checking'>('checking');
  /* Focus can fire while a lookup is in flight; the stale one must not overwrite the new. */
  const requestIdRef = useRef(0);

  const evaluate = useCallback(async (): Promise<GateDecision> => {
    if (!scope) return 'allowed';
    const requestId = ++requestIdRef.current;
    const entitlement = await getCombinedEntitlementStatus();
    const next = decideGate(entitlement, getConsumedFreeRunScope(settingsRepo));
    if (requestId === requestIdRef.current) setDecision(next);
    return next;
  }, [scope, settingsRepo]);

  useFocusEffect(
    useCallback(() => {
      void evaluate();
    }, [evaluate])
  );

  const requireAccess = useCallback(async (): Promise<boolean> => {
    /* A cached `allowed` is safe to act on; anything else is re-checked, so a purchase made
       moments ago cannot leave the user staring at the paywall they just paid on. */
    const current = decision === 'allowed' ? decision : await evaluate();
    if (current === 'allowed') return true;
    trackEvent('freemium_gate_blocked', { scope });
    router.push('/paywall');
    return false;
  }, [decision, evaluate, router, scope]);

  const consume = useCallback(() => {
    if (!scope) return;
    consumeFreeRun(settingsRepo, scope);
    trackEvent('freemium_free_run_consumed', { scope });
  }, [scope, settingsRepo]);

  return { decision, requireAccess, consume };
}
