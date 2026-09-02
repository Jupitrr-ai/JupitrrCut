import { getOwnerId } from '@lib/hooks/useAuth';
import {
  useAuthRepository,
  useClipRepository,
  useProjectRepository,
} from '@lib/providers/DatabaseProvider';
import type { Project } from '@shared/types';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

interface ProjectActions {
  addProject: (name: string) => Project;
  addProjectWithScript: (name: string, script: string, importedFromId?: string) => Project;
  upsertImportedProject: (name: string, script: string, importedFromId: string) => Project;
  updateProjectScript: (id: string, script: string) => void;
  updateProjectStatus: (id: string, status: Project['status']) => void;
  deleteProject: (id: string) => boolean;
  refreshProjects: () => void;
}

interface UseProjectStoreReturn extends ProjectActions {
  projects: Project[];
  getProject: (id: string) => Project | undefined;
}

let projectsCache: Project[] = [];
let isInitialized = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function resetProjectsCache(): void {
  projectsCache = [];
  isInitialized = false;
  listeners.clear();
}

export function invalidateProjectsCache(): void {
  isInitialized = false;
  notifyListeners();
}

export function useProjectStore(): UseProjectStoreReturn {
  const projectRepository = useProjectRepository();
  const authRepository = useAuthRepository();
  const clipRepository = useClipRepository();

  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => {
    if (!isInitialized) {
      projectsCache = projectRepository.getAll();
      // Self-heal legacy data: exports made before the done-transition existed
      // left projects stuck on 'filming' — an exported final cut means Complete.
      projectsCache = projectsCache.map((p) => {
        if (p.exportedVideoPath && p.status !== 'done') {
          return projectRepository.update(p.id, { status: 'done' }) ?? p;
        }
        // 'filming' with nothing recorded is really still Script Ready
        if (p.status === 'filming' && clipRepository) {
          const hasRecordedClip = clipRepository
            .getByProject(p.id)
            .some((c) => c.status === 'done');
          if (!hasRecordedClip) {
            return projectRepository.update(p.id, { status: 'scripted' }) ?? p;
          }
        }
        return p;
      });
      isInitialized = true;
    }
    return projectsCache;
  }, [projectRepository, clipRepository]);

  const projects = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const getProject = useCallback(
    (id: string): Project | undefined => {
      return projects.find((p) => p.id === id);
    },
    [projects]
  );

  const addProject = useCallback(
    (name: string): Project => {
      const authState = authRepository.getState();
      const ownerId = getOwnerId(authState);

      const newProject = projectRepository.create({
        name,
        status: 'scripted',
        script: '',
        source: 'local',
        ownerId,
      });

      projectsCache = [newProject, ...projectsCache];
      notifyListeners();
      return newProject;
    },
    [projectRepository, authRepository]
  );

  const addProjectWithScript = useCallback(
    (name: string, script: string, importedFromId?: string): Project => {
      const authState = authRepository.getState();
      const ownerId = getOwnerId(authState);

      const newProject = projectRepository.create({
        name,
        status: 'scripted',
        script,
        source: importedFromId ? 'imported' : 'local',
        ownerId,
        importedFromId,
      });

      projectsCache = [newProject, ...projectsCache];
      notifyListeners();
      return newProject;
    },
    [projectRepository, authRepository]
  );

  const upsertImportedProject = useCallback(
    (name: string, script: string, importedFromId: string): Project => {
      const existing = projectsCache.find((p) => p.importedFromId === importedFromId);
      if (existing) {
        const updated = projectRepository.update(existing.id, {
          name,
          script,
          importedAt: new Date(),
        });
        if (updated) {
          projectsCache = projectsCache.map((p) => (p.id === existing.id ? updated : p));
          notifyListeners();
          return updated;
        }
      }
      return addProjectWithScript(name, script, importedFromId);
    },
    [projectRepository, addProjectWithScript]
  );

  const updateProjectScript = useCallback(
    (id: string, script: string): void => {
      const updated = projectRepository.update(id, { script });
      if (updated) {
        projectsCache = projectsCache.map((p) => (p.id === id ? updated : p));
        notifyListeners();
      }
    },
    [projectRepository]
  );

  const updateProjectStatus = useCallback(
    (id: string, status: Project['status']): void => {
      const updated = projectRepository.update(id, { status });
      if (updated) {
        projectsCache = projectsCache.map((p) => (p.id === id ? updated : p));
        notifyListeners();
      }
    },
    [projectRepository]
  );

  const deleteProject = useCallback(
    (id: string): boolean => {
      const deleted = projectRepository.delete(id);
      if (deleted) {
        projectsCache = projectsCache.filter((p) => p.id !== id);
        notifyListeners();
      }
      return deleted;
    },
    [projectRepository]
  );

  const refreshProjects = useCallback((): void => {
    projectsCache = projectRepository.getAll();
    notifyListeners();
  }, [projectRepository]);

  return useMemo(
    () => ({
      projects,
      getProject,
      addProject,
      addProjectWithScript,
      upsertImportedProject,
      updateProjectScript,
      updateProjectStatus,
      deleteProject,
      refreshProjects,
    }),
    [
      projects,
      getProject,
      addProject,
      addProjectWithScript,
      upsertImportedProject,
      updateProjectScript,
      updateProjectStatus,
      deleteProject,
      refreshProjects,
    ]
  );
}
