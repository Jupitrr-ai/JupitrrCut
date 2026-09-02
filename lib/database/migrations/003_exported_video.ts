import type { SQLiteDatabase } from 'expo-sqlite';

export const VERSION = 3;

export function up(db: SQLiteDatabase): void {
  db.execSync('ALTER TABLE projects ADD COLUMN exported_video_path TEXT;');
  db.execSync('ALTER TABLE projects ADD COLUMN exported_video_duration REAL;');
}

export function down(_db: SQLiteDatabase): void {
  // SQLite doesn't support DROP COLUMN before 3.35; safe to leave columns in place.
}
