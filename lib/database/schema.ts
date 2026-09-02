export const SCHEMA_VERSION_TABLE = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);
`;

export const PROJECTS_TABLE = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scripted',
  script TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'local',
  imported_from_id TEXT,
  imported_at INTEGER,
  owner_id TEXT NOT NULL
);
`;

export const PROJECTS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_source ON projects(source);
`;

export const CLIPS_TABLE = `
CREATE TABLE IF NOT EXISTS clips (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'empty',
  video_uri TEXT,
  thumbnail_uri TEXT,
  duration_seconds REAL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
`;

export const CLIPS_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_clips_project ON clips(project_id);
`;

export const AUTH_STATE_TABLE = `
CREATE TABLE IF NOT EXISTS auth_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL DEFAULT 'guest',
  guest_id TEXT NOT NULL,
  firebase_uid TEXT,
  access_token TEXT,
  token_expires_at INTEGER
);
`;

export const SETTINGS_TABLE = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
