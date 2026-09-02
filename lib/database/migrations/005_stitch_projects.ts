import type { SQLiteDatabase } from 'expo-sqlite';

export const VERSION = 5;

export function up(db: SQLiteDatabase): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS stitch_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      videos TEXT NOT NULL DEFAULT '[]',
      output_video_path TEXT,
      output_video_duration REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_stitch_projects_status ON stitch_projects(status);`);
}

export function down(_db: SQLiteDatabase): void {
  // Not implemented — drop table manually if needed.
}
