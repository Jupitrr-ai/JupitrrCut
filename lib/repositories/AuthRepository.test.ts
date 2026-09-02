import type { SQLiteDatabase } from 'expo-sqlite';

import { createAuthRepository } from './AuthRepository';

const mockRunSync = jest.fn();
const mockGetFirstSync = jest.fn();

const mockDb = {
  runSync: mockRunSync,
  getFirstSync: mockGetFirstSync,
} as unknown as SQLiteDatabase;

describe('AuthRepository', () => {
  let repo: ReturnType<typeof createAuthRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = createAuthRepository(mockDb);
  });

  describe('getState', () => {
    it('should return auth state when exists', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: 1,
        mode: 'guest',
        guest_id: 'guest-123',
        firebase_uid: null,
        access_token: null,
        token_expires_at: null,
      });

      const state = repo.getState();

      expect(state?.mode).toBe('guest');
      expect(state?.guestId).toBe('guest-123');
      expect(state?.firebaseUid).toBeUndefined();
    });

    it('should return null when not initialized', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const state = repo.getState();

      expect(state).toBeNull();
    });
  });

  describe('initializeGuest', () => {
    it('should create guest state when not exists', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const state = repo.initializeGuest('new-guest-id');

      expect(mockRunSync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO auth_state'), [
        'new-guest-id',
      ]);
      expect(state.mode).toBe('guest');
      expect(state.guestId).toBe('new-guest-id');
    });

    it('should return existing state if already initialized', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: 1,
        mode: 'guest',
        guest_id: 'existing-guest',
        firebase_uid: null,
        access_token: null,
        token_expires_at: null,
      });

      const state = repo.initializeGuest('new-guest-id');

      expect(mockRunSync).not.toHaveBeenCalled();
      expect(state.guestId).toBe('existing-guest');
    });
  });

  describe('setAuthenticated', () => {
    it('should update to authenticated state', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: 1,
        mode: 'guest',
        guest_id: 'guest-123',
        firebase_uid: null,
        access_token: null,
        token_expires_at: null,
        internal_uid: null,
        current_org_id: null,
      });

      const state = repo.setAuthenticated({
        firebaseUid: 'firebase-uid',
        token: 'token-abc',
        expiresAt: 9999999,
        internalUid: 'internal-uid-1',
        currentOrgId: 'org-1',
      });

      expect(mockRunSync).toHaveBeenCalledWith(expect.stringContaining("mode = 'authenticated'"), [
        'firebase-uid',
        'token-abc',
        9999999,
        'internal-uid-1',
        'org-1',
      ]);
      expect(state.mode).toBe('authenticated');
      expect(state.firebaseUid).toBe('firebase-uid');
      expect(state.internalUid).toBe('internal-uid-1');
      expect(state.currentOrgId).toBe('org-1');
      expect(state.guestId).toBe('guest-123');
    });

    it('should throw if not initialized', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      expect(() =>
        repo.setAuthenticated({
          firebaseUid: 'uid',
          token: 'token',
          expiresAt: 9999,
          internalUid: 'internal',
          currentOrgId: 'org',
        })
      ).toThrow('Auth state not initialized');
    });
  });

  describe('clearAuthentication', () => {
    it('should clear auth and return to guest mode', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: 1,
        mode: 'authenticated',
        guest_id: 'guest-123',
        firebase_uid: 'firebase-uid',
        access_token: 'token',
        token_expires_at: 9999,
      });

      const state = repo.clearAuthentication();

      expect(mockRunSync).toHaveBeenCalledWith(expect.stringContaining("mode = 'guest'"));
      expect(state.mode).toBe('guest');
      expect(state.firebaseUid).toBeUndefined();
      expect(state.guestId).toBe('guest-123');
    });

    it('should throw if not initialized', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      expect(() => repo.clearAuthentication()).toThrow('Auth state not initialized');
    });
  });

  describe('updateToken', () => {
    it('should update token when authenticated', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: 1,
        mode: 'authenticated',
        guest_id: 'guest-123',
        firebase_uid: 'firebase-uid',
        access_token: 'old-token',
        token_expires_at: 1000,
      });

      const state = repo.updateToken('new-token', 2000);

      expect(mockRunSync).toHaveBeenCalledWith(expect.stringContaining('access_token'), [
        'new-token',
        2000,
      ]);
      expect(state?.accessToken).toBe('new-token');
      expect(state?.tokenExpiresAt).toBe(2000);
    });

    it('should return null when not authenticated', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: 1,
        mode: 'guest',
        guest_id: 'guest-123',
        firebase_uid: null,
        access_token: null,
        token_expires_at: null,
      });

      const state = repo.updateToken('new-token', 2000);

      expect(state).toBeNull();
      expect(mockRunSync).not.toHaveBeenCalled();
    });

    it('should return null when not initialized', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const state = repo.updateToken('new-token', 2000);

      expect(state).toBeNull();
    });
  });
});
