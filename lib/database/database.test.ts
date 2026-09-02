import * as SQLite from 'expo-sqlite';

import {
  closeDatabase,
  getCurrentVersion,
  getDatabase,
  initializeDatabase,
  resetDatabase,
  runMigrations,
} from './index';

const mockExecSync = jest.fn();
const mockRunSync = jest.fn();
const mockGetFirstSync = jest.fn();
const mockGetAllSync = jest.fn(() => []);
const mockCloseSync = jest.fn();

const mockDb = {
  execSync: mockExecSync,
  runSync: mockRunSync,
  getFirstSync: mockGetFirstSync,
  getAllSync: mockGetAllSync,
  closeSync: mockCloseSync,
} as unknown as SQLite.SQLiteDatabase;

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => mockDb),
  deleteDatabaseSync: jest.fn(),
}));

describe('database', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    closeDatabase();
  });

  describe('getDatabase', () => {
    it('should open database and enable foreign keys', () => {
      const db = getDatabase();

      expect(SQLite.openDatabaseSync).toHaveBeenCalledWith('teleprompter.db');
      expect(mockExecSync).toHaveBeenCalledWith('PRAGMA foreign_keys = ON;');
      expect(db).toBe(mockDb);
    });

    it('should return same instance on subsequent calls', () => {
      const db1 = getDatabase();
      const db2 = getDatabase();

      expect(db1).toBe(db2);
      expect(SQLite.openDatabaseSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentVersion', () => {
    it('should return 0 when no version exists', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const version = getCurrentVersion(mockDb);

      expect(version).toBe(0);
    });

    it('should return current version from database', () => {
      mockGetFirstSync.mockReturnValueOnce({ version: 1 });

      const version = getCurrentVersion(mockDb);

      expect(version).toBe(1);
    });
  });

  describe('runMigrations', () => {
    it('should create schema_version table', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      runMigrations(mockDb);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_version')
      );
    });

    it('should run migration when version is behind', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      runMigrations(mockDb);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS projects')
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS clips')
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS auth_state')
      );
      expect(mockRunSync).toHaveBeenCalledWith(
        'INSERT INTO schema_version (version) VALUES (?)',
        [1]
      );
    });

    it('should not run migration when already at latest version', () => {
      mockGetFirstSync.mockReturnValueOnce({ version: 999 });

      runMigrations(mockDb);

      expect(mockRunSync).not.toHaveBeenCalledWith(
        'INSERT INTO schema_version (version) VALUES (?)',
        expect.anything()
      );
    });
  });

  describe('initializeDatabase', () => {
    it('should open database and run migrations', () => {
      mockGetFirstSync.mockReturnValueOnce(null);

      const db = initializeDatabase();

      expect(db).toBe(mockDb);
      expect(SQLite.openDatabaseSync).toHaveBeenCalled();
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS projects')
      );
    });
  });

  describe('resetDatabase', () => {
    it('should close and delete database', () => {
      getDatabase();
      resetDatabase();

      expect(mockCloseSync).toHaveBeenCalled();
      expect(SQLite.deleteDatabaseSync).toHaveBeenCalledWith('teleprompter.db');
    });
  });

  describe('closeDatabase', () => {
    it('should close database connection', () => {
      getDatabase();
      closeDatabase();

      expect(mockCloseSync).toHaveBeenCalled();
    });

    it('should handle closing when no database open', () => {
      expect(() => closeDatabase()).not.toThrow();
    });
  });
});
