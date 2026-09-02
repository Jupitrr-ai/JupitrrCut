import { resolveDocumentPath, toDocumentRelativePath } from '@lib/services/videoPath';
import type { StitchProject, StitchProjectStatus, StitchVideo } from '@shared/types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

interface StitchProjectRow {
  id: string;
  name: string;
  status: string;
  videos: string;
  output_video_path: string | null;
  output_video_duration: number | null;
  created_at: number;
  updated_at: number;
}

function rowToProject(row: StitchProjectRow): StitchProject {
  let videos: StitchVideo[] = [];
  try {
    videos = JSON.parse(row.videos) as StitchVideo[];
  } catch {
    videos = [];
  }
  return {
    id: row.id,
    name: row.name,
    status: row.status as StitchProjectStatus,
    videos,
    // Stored relative to the Documents directory; resolved against the current
    // container so the stitched output survives app upgrades.
    outputVideoPath: resolveDocumentPath(row.output_video_path),
    outputVideoDuration: row.output_video_duration ?? undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface StitchProjectRepository {
  getAll(): StitchProject[];
  getById(id: string): StitchProject | null;
  create(name: string): StitchProject;
  updateVideos(id: string, videos: StitchVideo[]): StitchProject | null;
  markDone(id: string, outputVideoPath: string, outputVideoDuration?: number): StitchProject | null;
  rename(id: string, name: string): StitchProject | null;
  delete(id: string): boolean;
}

export function createStitchProjectRepository(db: SQLiteDatabase): StitchProjectRepository {
  return {
    getAll(): StitchProject[] {
      const rows = db.getAllSync<StitchProjectRow>(
        'SELECT * FROM stitch_projects ORDER BY updated_at DESC'
      );
      return rows.map(rowToProject);
    },

    getById(id: string): StitchProject | null {
      const row = db.getFirstSync<StitchProjectRow>('SELECT * FROM stitch_projects WHERE id = ?', [
        id,
      ]);
      return row ? rowToProject(row) : null;
    },

    create(name: string): StitchProject {
      const id = Crypto.randomUUID();
      const now = Date.now();
      db.runSync(
        `INSERT INTO stitch_projects (id, name, status, videos, created_at, updated_at)
         VALUES (?, ?, 'draft', '[]', ?, ?)`,
        [id, name, now, now]
      );
      return {
        id,
        name,
        status: 'draft',
        videos: [],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    },

    updateVideos(id: string, videos: StitchVideo[]): StitchProject | null {
      const now = Date.now();
      const result = db.runSync(
        `UPDATE stitch_projects SET videos = ?, updated_at = ? WHERE id = ?`,
        [JSON.stringify(videos), now, id]
      );
      if (result.changes === 0) return null;
      return this.getById(id);
    },

    markDone(
      id: string,
      outputVideoPath: string,
      outputVideoDuration?: number
    ): StitchProject | null {
      const now = Date.now();
      const result = db.runSync(
        `UPDATE stitch_projects
         SET status = 'done', output_video_path = ?, output_video_duration = ?, updated_at = ?
         WHERE id = ?`,
        [toDocumentRelativePath(outputVideoPath) ?? null, outputVideoDuration ?? null, now, id]
      );
      if (result.changes === 0) return null;
      return this.getById(id);
    },

    rename(id: string, name: string): StitchProject | null {
      const now = Date.now();
      const result = db.runSync(
        `UPDATE stitch_projects SET name = ?, updated_at = ? WHERE id = ?`,
        [name, now, id]
      );
      if (result.changes === 0) return null;
      return this.getById(id);
    },

    delete(id: string): boolean {
      const result = db.runSync('DELETE FROM stitch_projects WHERE id = ?', [id]);
      return result.changes > 0;
    },
  };
}
