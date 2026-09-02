import * as SQLite from 'expo-sqlite';

import * as migration001 from './migrations/001_initial';
import * as migration002 from './migrations/002_settings';
import * as migration003 from './migrations/003_exported_video';
import * as migration004 from './migrations/004_clip_source';
import * as migration005 from './migrations/005_stitch_projects';
import * as migration006 from './migrations/006_ideas';
import * as migration007 from './migrations/007_ideas_sync';
import * as migration008 from './migrations/008_relative_video_paths';
import { SCHEMA_VERSION_TABLE } from './schema';

const DATABASE_NAME = 'teleprompter.db';

const MIGRATIONS = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
];

let dbInstance: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!dbInstance) {
    dbInstance = SQLite.openDatabaseSync(DATABASE_NAME);
    dbInstance.execSync('PRAGMA foreign_keys = ON;');
  }
  return dbInstance;
}

export function getCurrentVersion(db: SQLite.SQLiteDatabase): number {
  const result = db.getFirstSync<{ version: number }>(
    'SELECT version FROM schema_version ORDER BY version DESC LIMIT 1'
  );
  return result?.version ?? 0;
}

function setVersion(db: SQLite.SQLiteDatabase, version: number): void {
  db.runSync('INSERT INTO schema_version (version) VALUES (?)', [version]);
}

export function runMigrations(db: SQLite.SQLiteDatabase): void {
  db.execSync(SCHEMA_VERSION_TABLE);

  const currentVersion = getCurrentVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.VERSION > currentVersion) {
      migration.up(db);
      setVersion(db, migration.VERSION);
    }
  }
}

export function initializeDatabase(): SQLite.SQLiteDatabase {
  const db = getDatabase();
  runMigrations(db);
  return db;
}

export function resetDatabase(): void {
  if (dbInstance) {
    dbInstance.closeSync();
    dbInstance = null;
  }
  SQLite.deleteDatabaseSync(DATABASE_NAME);
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.closeSync();
    dbInstance = null;
  }
}
