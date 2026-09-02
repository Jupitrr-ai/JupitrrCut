import type { SQLiteDatabase } from 'expo-sqlite';

export const VERSION = 8;

// Migration logic is intentionally self-contained (not importing
// lib/services/videoPath) so its behaviour stays frozen even if the app helper
// evolves. See lib/services/videoPath.ts for the runtime read/write resolution.

const DOC_DIR_MARKERS = ['/Documents/', '/files/'];

interface PathRow {
  id: string;
  value: string | null;
}

function tableExists(db: SQLiteDatabase, table: string): boolean {
  const row = db.getFirstSync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [table]
  );
  return !!row;
}

// Strip the volatile app-container prefix from an absolute Documents path,
// leaving the path relative to the documents root (may include a subdirectory
// such as `samples/`). Remote (http), simulator and already-relative values are
// returned unchanged.
function toRelative(value: string): string {
  if (value.startsWith('simulator://') || /^https?:\/\//i.test(value)) return value;
  const isAbsolute = value.startsWith('file://') || value.startsWith('/');
  if (!isAbsolute) return value;
  for (const marker of DOC_DIR_MARKERS) {
    const idx = value.lastIndexOf(marker);
    if (idx !== -1) return value.slice(idx + marker.length);
  }
  return value;
}

function normalizeColumn(db: SQLiteDatabase, table: string, column: string): void {
  if (!tableExists(db, table)) return;
  const rows = db.getAllSync<PathRow>(
    `SELECT id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL AND ${column} != ''`
  );
  for (const row of rows) {
    if (!row.value) continue;
    const relative = toRelative(row.value);
    if (relative !== row.value) {
      db.runSync(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [relative, row.id]);
    }
  }
}

// Rewrite previously-stored absolute video URIs to be relative to the Documents
// directory. Absolute URIs embed the iOS app-container UUID, which changes on
// reinstall/upgrade and silently broke playback of recorded/exported videos.
export function up(db: SQLiteDatabase): void {
  normalizeColumn(db, 'clips', 'video_uri');
  normalizeColumn(db, 'clips', 'thumbnail_uri');
  normalizeColumn(db, 'projects', 'exported_video_path');
  normalizeColumn(db, 'stitch_projects', 'output_video_path');
}

export function down(_db: SQLiteDatabase): void {
  // No-op: relative paths still resolve fine; we don't restore the old absolute
  // form (the original container prefix is unrecoverable anyway).
}
