import { resolveDocumentPath, toDocumentRelativePath } from '@lib/services/videoPath';
import type { Clip, ClipSource, ClipStatus } from '@shared/types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ClipRepository as IClipRepository } from './types';

interface ClipRow {
  id: string;
  project_id: string;
  idx: number;
  text: string;
  status: string;
  source: string;
  video_uri: string | null;
  thumbnail_uri: string | null;
  duration_seconds: number | null;
}

function rowToClip(row: ClipRow): Clip {
  return {
    id: row.id,
    projectId: row.project_id,
    index: row.idx,
    text: row.text,
    status: row.status as ClipStatus,
    source: (row.source ?? 'recorded') as ClipSource,
    // Stored relative to the Documents directory; resolved against the current
    // container so paths survive app upgrades. See lib/services/videoPath.ts.
    videoUri: resolveDocumentPath(row.video_uri),
    thumbnailUri: resolveDocumentPath(row.thumbnail_uri),
    durationSeconds: row.duration_seconds ?? undefined,
  };
}

export function createClipRepository(db: SQLiteDatabase): IClipRepository {
  return {
    getByProject(projectId: string): Clip[] {
      const rows = db.getAllSync<ClipRow>(
        'SELECT * FROM clips WHERE project_id = ? ORDER BY idx ASC',
        [projectId]
      );
      return rows.map(rowToClip);
    },

    getById(id: string): Clip | null {
      const row = db.getFirstSync<ClipRow>('SELECT * FROM clips WHERE id = ?', [id]);
      return row ? rowToClip(row) : null;
    },

    create(clip: Omit<Clip, 'id'>): Clip {
      const id = Crypto.randomUUID();

      db.runSync(
        `INSERT INTO clips (
          id, project_id, idx, text, status, source,
          video_uri, thumbnail_uri, duration_seconds
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          clip.projectId,
          clip.index,
          clip.text,
          clip.status,
          clip.source ?? 'recorded',
          toDocumentRelativePath(clip.videoUri) ?? null,
          toDocumentRelativePath(clip.thumbnailUri) ?? null,
          clip.durationSeconds ?? null,
        ]
      );

      return { ...clip, id, source: clip.source ?? 'recorded' };
    },

    update(id: string, updates: Partial<Omit<Clip, 'id'>>): Clip | null {
      const existing = this.getById(id);
      if (!existing) return null;

      const updated: Clip = { ...existing, ...updates };

      db.runSync(
        `UPDATE clips SET
          project_id = ?, idx = ?, text = ?, status = ?, source = ?,
          video_uri = ?, thumbnail_uri = ?, duration_seconds = ?
        WHERE id = ?`,
        [
          updated.projectId,
          updated.index,
          updated.text,
          updated.status,
          updated.source,
          toDocumentRelativePath(updated.videoUri) ?? null,
          toDocumentRelativePath(updated.thumbnailUri) ?? null,
          updated.durationSeconds ?? null,
          id,
        ]
      );

      return updated;
    },

    delete(id: string): boolean {
      const result = db.runSync('DELETE FROM clips WHERE id = ?', [id]);
      return result.changes > 0;
    },

    deleteByProject(projectId: string): number {
      const result = db.runSync('DELETE FROM clips WHERE project_id = ?', [projectId]);
      return result.changes;
    },

    createBatch(clips: Omit<Clip, 'id'>[]): Clip[] {
      const created: Clip[] = [];

      for (const clip of clips) {
        const id = Crypto.randomUUID();

        db.runSync(
          `INSERT INTO clips (
            id, project_id, idx, text, status, source,
            video_uri, thumbnail_uri, duration_seconds
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            clip.projectId,
            clip.index,
            clip.text,
            clip.status,
            clip.source ?? 'recorded',
            toDocumentRelativePath(clip.videoUri) ?? null,
            toDocumentRelativePath(clip.thumbnailUri) ?? null,
            clip.durationSeconds ?? null,
          ]
        );

        created.push({ ...clip, id, source: clip.source ?? 'recorded' });
      }

      return created;
    },

    reorder(projectId: string, clipIds: string[]): void {
      clipIds.forEach((clipId, index) => {
        db.runSync('UPDATE clips SET idx = ? WHERE id = ? AND project_id = ?', [
          index,
          clipId,
          projectId,
        ]);
      });
    },
  };
}
