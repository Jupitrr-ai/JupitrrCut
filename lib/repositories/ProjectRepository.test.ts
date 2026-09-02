import type { SQLiteDatabase } from 'expo-sqlite';

import { createProjectRepository } from './ProjectRepository';

const mockRunSync = jest.fn(() => ({ changes: 1 }));
const mockGetFirstSync = jest.fn();
const mockGetAllSync = jest.fn();

const mockDb = {
  runSync: mockRunSync,
  getFirstSync: mockGetFirstSync,
  getAllSync: mockGetAllSync,
} as unknown as SQLiteDatabase;

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'test-uuid-123'),
}));

describe('ProjectRepository', () => {
  let repo: ReturnType<typeof createProjectRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = createProjectRepository(mockDb);
  });

  describe('getAll', () => {
    it('should return all projects ordered by updated_at', () => {
      const mockRows = [
        {
          id: '1',
          name: 'Project 1',
          status: 'scripted',
          script: 'test',
          created_at: 1000,
          updated_at: 2000,
          source: 'local',
          imported_from_id: null,
          imported_at: null,
          owner_id: 'guest_123',
        },
      ];
      mockGetAllSync.mockReturnValueOnce(mockRows);

      const projects = repo.getAll();

      expect(mockGetAllSync).toHaveBeenCalledWith(
        'SELECT * FROM projects ORDER BY updated_at DESC'
      );
      expect(projects).toHaveLength(1);
      expect(projects[0]?.name).toBe('Project 1');
      expect(projects[0]?.createdAt).toEqual(new Date(1000));
    });
  });

  describe('getById', () => {
    it('should return project when found', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: '1',
        name: 'Test Project',
        status: 'filming',
        script: 'script',
        created_at: 1000,
        updated_at: 2000,
        source: 'imported',
        imported_from_id: 'brief-123',
        imported_at: 1500,
        owner_id: 'user-456',
      });

      const project = repo.getById('1');

      expect(project?.name).toBe('Test Project');
      expect(project?.importedFromId).toBe('brief-123');
      expect(project?.importedAt).toEqual(new Date(1500));
    });

    it('should return null when not found', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const project = repo.getById('nonexistent');

      expect(project).toBeNull();
    });
  });

  describe('getBySource', () => {
    it('should filter by source', () => {
      mockGetAllSync.mockReturnValueOnce([]);

      repo.getBySource('imported');

      expect(mockGetAllSync).toHaveBeenCalledWith(
        'SELECT * FROM projects WHERE source = ? ORDER BY updated_at DESC',
        ['imported']
      );
    });
  });

  describe('getByStatus', () => {
    it('should filter by status', () => {
      mockGetAllSync.mockReturnValueOnce([]);

      repo.getByStatus('filming');

      expect(mockGetAllSync).toHaveBeenCalledWith(
        'SELECT * FROM projects WHERE status = ? ORDER BY updated_at DESC',
        ['filming']
      );
    });
  });

  describe('create', () => {
    it('should insert project and return with generated id', () => {
      const project = repo.create({
        name: 'New Project',
        status: 'scripted',
        script: 'My script',
        source: 'local',
        ownerId: 'guest_abc',
      });

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects'),
        expect.arrayContaining(['test-uuid-123', 'New Project', 'scripted'])
      );
      expect(project.id).toBe('test-uuid-123');
      expect(project.name).toBe('New Project');
      expect(project.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('update', () => {
    it('should update project when found', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: '1',
        name: 'Original',
        status: 'scripted',
        script: '',
        created_at: 1000,
        updated_at: 1000,
        source: 'local',
        imported_from_id: null,
        imported_at: null,
        owner_id: 'guest_123',
      });

      const updated = repo.update('1', { name: 'Updated Name' });

      expect(updated?.name).toBe('Updated Name');
      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE projects'),
        expect.arrayContaining(['Updated Name'])
      );
    });

    it('should return null when project not found', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const result = repo.update('nonexistent', { name: 'New' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete and return true when found', () => {
      mockRunSync.mockReturnValueOnce({ changes: 1 });

      const result = repo.delete('1');

      expect(result).toBe(true);
      expect(mockRunSync).toHaveBeenCalledWith('DELETE FROM projects WHERE id = ?', ['1']);
    });

    it('should return false when not found', () => {
      mockRunSync.mockReturnValueOnce({ changes: 0 });

      const result = repo.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('migrateOwnership', () => {
    it('should update all projects matching owner', () => {
      mockRunSync.mockReturnValueOnce({ changes: 3 });

      const count = repo.migrateOwnership('guest_old', 'user_new');

      expect(count).toBe(3);
      expect(mockRunSync).toHaveBeenCalledWith(
        'UPDATE projects SET owner_id = ?, updated_at = ? WHERE owner_id = ?',
        expect.arrayContaining(['user_new', 'guest_old'])
      );
    });
  });
});
