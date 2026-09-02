import { ClipCard } from '@features/clips/components/ClipCard';
import { useFreemiumGate } from '@lib/hooks/useFreemiumGate';
import { useClipRepository } from '@lib/providers/DatabaseProvider';
import { projectScope } from '@lib/services/freemium';
import { VideoProcessor } from '@lib/services/VideoProcessor';
import { AppBackground } from '@shared/components/AppBackground';
import { Icon } from '@shared/components/ui/Icon';
import { IconButton } from '@shared/components/ui/IconButton';
import { type Clip } from '@shared/types';
import { parseClips, serializeClips } from '@shared/utils/clip-parser';
import { estimateDuration } from '@shared/utils/duration';
import { isSimulatorRecording } from '@shared/utils/video';
import { useProjectStore } from '@stores/useProjectStore';
import * as MediaLibrary from 'expo-media-library';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ClipsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { id, refresh } = useLocalSearchParams<{
    id: string;
    refresh?: string;
  }>();

  const { getProject, updateProjectScript } = useProjectStore();
  const clipRepository = useClipRepository();
  const project = getProject(id ?? '');

  const [dbClips, setDbClips] = useState<Clip[]>([]);
  const [savingClipIndexes, setSavingClipIndexes] = useState<Set<number>>(new Set());
  const [savedClipIndexes, setSavedClipIndexes] = useState<Set<number>>(new Set());

  const clipsWithDuration = useMemo(() => {
    if (!project?.script) return [];
    return parseClips(project.script).map((clip) => ({
      ...clip,
      estimatedDuration: estimateDuration(clip.text),
    }));
  }, [project?.script]);

  const prevScriptClipCountRef = useRef<number | null>(null);

  const refreshDbClips = useCallback(() => {
    if (id) setDbClips(clipRepository.getByProject(id));
  }, [id, clipRepository]);

  const reconcileAndShift = useCallback(() => {
    if (!id || !project) return;
    const scriptClips = parseClips(project.script);
    const allDbClips = clipRepository.getByProject(id);
    const recordedDbClips = allDbClips.filter((c) => c.source === 'recorded' || !c.source);
    const matchedNewIndices = new Set<number>();
    for (const dbClip of recordedDbClips.sort((a, b) => a.index - b.index)) {
      for (let i = 0; i < scriptClips.length; i++) {
        if (!matchedNewIndices.has(i) && scriptClips[i]!.text === dbClip.text) {
          if (i !== dbClip.index) {
            clipRepository.update(dbClip.id, { index: i });
          }
          matchedNewIndices.add(i);
          break;
        }
      }
    }
    setDbClips(clipRepository.getByProject(id));
  }, [id, project, clipRepository]);

  // Refresh clips from DB on focus; prompt to shift if a scene was inserted
  useFocusEffect(
    useCallback(() => {
      refreshDbClips();
      if (!project) return;
      const currentCount = parseClips(project.script).length;
      const prev = prevScriptClipCountRef.current;
      if (prev !== null && currentCount > prev) {
        Alert.alert(t('clips.sceneInsertedTitle'), t('clips.sceneInsertedMessage'), [
          { text: t('clips.keepAsIs'), style: 'cancel' },
          { text: t('clips.shiftVideos'), onPress: reconcileAndShift },
        ]);
      }
      prevScriptClipCountRef.current = currentCount;
    }, [refreshDbClips, project, reconcileAndShift, t])
  );

  // Also refresh when navigated back with explicit refresh token.
  useEffect(() => {
    refreshDbClips();
  }, [id, clipRepository, refresh, refreshDbClips]);

  // Build lookup by clip index for recorded clips
  const dbClipsByIndex = useMemo(() => {
    const map = new Map<number, Clip>();
    for (const clip of dbClips) {
      if (clip.source === 'recorded' || !clip.source) {
        map.set(clip.index, clip);
      }
    }
    return map;
  }, [dbClips]);

  const totalClips = clipsWithDuration.length;
  const recordedCount = clipsWithDuration.reduce(
    (count, _, index) => (dbClipsByIndex.get(index)?.status === 'done' ? count + 1 : count),
    0
  );
  const allDone = recordedCount === totalClips && totalClips > 0;
  const progress = totalClips > 0 ? Math.round((recordedCount / totalClips) * 100) : 0;

  const progressBarStyle = useMemo(() => ({ width: `${progress}%` as `${number}%` }), [progress]);

  /* Filming is gated as well as exporting, so a locked user hits the paywall before recording
     a whole script rather than after. Previewing an existing take stays free — that is their
     own footage, not a new run. */
  const recordGate = useFreemiumGate(id ? projectScope(id) : null);

  const handleTapToFilm = useCallback(
    async (clipIndex: number) => {
      if (!(await recordGate.requireAccess())) return;
      router.push(`/(main)/projects/${id}/record?clip=${clipIndex}&mode=camera`);
    },
    [id, recordGate, router]
  );

  const handlePreview = useCallback(
    (clipIndex: number) => {
      router.push(`/(main)/projects/${id}/record?clip=${clipIndex}&mode=camera&preview=true`);
    },
    [id, router]
  );

  const handleReviewAndStitch = useCallback(() => {
    if (allDone) {
      router.push(`/(main)/projects/${id}/review`);
    }
  }, [allDone, id, router]);

  const handleEditScript = useCallback(() => {
    router.push(`/(main)/projects/${id}/script`);
  }, [id, router]);

  const handleDeleteScene = useCallback(
    (clipIndex: number) => {
      if (!id || !project) return;

      const currentParsedClips = parseClips(project.script);
      const sceneToDelete = currentParsedClips[clipIndex];
      if (!sceneToDelete) return;
      if (currentParsedClips.length <= 1) {
        Alert.alert(t('clips.deleteSceneBlockedTitle'), t('clips.deleteSceneBlockedMessage'));
        return;
      }

      Alert.alert(
        t('clips.deleteSceneTitle'),
        t('clips.deleteSceneMessage', { number: clipIndex + 1 }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('clips.delete'),
            style: 'destructive',
            onPress: async () => {
              const nextClips = currentParsedClips
                .filter((_, index) => index !== clipIndex)
                .map((clip, index) => ({
                  ...clip,
                  index,
                }));

              // Update script first so UI list reflects deletion immediately.
              updateProjectScript(id, serializeClips(nextClips));

              const dbClipsForProject = clipRepository.getByProject(id);
              const deletedDbClip = dbClipsForProject.find(
                (clip) => clip.index === clipIndex && (clip.source === 'recorded' || !clip.source)
              );

              // Delete media files for removed scene if present.
              if (deletedDbClip?.videoUri) {
                await VideoProcessor.deleteVideo(deletedDbClip.videoUri);
              }
              if (deletedDbClip?.thumbnailUri) {
                await VideoProcessor.deleteThumbnail(deletedDbClip.thumbnailUri);
              }
              if (deletedDbClip) {
                clipRepository.delete(deletedDbClip.id);
              }

              // Shift remaining recording rows so DB indexes stay aligned with script.
              const remainingDbClips = clipRepository.getByProject(id);
              for (const clip of remainingDbClips) {
                if ((clip.source === 'recorded' || !clip.source) && clip.index > clipIndex) {
                  clipRepository.update(clip.id, { index: clip.index - 1 });
                }
              }

              // Remove stale DB rows that no longer map to any scene index.
              const maxValidIndex = nextClips.length - 1;
              const alignedDbClips = clipRepository.getByProject(id);
              for (const clip of alignedDbClips) {
                if ((clip.source === 'recorded' || !clip.source) && clip.index > maxValidIndex) {
                  if (clip.videoUri) {
                    await VideoProcessor.deleteVideo(clip.videoUri);
                  }
                  if (clip.thumbnailUri) {
                    await VideoProcessor.deleteThumbnail(clip.thumbnailUri);
                  }
                  clipRepository.delete(clip.id);
                }
              }

              setDbClips(clipRepository.getByProject(id));
            },
          },
        ]
      );
    },
    [clipRepository, id, project, t, updateProjectScript]
  );

  const handleSaveClipToCameraRoll = useCallback(
    async (clipIndex: number) => {
      const clip = dbClipsByIndex.get(clipIndex);
      if (!clip?.videoUri || isSimulatorRecording(clip.videoUri)) return;
      if (savingClipIndexes.has(clipIndex)) return;

      setSavingClipIndexes((prev) => {
        const next = new Set(prev);
        next.add(clipIndex);
        return next;
      });

      try {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert(t('clips.permissionRequired'), t('clips.permissionMessage'));
          return;
        }

        const normalizedUri = clip.videoUri.startsWith('file://')
          ? clip.videoUri
          : `file://${clip.videoUri}`;
        await MediaLibrary.createAssetAsync(normalizedUri);

        setSavedClipIndexes((prev) => {
          const next = new Set(prev);
          next.add(clipIndex);
          return next;
        });
      } catch {
        Alert.alert(t('common.error'), t('clips.saveError'));
      } finally {
        setSavingClipIndexes((prev) => {
          const next = new Set(prev);
          next.delete(clipIndex);
          return next;
        });
      }
    },
    [dbClipsByIndex, savingClipIndexes, t]
  );

  if (!project) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-subtle">
        <Text className="font-sans text-ink-tertiary">{t('projects.projectNotFound')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <AppBackground>
      <SafeAreaView className="flex-1 bg-transparent" edges={['top']}>
        {Platform.OS === 'ios' && <StatusBar barStyle="dark-content" />}

        {/* Header */}
        <View className="px-6 pb-3 pt-3">
          {/* Top row: back + edit script */}
          <View className="flex-row items-center justify-between">
            <IconButton
              icon="arrowLeft"
              accessibilityLabel={t('common.back')}
              onPress={() => router.push('/(main)')}
              size={24}
              color="#8A8FA3"
              className="-ml-2"
            />
            <Pressable
              onPress={handleEditScript}
              className="min-h-[44px] flex-row items-center rounded-full border border-solid border-surface-line bg-white px-4"
            >
              <Icon name="edit" size={14} color="#4E5265" style={{ marginRight: 6 }} />
              <Text className="font-sans-medium text-[13px] text-ink-secondary">
                {t('clips.editScript')}
              </Text>
            </Pressable>
          </View>

          {/* Title + count */}
          <View className="mt-3 flex-row items-end justify-between">
            <Text
              className="flex-1 font-display text-[26px] leading-[30px] text-ink"
              style={{ letterSpacing: -0.8 }}
              numberOfLines={1}
            >
              {project.name}
            </Text>
            <View className="ml-3 pb-1">
              <Text className="font-sans-medium text-[13px] text-ink-secondary">
                {recordedCount}/{totalClips}
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View className="mt-4 h-2 overflow-hidden rounded-full bg-surface-line">
            <View
              className="h-full rounded-full"
              style={[progressBarStyle, { backgroundColor: allDone ? '#1E9E6A' : '#3C3FEF' }]}
            />
          </View>
        </View>

        <>
          <ScrollView className="flex-1 px-4 pt-2" showsVerticalScrollIndicator={false}>
            {clipsWithDuration.map((clip, index) => (
              <ClipCard
                key={clip.index}
                index={index}
                clipNumber={index + 1}
                text={clip.text}
                estimatedDuration={clip.estimatedDuration}
                actualDuration={dbClipsByIndex.get(index)?.durationSeconds}
                isRecorded={dbClipsByIndex.get(index)?.status === 'done'}
                thumbnailUri={dbClipsByIndex.get(index)?.thumbnailUri}
                videoUri={dbClipsByIndex.get(index)?.videoUri}
                onTapToFilm={(clipIndex) => void handleTapToFilm(clipIndex)}
                onPreview={handlePreview}
                onDelete={handleDeleteScene}
                onSaveToCameraRoll={handleSaveClipToCameraRoll}
                isSavingToCameraRoll={savingClipIndexes.has(index)}
                isSavedToCameraRoll={savedClipIndexes.has(index)}
              />
            ))}
            <View className="h-24" />
          </ScrollView>

          <View className="px-4 pb-8 pt-4">
            {project.exportedVideoPath && (
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/(main)/projects/[id]/complete',
                    params: {
                      id: id!,
                      videoPath: project.exportedVideoPath!,
                      videoDuration: String(project.exportedVideoDuration ?? 0),
                    },
                  })
                }
                className="mb-3 min-h-[56px] flex-row items-center justify-center rounded-2xl border-2 border-solid active:bg-primary-tint"
                style={{ borderColor: '#3C3FEF' }}
              >
                <Text className="font-heading text-[17px]" style={{ color: '#3C3FEF' }}>
                  {t('review.viewExportedVideo')}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={handleReviewAndStitch}
              disabled={!allDone}
              className="min-h-[56px] flex-row items-center justify-center rounded-2xl active:scale-95"
              style={{ backgroundColor: allDone ? '#3C3FEF' : '#EAECF0' }}
            >
              <Text
                className="font-heading text-[17px]"
                style={{ color: allDone ? '#fff' : '#98A2B3' }}
              >
                {t('clips.reviewAndStitch')}
              </Text>
              <Icon
                name="scissors"
                size={16}
                color={allDone ? '#fff' : '#98A2B3'}
                style={{ marginLeft: 8 }}
              />
            </Pressable>
          </View>
        </>
      </SafeAreaView>
    </AppBackground>
  );
}
