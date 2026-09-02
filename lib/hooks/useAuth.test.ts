import type { AuthState } from '@shared/types';
import { renderHook } from '@testing-library/react-native';

import { getOwnerId, resetAuthCache, useAuth } from './useAuth';

const mockGetState = jest.fn();

jest.mock('@lib/providers/DatabaseProvider', () => ({
  useDatabase: () => ({
    authRepository: {
      getState: mockGetState,
    },
    isReady: true,
    projectRepository: null,
    clipRepository: null,
    settingsRepository: null,
    stitchProjectRepository: null,
    ideaRepository: null,
  }),
}));

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthCache();
  });

  describe('guest mode', () => {
    beforeEach(() => {
      mockGetState.mockReturnValue({
        mode: 'guest',
        guestId: 'test-guest-123',
      });
    });

    it('should return guestId', () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current.guestId).toBe('test-guest-123');
    });

    it('should return same guestId across re-renders', () => {
      const { result, rerender } = renderHook(() => useAuth());

      const firstGuestId = result.current.guestId;
      rerender({});
      const secondGuestId = result.current.guestId;

      expect(firstGuestId).toBe(secondGuestId);
    });

    it('should return isGuest as true', () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current.isGuest).toBe(true);
    });
  });
});

describe('getOwnerId', () => {
  it('should return guest_guestId', () => {
    const authState: AuthState = {
      mode: 'guest',
      guestId: 'guest-123',
    };

    expect(getOwnerId(authState)).toBe('guest_guest-123');
  });

  it('should throw when authState is null', () => {
    expect(() => getOwnerId(null)).toThrow('Auth state not initialized');
  });
});
