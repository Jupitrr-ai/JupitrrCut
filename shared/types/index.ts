export type ProjectStatus = 'scripted' | 'filming' | 'editing' | 'done';
export type ProjectSource = 'local' | 'imported';

export interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  status: ProjectStatus;
  script: string; // Raw script text (blank lines separate clips)
  source: ProjectSource;
  importedFromId?: string;
  importedAt?: Date;
  ownerId: string;
  exportedVideoPath?: string;
  exportedVideoDuration?: number;
}

export type ClipStatus = 'empty' | 'recording' | 'done';
export type ClipSource = 'recorded' | 'imported';

export interface Clip {
  id: string;
  projectId: string;
  index: number;
  text: string;
  status: ClipStatus;
  source: ClipSource;
  videoUri?: string;
  thumbnailUri?: string;
  durationSeconds?: number;
}

// Derived clip used in editor (not persisted directly)
export interface EditorClip {
  id: string;
  index: number;
  text: string;
  estimatedDuration: number;
  isValid: boolean;
}

// Video Stitches
export type StitchProjectStatus = 'draft' | 'done';

export interface StitchVideo {
  id: string;
  uri: string;
  durationMs?: number;
  filename?: string;
}

export interface StitchProject {
  id: string;
  name: string;
  status: StitchProjectStatus;
  videos: StitchVideo[];
  outputVideoPath?: string;
  outputVideoDuration?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type IdeaType = 'note' | 'link';

export interface IdeaLinkPreview {
  title?: string;
  thumbnail?: string;
  author?: string;
  views?: string;
  likes?: string;
  provider?: 'instagram' | 'tiktok' | 'youtube' | 'linkedin' | 'twitter' | 'generic';
}

export interface Idea {
  id: string;
  type: IdeaType;
  text: string;
  url?: string;
  preview?: IdeaLinkPreview;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AuthMode = 'guest' | 'authenticated';

export interface AuthState {
  mode: AuthMode;
  guestId: string;
  firebaseUid?: string;
  accessToken?: string;
  tokenExpiresAt?: number;
  internalUid?: string;
  currentOrgId?: string;
}
