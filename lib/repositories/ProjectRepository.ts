import { resolveDocumentPath, toDocumentRelativePath } from '@lib/services/videoPath';
import type { Project, ProjectSource, ProjectStatus } from '@shared/types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { ProjectRepository as IProjectRepository } from './types';

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  script: string;
  created_at: number;
  updated_at: number;
  source: string;
  imported_from_id: string | null;
  imported_at: number | null;
  owner_id: string;
  exported_video_path: string | null;
  exported_video_duration: number | null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ProjectStatus,
    script: row.script,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    source: row.source as ProjectSource,
    importedFromId: row.imported_from_id ?? undefined,
    importedAt: row.imported_at ? new Date(row.imported_at) : undefined,
    ownerId: row.owner_id,
    // Stored relative to the Documents directory; resolved against the current
    // container so the exported video survives app upgrades.
    exportedVideoPath: resolveDocumentPath(row.exported_video_path),
    exportedVideoDuration: row.exported_video_duration ?? undefined,
  };
}

export function createProjectRepository(db: SQLiteDatabase): IProjectRepository {
  return {
    getAll(): Project[] {
      const rows = db.getAllSync<ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC');
      return rows.map(rowToProject);
    },

    getById(id: string): Project | null {
      const row = db.getFirstSync<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
      return row ? rowToProject(row) : null;
    },

    getBySource(source: ProjectSource): Project[] {
      const rows = db.getAllSync<ProjectRow>(
        'SELECT * FROM projects WHERE source = ? ORDER BY updated_at DESC',
        [source]
      );
      return rows.map(rowToProject);
    },

    getByStatus(status: ProjectStatus): Project[] {
      const rows = db.getAllSync<ProjectRow>(
        'SELECT * FROM projects WHERE status = ? ORDER BY updated_at DESC',
        [status]
      );
      return rows.map(rowToProject);
    },

    create(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project {
      const id = Crypto.randomUUID();
      const now = Date.now();

      db.runSync(
        `INSERT INTO projects (
          id, name, status, script, created_at, updated_at,
          source, imported_from_id, imported_at, owner_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          project.name,
          project.status,
          project.script,
          now,
          now,
          project.source,
          project.importedFromId ?? null,
          project.importedAt?.getTime() ?? null,
          project.ownerId,
        ]
      );

      return {
        ...project,
        id,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    },

    update(id: string, updates: Partial<Omit<Project, 'id'>>): Project | null {
      const existing = this.getById(id);
      if (!existing) return null;

      const now = Date.now();
      const updated: Project = {
        ...existing,
        ...updates,
        updatedAt: new Date(now),
      };

      db.runSync(
        `UPDATE projects SET
          name = ?, status = ?, script = ?, updated_at = ?,
          source = ?, imported_from_id = ?, imported_at = ?, owner_id = ?,
          exported_video_path = ?, exported_video_duration = ?
        WHERE id = ?`,
        [
          updated.name,
          updated.status,
          updated.script,
          now,
          updated.source,
          updated.importedFromId ?? null,
          updated.importedAt?.getTime() ?? null,
          updated.ownerId,
          toDocumentRelativePath(updated.exportedVideoPath) ?? null,
          updated.exportedVideoDuration ?? null,
          id,
        ]
      );

      return updated;
    },

    delete(id: string): boolean {
      const result = db.runSync('DELETE FROM projects WHERE id = ?', [id]);
      return result.changes > 0;
    },

    migrateOwnership(fromOwnerId: string, toOwnerId: string): number {
      const result = db.runSync(
        'UPDATE projects SET owner_id = ?, updated_at = ? WHERE owner_id = ?',
        [toOwnerId, Date.now(), fromOwnerId]
      );
      return result.changes;
    },
  };
}
