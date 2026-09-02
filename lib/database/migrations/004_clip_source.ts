import type { SQLiteDatabase } from 'expo-sqlite';

export const VERSION = 4;

export function up(db: SQLiteDatabase): void {
  db.execSync("ALTER TABLE clips ADD COLUMN source TEXT NOT NULL DEFAULT 'recorded';");
}

export function down(_db: SQLiteDatabase): void {
  // SQLite doesn't support DROP COLUMN before 3.35; safe to leave in place.
}
