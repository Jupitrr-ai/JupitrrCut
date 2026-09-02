import type { AuthState, Clip, Project, ProjectSource, ProjectStatus } from '@shared/types';

export interface ProjectRepository {
  getAll(): Project[];
  getById(id: string): Project | null;
  getBySource(source: ProjectSource): Project[];
  getByStatus(status: ProjectStatus): Project[];
  create(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project;
  update(id: string, updates: Partial<Omit<Project, 'id'>>): Project | null;
  delete(id: string): boolean;
  migrateOwnership(fromOwnerId: string, toOwnerId: string): number;
}

export interface ClipRepository {
  getByProject(projectId: string): Clip[];
  getById(id: string): Clip | null;
  create(clip: Omit<Clip, 'id'>): Clip;
  update(id: string, updates: Partial<Omit<Clip, 'id'>>): Clip | null;
  delete(id: string): boolean;
  deleteByProject(projectId: string): number;
  createBatch(clips: Omit<Clip, 'id'>[]): Clip[];
  reorder(projectId: string, clipIds: string[]): void;
}

export interface AuthRepository {
  getState(): AuthState | null;
  initializeGuest(guestId: string): AuthState;
  setAuthenticated(input: {
    firebaseUid: string;
    token: string;
    expiresAt: number;
    internalUid: string;
    currentOrgId: string;
  }): AuthState;
  clearAuthentication(): AuthState;
  updateToken(token: string, expiresAt: number): AuthState | null;
  updateClaims(input: { internalUid: string; currentOrgId: string }): AuthState | null;
}

export type TeleprompterFont =
  | 'VarelaRound_400Regular'
  | 'Nunito_400Regular'
  | 'OpenSans_400Regular'
  | 'Lato_400Regular'
  | 'Raleway_400Regular'
  | 'Inter_400Regular'
  | 'Poppins_400Regular'
  | 'Lexend_400Regular'
  | 'AtkinsonHyperlegible_400Regular'
  | 'Merriweather_400Regular';

export interface TeleprompterSettings {
  textSize: number;
  scrollSpeed: number;
  fontFamily: TeleprompterFont;
  preparationDelaySeconds: number;
}

export interface SettingsRepository {
  get<T>(key: string, defaultValue: T): T;
  set<T>(key: string, value: T): void;
  delete(key: string): boolean;
  getTeleprompterSettings(): TeleprompterSettings;
  setTeleprompterSettings(settings: Partial<TeleprompterSettings>): TeleprompterSettings;
  /** Words-per-scene target used when auto-splitting a pasted script. */
  getAutoSplitWordsPerGroup(): number;
  setAutoSplitWordsPerGroup(value: number): number;
}
