import type { AuthMode, AuthState } from '@shared/types';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { AuthRepository as IAuthRepository } from './types';

interface AuthRow {
  id: number;
  mode: string;
  guest_id: string;
  firebase_uid: string | null;
  access_token: string | null;
  token_expires_at: number | null;
  internal_uid: string | null;
  current_org_id: string | null;
}

function rowToAuthState(row: AuthRow): AuthState {
  return {
    mode: row.mode as AuthMode,
    guestId: row.guest_id,
    firebaseUid: row.firebase_uid ?? undefined,
    accessToken: row.access_token ?? undefined,
    tokenExpiresAt: row.token_expires_at ?? undefined,
    internalUid: row.internal_uid ?? undefined,
    currentOrgId: row.current_org_id ?? undefined,
  };
}

export function createAuthRepository(db: SQLiteDatabase): IAuthRepository {
  return {
    getState(): AuthState | null {
      const row = db.getFirstSync<AuthRow>('SELECT * FROM auth_state WHERE id = 1');
      return row ? rowToAuthState(row) : null;
    },

    initializeGuest(guestId: string): AuthState {
      const existing = this.getState();
      if (existing) {
        return existing;
      }

      db.runSync(`INSERT INTO auth_state (id, mode, guest_id) VALUES (1, 'guest', ?)`, [guestId]);

      return {
        mode: 'guest',
        guestId,
      };
    },

    setAuthenticated({ firebaseUid, token, expiresAt, internalUid, currentOrgId }): AuthState {
      const existing = this.getState();
      if (!existing) {
        throw new Error('Auth state not initialized');
      }

      db.runSync(
        `UPDATE auth_state SET
          mode = 'authenticated',
          firebase_uid = ?,
          access_token = ?,
          token_expires_at = ?,
          internal_uid = ?,
          current_org_id = ?
        WHERE id = 1`,
        [firebaseUid, token, expiresAt, internalUid, currentOrgId]
      );

      return {
        mode: 'authenticated',
        guestId: existing.guestId,
        firebaseUid,
        accessToken: token,
        tokenExpiresAt: expiresAt,
        internalUid,
        currentOrgId,
      };
    },

    clearAuthentication(): AuthState {
      const existing = this.getState();
      if (!existing) {
        throw new Error('Auth state not initialized');
      }

      db.runSync(
        `UPDATE auth_state SET
          mode = 'guest',
          firebase_uid = NULL,
          access_token = NULL,
          token_expires_at = NULL,
          internal_uid = NULL,
          current_org_id = NULL
        WHERE id = 1`
      );

      return {
        mode: 'guest',
        guestId: existing.guestId,
      };
    },

    updateToken(token: string, expiresAt: number): AuthState | null {
      const existing = this.getState();
      if (!existing || existing.mode !== 'authenticated') {
        return null;
      }

      db.runSync(
        `UPDATE auth_state SET
          access_token = ?,
          token_expires_at = ?
        WHERE id = 1`,
        [token, expiresAt]
      );

      return {
        ...existing,
        accessToken: token,
        tokenExpiresAt: expiresAt,
      };
    },

    updateClaims({ internalUid, currentOrgId }): AuthState | null {
      const existing = this.getState();
      if (!existing || existing.mode !== 'authenticated') {
        return null;
      }

      db.runSync(
        `UPDATE auth_state SET
          internal_uid = ?,
          current_org_id = ?
        WHERE id = 1`,
        [internalUid, currentOrgId]
      );

      return {
        ...existing,
        internalUid,
        currentOrgId,
      };
    },
  };
}
