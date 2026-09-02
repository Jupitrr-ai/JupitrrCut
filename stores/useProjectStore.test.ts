import { act, renderHook } from '@testing-library/react-native';

import { resetProjectsCache, useProjectStore } from './useProjectStore';

const mockGetAll = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockGetState = jest.fn();
const mockClipGetByProject = jest.fn();

jest.mock('@lib/providers/DatabaseProvider', () => ({
  useProjectRepository: () => ({
    getAll: mockGetAll,
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
  }),
  useAuthRepository: () => ({
    getState: mockGetState,
  }),
  useClipRepository: () => ({
    getByProject: mockClipGetByProject,
  }),
}));

describe('useProjectStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetProjectsCache();
    mockGetState.mockReturnValue({
      mode: 'guest',
      guestId: 'test-guest-123',
    });
    mockClipGetByProject.mockReturnValue([]);
  });

  describe('projects', () => {
    it('should load projects from repository', () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project 1',
          status: 'scripted',
          script: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          source: 'local',
          ownerId: 'guest_test',
        },
      ];
      mockGetAll.mockReturnValue(mockProjects);

      const { result } = renderHook(() => useProjectStore());

      expect(result.current.projects).toEqual(mockProjects);
      expect(mockGetAll).toHaveBeenCalled();
    });

    it('should cache projects after first load', () => {
      mockGetAll.mockReturnValue([]);

      const { result, rerender } = renderHook(() => useProjectStore());

      expect(result.current.projects).toEqual([]);
      expect(mockGetAll).toHaveBeenCalledTimes(1);

      rerender({});

      expect(mockGetAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProject', () => {
    it('should return project by id', () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'Project 1',
          status: 'scripted',
          script: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          source: 'local',
          ownerId: 'guest_test',
        },
      ];
      mockGetAll.mockReturnValue(mockProjects);

      const { result } = renderHook(() => useProjectStore());

      expect(result.current.getProject('proj-1')?.name).toBe('Project 1');
    });

    it('should return undefined for non-existent project', () => {
      mockGetAll.mockReturnValue([]);

      const { result } = renderHook(() => useProjectStore());

      expect(result.current.getProject('nonexistent')).toBeUndefined();
    });
  });

  describe('addProject', () => {
    it('should create project via repository', () => {
      const newProject = {
        id: 'new-proj',
        name: 'New Project',
        status: 'scripted',
        script: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'local',
        ownerId: 'guest_test-guest-123',
      };
      mockGetAll.mockReturnValue([]);
      mockCreate.mockReturnValue(newProject);

      const { result } = renderHook(() => useProjectStore());

      let created: typeof newProject | undefined;
      act(() => {
        created = result.current.addProject('New Project');
      });

      expect(mockCreate).toHaveBeenCalledWith({
        name: 'New Project',
        status: 'scripted',
        script: '',
        source: 'local',
        ownerId: 'guest_test-guest-123',
      });
      expect(created?.name).toBe('New Project');
    });

    it('should add new project to cache', () => {
      const existingProject = {
        id: 'existing',
        name: 'Existing',
        status: 'scripted',
        script: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'local',
        ownerId: 'guest_test',
      };
      const newProject = {
        id: 'new',
        name: 'New',
        status: 'scripted',
        script: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'local',
        ownerId: 'guest_test-guest-123',
      };
      mockGetAll.mockReturnValue([existingProject]);
      mockCreate.mockReturnValue(newProject);

      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.addProject('New');
      });

      expect(result.current.projects).toHaveLength(2);
      expect(result.current.projects[0]?.name).toBe('New');
    });
  });

  describe('updateProjectScript', () => {
    it('should update script via repository', () => {
      const project = {
        id: 'proj-1',
        name: 'Project',
        status: 'scripted',
        script: 'old script',
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'local',
        ownerId: 'guest_test',
      };
      const updatedProject = { ...project, script: 'new script' };
      mockGetAll.mockReturnValue([project]);
      mockUpdate.mockReturnValue(updatedProject);

      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.updateProjectScript('proj-1', 'new script');
      });

      expect(mockUpdate).toHaveBeenCalledWith('proj-1', { script: 'new script' });
      expect(result.current.getProject('proj-1')?.script).toBe('new script');
    });
  });

  describe('updateProjectStatus', () => {
    it('should update status via repository', () => {
      const project = {
        id: 'proj-1',
        name: 'Project',
        status: 'scripted',
        script: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'local',
        ownerId: 'guest_test',
      };
      const updatedProject = { ...project, status: 'filming' };
      mockGetAll.mockReturnValue([project]);
      mockUpdate.mockReturnValue(updatedProject);

      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.updateProjectStatus('proj-1', 'filming');
      });

      expect(mockUpdate).toHaveBeenCalledWith('proj-1', { status: 'filming' });
      expect(result.current.getProject('proj-1')?.status).toBe('filming');
    });
  });

  describe('deleteProject', () => {
    it('should delete via repository and remove from cache', () => {
      const project = {
        id: 'proj-1',
        name: 'Project',
        status: 'scripted',
        script: '',
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'local',
        ownerId: 'guest_test',
      };
      mockGetAll.mockReturnValue([project]);
      mockDelete.mockReturnValue(true);

      const { result } = renderHook(() => useProjectStore());

      let deleted: boolean | undefined;
      act(() => {
        deleted = result.current.deleteProject('proj-1');
      });

      expect(deleted).toBe(true);
      expect(result.current.projects).toHaveLength(0);
    });
  });
});
