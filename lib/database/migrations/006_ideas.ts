import type { SQLiteDatabase } from 'expo-sqlite';

export const VERSION = 6;

export function up(db: SQLiteDatabase): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS ideas (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      url TEXT,
      preview_title TEXT,
      preview_thumbnail TEXT,
      preview_author TEXT,
      preview_views TEXT,
      preview_likes TEXT,
      preview_provider TEXT,
      owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_ideas_owner ON ideas(owner_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_ideas_type ON ideas(type);`);
}

export function down(_db: SQLiteDatabase): void {
  // Not implemented — drop table manually if needed.
}
