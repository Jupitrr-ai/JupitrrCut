import type { AuthRepository, ClipRepository, ProjectRepository } from '@lib/repositories/types';
import { VideoProcessor } from '@lib/services/VideoProcessor';
import { MOCK_PROJECTS, PRODUCT_DEMO_CLIPS, SAMPLE_VIDEO_URLS } from '@shared/mocks/projects';
import { Directory, File as ExpoFile, Paths } from 'expo-file-system';

async function downloadSampleVideo(remoteUrl: string, samplesDir: Directory): Promise<ExpoFile> {
  const filename = remoteUrl.split('/').pop()!;
  const localFile = new ExpoFile(samplesDir, filename);

  if (localFile.exists) return localFile;

  try {
    const downloaded = await ExpoFile.downloadFileAsync(remoteUrl, samplesDir);
    return downloaded as ExpoFile;
  } catch {
    const response = await fetch(remoteUrl);
    const buffer = await response.arrayBuffer();
    localFile.write(new Uint8Array(buffer));
    return localFile;
  }
}

async function downloadSampleVideos(
  clips: { id: string; projectId: string; videoUri?: string }[],
  clipRepo: ClipRepository
): Promise<void> {
  const samplesDir = new Directory(Paths.document, 'samples');
  if (!samplesDir.exists) {
    samplesDir.create();
  }

  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index]!;
    const remoteUrl = SAMPLE_VIDEO_URLS[index];
    if (!remoteUrl) continue;

    try {
      const localFile = await downloadSampleVideo(remoteUrl, samplesDir);
      const thumbnailUri = await VideoProcessor.generateThumbnail(
        localFile.uri,
        clip.projectId,
        index
      );

      clipRepo.update(clip.id, {
        videoUri: localFile.uri,
        ...(thumbnailUri && { thumbnailUri }),
      });
    } catch (error) {
      console.warn(`[Sample] Failed clip ${index + 1}:`, error);
    }
  }
}

/** Re-download demo clip videos that are still remote or missing on disk. */
export async function repairDemoClipDownloads(
  projectRepo: ProjectRepository,
  clipRepo: ClipRepository
): Promise<void> {
  for (const project of projectRepo.getAll()) {
    const clips = clipRepo.getByProject(project.id);
    const needsDownload = clips.some((clip) => {
      if (clip.status !== 'done' || !clip.videoUri) return false;
      if (clip.videoUri.startsWith('simulator://')) return false;
      if (clip.videoUri.startsWith('http')) return true;
      try {
        return !new ExpoFile(clip.videoUri).exists;
      } catch {
        return true;
      }
    });
    if (needsDownload && clips.length === PRODUCT_DEMO_CLIPS.length) {
      await downloadSampleVideos(clips, clipRepo);
    }
  }
}

/** Insert demo projects when the DB is empty. Safe to call multiple times. */
export function seedMockProjectsIfNeeded(
  projectRepo: ProjectRepository,
  clipRepo: ClipRepository,
  authRepo: AuthRepository
): void {
  if (projectRepo.getAll().length > 0) return;

  const authState = authRepo.getState();
  const ownerId =
    authState?.mode === 'authenticated' && authState?.firebaseUid
      ? authState.firebaseUid
      : `guest_${authState?.guestId ?? 'unknown'}`;

  for (const mockProject of MOCK_PROJECTS) {
    const created = projectRepo.create({
      name: mockProject.name,
      status: mockProject.status,
      script: mockProject.script,
      source: mockProject.source,
      ownerId,
    });

    if (mockProject.id === 'sample-2') {
      const createdClips = clipRepo.createBatch(
        PRODUCT_DEMO_CLIPS.map((clip) => ({
          ...clip,
          projectId: created.id,
        }))
      );
      void downloadSampleVideos(createdClips, clipRepo);
    }
  }
}
