import type { SQLiteDatabase } from 'expo-sqlite';

import { SETTINGS_TABLE } from '../schema';

export const VERSION = 2;

export function up(db: SQLiteDatabase): void {
  db.execSync(SETTINGS_TABLE);
}

export function down(db: SQLiteDatabase): void {
  db.execSync('DROP TABLE IF EXISTS settings;');
}
