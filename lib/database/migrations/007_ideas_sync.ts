import type { SQLiteDatabase } from 'expo-sqlite';

export const VERSION = 7;

interface ColumnInfo {
  name: string;
}

function columnExists(db: SQLiteDatabase, table: string, column: string): boolean {
  const cols = db.getAllSync<ColumnInfo>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function addColumnIfMissing(db: SQLiteDatabase, table: string, column: string, ddl: string): void {
  if (!columnExists(db, table, column)) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl};`);
  }
}

export function up(db: SQLiteDatabase): void {
  // ideas: sync metadata. needs_backfill defaults to 1 so every pre-existing
  // row gets picked up by the one-shot backfill on next launch. New rows
  // inserted after this migration set needs_backfill = 0 explicitly.
  addColumnIfMissing(db, 'ideas', 'organization_id', 'TEXT');
  addColumnIfMissing(db, 'ideas', 'author_id', 'TEXT');
  addColumnIfMissing(db, 'ideas', 'sync_state', `TEXT NOT NULL DEFAULT 'local_only'`);
  addColumnIfMissing(db, 'ideas', 'remote_updated_at', 'INTEGER');
  addColumnIfMissing(db, 'ideas', 'needs_backfill', 'INTEGER NOT NULL DEFAULT 1');

  db.execSync(`CREATE INDEX IF NOT EXISTS idx_ideas_sync_state ON ideas(sync_state);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_ideas_org ON ideas(organization_id);`);
  db.execSync(`CREATE INDEX IF NOT EXISTS idx_ideas_backfill ON ideas(needs_backfill);`);

  // auth_state: remember internal uid (metadata.uid from custom claims) and
  // active org. These let the sync service detect org-switch / user-switch
  // without racing the Firebase token. On first upgrade launch both are NULL
  // for existing rows; the login flow populates them from the token.
  addColumnIfMissing(db, 'auth_state', 'internal_uid', 'TEXT');
  addColumnIfMissing(db, 'auth_state', 'current_org_id', 'TEXT');
  addColumnIfMissing(db, 'auth_state', 'schema_upgraded_from_v6', 'INTEGER NOT NULL DEFAULT 1');
}

export function down(_db: SQLiteDatabase): void {
  // SQLite lacks DROP COLUMN prior to 3.35; not implemented.
}
