import type { SQLiteDatabase } from 'expo-sqlite';

import {
  AUTH_STATE_TABLE,
  CLIPS_INDEXES,
  CLIPS_TABLE,
  PROJECTS_INDEXES,
  PROJECTS_TABLE,
} from '../schema';

export const VERSION = 1;

export function up(db: SQLiteDatabase): void {
  db.execSync(PROJECTS_TABLE);
  db.execSync(PROJECTS_INDEXES);
  db.execSync(CLIPS_TABLE);
  db.execSync(CLIPS_INDEXES);
  db.execSync(AUTH_STATE_TABLE);
}

export function down(db: SQLiteDatabase): void {
  db.execSync('DROP TABLE IF EXISTS auth_state;');
  db.execSync('DROP TABLE IF EXISTS clips;');
  db.execSync('DROP TABLE IF EXISTS projects;');
}
