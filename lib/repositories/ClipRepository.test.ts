import type { SQLiteDatabase } from 'expo-sqlite';

import { createClipRepository } from './ClipRepository';

const mockRunSync = jest.fn(() => ({ changes: 1 }));
const mockGetFirstSync = jest.fn();
const mockGetAllSync = jest.fn();

const mockDb = {
  runSync: mockRunSync,
  getFirstSync: mockGetFirstSync,
  getAllSync: mockGetAllSync,
} as unknown as SQLiteDatabase;

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'clip-uuid-123'),
}));

describe('ClipRepository', () => {
  let repo: ReturnType<typeof createClipRepository>;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = createClipRepository(mockDb);
  });

  describe('getByProject', () => {
    it('should return clips ordered by index', () => {
      const mockRows = [
        {
          id: 'clip-1',
          project_id: 'proj-1',
          idx: 0,
          text: 'First clip',
          status: 'done',
          video_uri: '/path/to/video.mp4',
          thumbnail_uri: '/path/to/thumb.jpg',
          duration_seconds: 5.5,
        },
        {
          id: 'clip-2',
          project_id: 'proj-1',
          idx: 1,
          text: 'Second clip',
          status: 'empty',
          video_uri: null,
          thumbnail_uri: null,
          duration_seconds: null,
        },
      ];
      mockGetAllSync.mockReturnValueOnce(mockRows);

      const clips = repo.getByProject('proj-1');

      expect(mockGetAllSync).toHaveBeenCalledWith(
        'SELECT * FROM clips WHERE project_id = ? ORDER BY idx ASC',
        ['proj-1']
      );
      expect(clips).toHaveLength(2);
      expect(clips[0]?.text).toBe('First clip');
      expect(clips[0]?.videoUri).toBe('/path/to/video.mp4');
      expect(clips[1]?.videoUri).toBeUndefined();
    });
  });

  describe('getById', () => {
    it('should return clip when found', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: 'clip-1',
        project_id: 'proj-1',
        idx: 0,
        text: 'Test clip',
        status: 'recording',
        video_uri: null,
        thumbnail_uri: null,
        duration_seconds: null,
      });

      const clip = repo.getById('clip-1');

      expect(clip?.text).toBe('Test clip');
      expect(clip?.status).toBe('recording');
    });

    it('should return null when not found', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const clip = repo.getById('nonexistent');

      expect(clip).toBeNull();
    });
  });

  describe('create', () => {
    it('should insert clip and return with generated id', () => {
      const clip = repo.create({
        projectId: 'proj-1',
        index: 0,
        text: 'New clip text',
        status: 'empty',
        source: 'recorded',
      });

      expect(mockRunSync).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO clips'),
        expect.arrayContaining(['clip-uuid-123', 'proj-1', 0, 'New clip text'])
      );
      expect(clip.id).toBe('clip-uuid-123');
      expect(clip.text).toBe('New clip text');
    });
  });

  describe('update', () => {
    it('should update clip when found', () => {
      mockGetFirstSync.mockReturnValueOnce({
        id: 'clip-1',
        project_id: 'proj-1',
        idx: 0,
        text: 'Original',
        status: 'empty',
        video_uri: null,
        thumbnail_uri: null,
        duration_seconds: null,
      });

      const updated = repo.update('clip-1', {
        status: 'done',
        videoUri: '/new/path.mp4',
      });

      expect(updated?.status).toBe('done');
      expect(updated?.videoUri).toBe('/new/path.mp4');
    });

    it('should return null when clip not found', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const result = repo.update('nonexistent', { text: 'New' });

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete and return true when found', () => {
      mockRunSync.mockReturnValueOnce({ changes: 1 });

      const result = repo.delete('clip-1');

      expect(result).toBe(true);
    });

    it('should return false when not found', () => {
      mockRunSync.mockReturnValueOnce({ changes: 0 });

      const result = repo.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteByProject', () => {
    it('should delete all clips for project', () => {
      mockRunSync.mockReturnValueOnce({ changes: 5 });

      const count = repo.deleteByProject('proj-1');

      expect(count).toBe(5);
      expect(mockRunSync).toHaveBeenCalledWith('DELETE FROM clips WHERE project_id = ?', [
        'proj-1',
      ]);
    });
  });

  describe('createBatch', () => {
    it('should create multiple clips', () => {
      const clips = repo.createBatch([
        { projectId: 'proj-1', index: 0, text: 'Clip 1', status: 'empty', source: 'recorded' },
        { projectId: 'proj-1', index: 1, text: 'Clip 2', status: 'empty', source: 'recorded' },
      ]);

      expect(clips).toHaveLength(2);
      expect(mockRunSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('reorder', () => {
    it('should update indices for all clips', () => {
      repo.reorder('proj-1', ['clip-3', 'clip-1', 'clip-2']);

      expect(mockRunSync).toHaveBeenCalledTimes(3);
      expect(mockRunSync).toHaveBeenCalledWith(
        'UPDATE clips SET idx = ? WHERE id = ? AND project_id = ?',
        [0, 'clip-3', 'proj-1']
      );
      expect(mockRunSync).toHaveBeenCalledWith(
        'UPDATE clips SET idx = ? WHERE id = ? AND project_id = ?',
        [1, 'clip-1', 'proj-1']
      );
      expect(mockRunSync).toHaveBeenCalledWith(
        'UPDATE clips SET idx = ? WHERE id = ? AND project_id = ?',
        [2, 'clip-2', 'proj-1']
      );
    });
  });
});
