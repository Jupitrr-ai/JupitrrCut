import type { Idea, IdeaLinkPreview, IdeaType } from '@shared/types';
import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

interface IdeaRow {
  id: string;
  type: string;
  text: string;
  url: string | null;
  preview_title: string | null;
  preview_thumbnail: string | null;
  preview_author: string | null;
  preview_views: string | null;
  preview_likes: string | null;
  preview_provider: string | null;
  owner_id: string;
  organization_id: string | null;
  author_id: string | null;
  sync_state: string;
  remote_updated_at: number | null;
  needs_backfill: number;
  created_at: number;
  updated_at: number;
}

function rowToIdea(row: IdeaRow): Idea {
  const hasPreview =
    row.preview_title !== null ||
    row.preview_thumbnail !== null ||
    row.preview_author !== null ||
    row.preview_views !== null ||
    row.preview_likes !== null ||
    row.preview_provider !== null;

  const preview: IdeaLinkPreview | undefined = hasPreview
    ? {
        title: row.preview_title ?? undefined,
        thumbnail: row.preview_thumbnail ?? undefined,
        author: row.preview_author ?? undefined,
        views: row.preview_views ?? undefined,
        likes: row.preview_likes ?? undefined,
        provider: (row.preview_provider as IdeaLinkPreview['provider']) ?? undefined,
      }
    : undefined;

  return {
    id: row.id,
    type: row.type as IdeaType,
    text: row.text,
    url: row.url ?? undefined,
    preview,
    ownerId: row.owner_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export interface IdeaRepository {
  getAll(ownerId: string): Idea[];
  getById(id: string): Idea | null;
  createNote(input: { text: string; ownerId: string }): Idea;
  createLink(input: {
    url: string;
    text?: string;
    ownerId: string;
    preview?: IdeaLinkPreview;
  }): Idea;
  updateText(id: string, text: string): Idea | null;
  updatePreview(id: string, preview: IdeaLinkPreview): Idea | null;
  updateContent(
    id: string,
    input: { text: string; url: string | null; preview: IdeaLinkPreview | null; type: IdeaType }
  ): Idea | null;
  delete(id: string): boolean;
  wipeAll(): void;
}

/**
 * Local-only CRUD over the `ideas` table. This OSS build has no remote sync (that lived in
 * the now-removed `ideaSync`/`ideaBackfill` services), so every row stays `sync_state =
 * 'local_only'` with no `organization_id`/`author_id` — those columns and the
 * `needs_backfill` flag are retained in the schema for storage compatibility but are no
 * longer read or updated here.
 */
export function createIdeaRepository(db: SQLiteDatabase): IdeaRepository {
  const repo: IdeaRepository = {
    getAll(ownerId: string): Idea[] {
      const rows = db.getAllSync<IdeaRow>(
        `SELECT * FROM ideas
         WHERE owner_id = ? AND sync_state != 'pending_delete'
         ORDER BY created_at DESC`,
        [ownerId]
      );
      return rows.map(rowToIdea);
    },

    getById(id: string): Idea | null {
      const row = db.getFirstSync<IdeaRow>('SELECT * FROM ideas WHERE id = ?', [id]);
      return row ? rowToIdea(row) : null;
    },

    createNote({ text, ownerId }): Idea {
      const id = Crypto.randomUUID();
      const now = Date.now();
      db.runSync(
        `INSERT INTO ideas (
          id, type, text, owner_id,
          sync_state, needs_backfill,
          created_at, updated_at
        ) VALUES (?, 'note', ?, ?, 'local_only', 0, ?, ?)`,
        [id, text, ownerId, now, now]
      );
      return {
        id,
        type: 'note',
        text,
        ownerId,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    },

    createLink({ url, text = '', ownerId, preview }): Idea {
      const id = Crypto.randomUUID();
      const now = Date.now();
      db.runSync(
        `INSERT INTO ideas (
          id, type, text, url,
          preview_title, preview_thumbnail, preview_author,
          preview_views, preview_likes, preview_provider,
          owner_id, sync_state, needs_backfill,
          created_at, updated_at
        ) VALUES (?, 'link', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local_only', 0, ?, ?)`,
        [
          id,
          text,
          url,
          preview?.title ?? null,
          preview?.thumbnail ?? null,
          preview?.author ?? null,
          preview?.views ?? null,
          preview?.likes ?? null,
          preview?.provider ?? null,
          ownerId,
          now,
          now,
        ]
      );
      return {
        id,
        type: 'link',
        text,
        url,
        preview,
        ownerId,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    },

    updateText(id: string, text: string): Idea | null {
      const now = Date.now();
      const result = db.runSync('UPDATE ideas SET text = ?, updated_at = ? WHERE id = ?', [
        text,
        now,
        id,
      ]);
      if (result.changes === 0) return null;
      return repo.getById(id);
    },

    updatePreview(id: string, preview: IdeaLinkPreview): Idea | null {
      const now = Date.now();
      const result = db.runSync(
        `UPDATE ideas SET
           preview_title = ?,
           preview_thumbnail = ?,
           preview_author = ?,
           preview_views = ?,
           preview_likes = ?,
           preview_provider = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          preview.title ?? null,
          preview.thumbnail ?? null,
          preview.author ?? null,
          preview.views ?? null,
          preview.likes ?? null,
          preview.provider ?? null,
          now,
          id,
        ]
      );
      if (result.changes === 0) return null;
      return repo.getById(id);
    },

    updateContent(id, { text, url, preview, type }): Idea | null {
      const now = Date.now();
      const result = db.runSync(
        `UPDATE ideas SET
           type = ?,
           text = ?,
           url = ?,
           preview_title = ?,
           preview_thumbnail = ?,
           preview_author = ?,
           preview_views = ?,
           preview_likes = ?,
           preview_provider = ?,
           updated_at = ?
         WHERE id = ?`,
        [
          type,
          text,
          url ?? null,
          preview?.title ?? null,
          preview?.thumbnail ?? null,
          preview?.author ?? null,
          preview?.views ?? null,
          preview?.likes ?? null,
          preview?.provider ?? null,
          now,
          id,
        ]
      );
      if (result.changes === 0) return null;
      return repo.getById(id);
    },

    delete(id: string): boolean {
      const result = db.runSync('DELETE FROM ideas WHERE id = ?', [id]);
      return result.changes > 0;
    },

    wipeAll(): void {
      db.runSync('DELETE FROM ideas');
    },
  };

  return repo;
}
