import { SETTINGS_KEY_ONBOARDING_COMPLETED } from '@features/onboarding/constants';
import { initializeDatabase } from '@lib/database';
import { createAuthRepository } from '@lib/repositories/AuthRepository';
import { createClipRepository } from '@lib/repositories/ClipRepository';
import { createIdeaRepository, type IdeaRepository } from '@lib/repositories/IdeaRepository';
import { createProjectRepository } from '@lib/repositories/ProjectRepository';
import { createSettingsRepository } from '@lib/repositories/SettingsRepository';
import {
  createStitchProjectRepository,
  type StitchProjectRepository,
} from '@lib/repositories/StitchProjectRepository';
import type {
  AuthRepository,
  ClipRepository,
  ProjectRepository,
  SettingsRepository,
} from '@lib/repositories/types';
import { seedMockProjectsIfNeeded, repairDemoClipDownloads } from '@lib/services/seedMockProjects';
import * as Crypto from 'expo-crypto';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

interface DatabaseContextValue {
  isReady: boolean;
  projectRepository: ProjectRepository | null;
  clipRepository: ClipRepository | null;
  authRepository: AuthRepository | null;
  settingsRepository: SettingsRepository | null;
  stitchProjectRepository: StitchProjectRepository | null;
  ideaRepository: IdeaRepository | null;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  isReady: false,
  projectRepository: null,
  clipRepository: null,
  authRepository: null,
  settingsRepository: null,
  stitchProjectRepository: null,
  ideaRepository: null,
});

interface DatabaseProviderProps {
  children: React.ReactNode;
}

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [repositories, setRepositories] = useState<{
    projectRepository: ProjectRepository | null;
    clipRepository: ClipRepository | null;
    authRepository: AuthRepository | null;
    settingsRepository: SettingsRepository | null;
    stitchProjectRepository: StitchProjectRepository | null;
    ideaRepository: IdeaRepository | null;
  }>({
    projectRepository: null,
    clipRepository: null,
    authRepository: null,
    settingsRepository: null,
    stitchProjectRepository: null,
    ideaRepository: null,
  });

  useEffect(() => {
    async function initialize() {
      const db = initializeDatabase();

      const projectRepo = createProjectRepository(db);
      const clipRepo = createClipRepository(db);
      const authRepo = createAuthRepository(db);
      const settingsRepo = createSettingsRepository(db);
      const stitchProjectRepo = createStitchProjectRepository(db);
      const ideaRepo = createIdeaRepository(db);

      const existingAuth = authRepo.getState();
      if (!existingAuth) {
        const guestId = Crypto.randomUUID();
        authRepo.initializeGuest(guestId);
      }

      // Seed demo projects only after onboarding — otherwise the grandfather
      // gate mistakes them for real user projects and skips onboarding.
      const onboardingCompleted = settingsRepo.get<boolean>(
        SETTINGS_KEY_ONBOARDING_COMPLETED,
        false
      );
      if (onboardingCompleted) {
        seedMockProjectsIfNeeded(projectRepo, clipRepo, authRepo);
      }

      setRepositories({
        projectRepository: projectRepo,
        clipRepository: clipRepo,
        authRepository: authRepo,
        settingsRepository: settingsRepo,
        stitchProjectRepository: stitchProjectRepo,
        ideaRepository: ideaRepo,
      });
      setIsReady(true);

      // Re-download any missing sample videos after the UI is ready.
      // Deferred so the startup path doesn't block on per-project SQLite
      // reads + synchronous file-existence checks (causes ANR on Android).
      setTimeout(() => {
        void repairDemoClipDownloads(projectRepo, clipRepo);
      }, 0);
    }

    initialize();
  }, []);

  const value = useMemo(
    () => ({
      isReady,
      ...repositories,
    }),
    [isReady, repositories]
  );

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}

export function useProjectRepository(): ProjectRepository {
  const { projectRepository, isReady } = useDatabase();
  if (!isReady || !projectRepository) {
    throw new Error('Database not ready');
  }
  return projectRepository;
}

export function useClipRepository(): ClipRepository {
  const { clipRepository, isReady } = useDatabase();
  if (!isReady || !clipRepository) {
    throw new Error('Database not ready');
  }
  return clipRepository;
}

export function useAuthRepository(): AuthRepository {
  const { authRepository, isReady } = useDatabase();
  if (!isReady || !authRepository) {
    throw new Error('Database not ready');
  }
  return authRepository;
}

export function useSettingsRepository(): SettingsRepository {
  const { settingsRepository, isReady } = useDatabase();
  if (!isReady || !settingsRepository) {
    throw new Error('Database not ready');
  }
  return settingsRepository;
}

export function useStitchProjectRepository(): StitchProjectRepository {
  const { stitchProjectRepository, isReady } = useDatabase();
  if (!isReady || !stitchProjectRepository) {
    throw new Error('Database not ready');
  }
  return stitchProjectRepository;
}

export function useIdeaRepository(): IdeaRepository {
  const { ideaRepository, isReady } = useDatabase();
  if (!isReady || !ideaRepository) {
    throw new Error('Database not ready');
  }
  return ideaRepository;
}
