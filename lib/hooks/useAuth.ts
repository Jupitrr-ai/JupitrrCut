import { useDatabase } from '@lib/providers/DatabaseProvider';
import type { AuthState } from '@shared/types';
import { useCallback, useSyncExternalStore } from 'react';

interface UseAuthReturn {
  authState: AuthState | null;
  isGuest: boolean;
  guestId: string | null;
}

let authStateCache: AuthState | null = null;
const listeners = new Set<() => void>();

export function resetAuthCache(): void {
  authStateCache = null;
  listeners.clear();
}

/**
 * Local-only guest-identity hook. This OSS build has no login/account concept — every
 * install is a guest identified by a locally generated `guestId`. Kept as a hook (rather
 * than reading `authRepository` directly everywhere) so callers that only need the local
 * owner id don't need to know about the underlying repository.
 */
export function useAuth(): UseAuthReturn {
  const { authRepository } = useDatabase();
  if (!authRepository) {
    throw new Error('useAuth requires DatabaseProvider');
  }

  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => {
    if (authStateCache === null) {
      authStateCache = authRepository.getState();
    }
    return authStateCache;
  }, [authRepository]);

  const authState = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    authState,
    isGuest: authState?.mode === 'guest',
    guestId: authState?.guestId ?? null,
  };
}

export function getOwnerId(authState: AuthState | null): string {
  if (!authState) {
    throw new Error('Auth state not initialized');
  }

  return `guest_${authState.guestId}`;
}
