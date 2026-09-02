import { useClipRepository } from '@lib/providers/DatabaseProvider';
import type { Clip } from '@shared/types';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

interface ClipActions {
  addClip: (clip: Omit<Clip, 'id'>) => Clip;
  updateClip: (id: string, updates: Partial<Omit<Clip, 'id'>>) => void;
  deleteClip: (id: string) => boolean;
  deleteClipsByProject: (projectId: string) => number;
  createClipsBatch: (clips: Omit<Clip, 'id'>[]) => Clip[];
  reorderClips: (projectId: string, clipIds: string[]) => void;
  refreshClips: (projectId: string) => void;
}

interface UseClipStoreReturn extends ClipActions {
  getClipsByProject: (projectId: string) => Clip[];
  getClip: (id: string) => Clip | undefined;
}

const clipsCache = new Map<string, Clip[]>();
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function resetClipsCache(): void {
  clipsCache.clear();
  listeners.clear();
}

export function useClipStore(): UseClipStoreReturn {
  const clipRepository = useClipRepository();

  const subscribe = useCallback((onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
  }, []);

  const getSnapshot = useCallback(() => {
    return clipsCache;
  }, []);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const getClipsByProject = useCallback(
    (projectId: string): Clip[] => {
      if (!clipsCache.has(projectId)) {
        const clips = clipRepository.getByProject(projectId);
        clipsCache.set(projectId, clips);
      }
      return clipsCache.get(projectId) ?? [];
    },
    [clipRepository]
  );

  const getClip = useCallback(
    (id: string): Clip | undefined => {
      for (const clips of clipsCache.values()) {
        const clip = clips.find((c) => c.id === id);
        if (clip) return clip;
      }
      return clipRepository.getById(id) ?? undefined;
    },
    [clipRepository]
  );

  const addClip = useCallback(
    (clip: Omit<Clip, 'id'>): Clip => {
      const newClip = clipRepository.create(clip);
      const existing = clipsCache.get(clip.projectId) ?? [];
      clipsCache.set(clip.projectId, [...existing, newClip]);
      notifyListeners();
      return newClip;
    },
    [clipRepository]
  );

  const updateClip = useCallback(
    (id: string, updates: Partial<Omit<Clip, 'id'>>): void => {
      const updated = clipRepository.update(id, updates);
      if (updated) {
        const existing = clipsCache.get(updated.projectId) ?? [];
        clipsCache.set(
          updated.projectId,
          existing.map((c) => (c.id === id ? updated : c))
        );
        notifyListeners();
      }
    },
    [clipRepository]
  );

  const deleteClip = useCallback(
    (id: string): boolean => {
      const clip = clipRepository.getById(id);
      const deleted = clipRepository.delete(id);
      if (deleted && clip) {
        const existing = clipsCache.get(clip.projectId) ?? [];
        clipsCache.set(
          clip.projectId,
          existing.filter((c) => c.id !== id)
        );
        notifyListeners();
      }
      return deleted;
    },
    [clipRepository]
  );

  const deleteClipsByProject = useCallback(
    (projectId: string): number => {
      const count = clipRepository.deleteByProject(projectId);
      clipsCache.delete(projectId);
      notifyListeners();
      return count;
    },
    [clipRepository]
  );

  const createClipsBatch = useCallback(
    (clips: Omit<Clip, 'id'>[]): Clip[] => {
      const created = clipRepository.createBatch(clips);
      if (created.length > 0) {
        const projectId = created[0]!.projectId;
        const existing = clipsCache.get(projectId) ?? [];
        clipsCache.set(projectId, [...existing, ...created]);
        notifyListeners();
      }
      return created;
    },
    [clipRepository]
  );

  const reorderClips = useCallback(
    (projectId: string, clipIds: string[]): void => {
      clipRepository.reorder(projectId, clipIds);
      const refreshed = clipRepository.getByProject(projectId);
      clipsCache.set(projectId, refreshed);
      notifyListeners();
    },
    [clipRepository]
  );

  const refreshClips = useCallback(
    (projectId: string): void => {
      const clips = clipRepository.getByProject(projectId);
      clipsCache.set(projectId, clips);
      notifyListeners();
    },
    [clipRepository]
  );

  return useMemo(
    () => ({
      getClipsByProject,
      getClip,
      addClip,
      updateClip,
      deleteClip,
      deleteClipsByProject,
      createClipsBatch,
      reorderClips,
      refreshClips,
    }),
    [
      getClipsByProject,
      getClip,
      addClip,
      updateClip,
      deleteClip,
      deleteClipsByProject,
      createClipsBatch,
      reorderClips,
      refreshClips,
    ]
  );
}
