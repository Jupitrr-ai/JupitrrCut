import {
  useClipRepository,
  useProjectRepository,
  useSettingsRepository,
} from '@lib/providers/DatabaseProvider';
import { consumeFreeRun, projectScope } from '@lib/services/freemium';
import { type ProcessableClip, VideoProcessor } from '@lib/services/VideoProcessor';
import { buildExportRanges, exportDuration } from '@shared/utils/export-ranges';
import { isSimulatorRecording } from '@shared/utils/video';
import { useProjectStore } from '@stores/useProjectStore';
import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, Easing, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Check if running on simulator (Device.isDevice is more reliable than Constants.isDevice)
const isSimulator = !Device.isDevice;

interface JumpcutSegment {
  startTime: number;
  endTime: number;
}

export default function StitchingScreen() {
  const { t } = useTranslation();
  const { id, jumpcut } = useLocalSearchParams<{ id: string; jumpcut?: string }>();

  // Parse jumpcut data from review screen
  const jumpcutData = useMemo<Record<number, JumpcutSegment[]> | null>(() => {
    if (!jumpcut) return null;
    try {
      return JSON.parse(jumpcut) as Record<number, JumpcutSegment[]>;
    } catch {
      return null;
    }
  }, [jumpcut]);
  const clipRepository = useClipRepository();
  const projectRepository = useProjectRepository();
  const settingsRepository = useSettingsRepository();
  const { updateProjectStatus } = useProjectStore();

  /* Spent only once a finished video exists. Charging the free run at the start of the export
     would burn it on a run the user never got the output of. */
  const spendFreeRun = useCallback(() => {
    if (id) consumeFreeRun(settingsRepository, projectScope(id));
  }, [id, settingsRepository]);
  const [progress, setProgress] = useState(0);
  const spinValue = useState(new Animated.Value(0))[0];
  const isExportingRef = useRef(false);
  const hasStartedExportRef = useRef(false);

  // Get clips from database
  const clips = useMemo(() => {
    if (!id) return [];
    return clipRepository.getByProject(id).filter((clip) => clip.status === 'done');
  }, [id, clipRepository]);

  const onCameraClips = clips.filter((c) => c.videoUri).length;

  // Total duration of what actually gets exported. MUST account for jumpcut: when segments
  // exist for a clip, only the kept segments land in the export. Summing the raw clip
  // durations over-reports the final video's length, and that number is persisted as
  // exportedVideoDuration → written to the Jupitrr slideshow's a_roll (`t`) — producing a
  // timeline longer than the uploaded file, i.e. a frozen last frame + silence past the end.
  const totalDuration = useMemo(() => {
    return clips
      .filter((clip) => clip.videoUri && clip.durationSeconds)
      .reduce((sum, clip) => {
        const segments = jumpcutData?.[clip.index];
        if (segments && segments.length > 0) {
          return sum + segments.reduce((s, seg) => s + (seg.endTime - seg.startTime), 0);
        }
        return sum + (clip.durationSeconds || 0);
      }, 0);
  }, [clips, jumpcutData]);

  const handleProgress = useCallback((progressValue: number) => {
    setProgress(progressValue);
  }, []);

  // Check if all clips are simulator recordings
  const hasOnlySimulatorClips = useMemo(() => {
    return clips.every((clip) => isSimulatorRecording(clip.videoUri));
  }, [clips]);

  // Simulate export progress (for simulator or non-iOS)
  const simulateExport = useCallback(() => {
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += Math.random() * 15 + 5;
      if (currentProgress >= 100) {
        currentProgress = 100;
        clearInterval(interval);
        setTimeout(() => {
          // Simulator parity: mark complete so the status flow is testable
          if (id) updateProjectStatus(id, 'done');
          spendFreeRun();
          // Pass empty videoPath for simulator mode
          router.replace(
            `/(main)/projects/${id}/complete?videoPath=&videoDuration=${totalDuration}`
          );
        }, 500);
      }
      handleProgress(Math.min(100, Math.round(currentProgress)));
    }, 800);
  }, [handleProgress, id, spendFreeRun, totalDuration, updateProjectStatus]);

  const runExport = useCallback(async () => {
    if (isExportingRef.current || clips.length === 0) return;

    // Simulate export only for simulator builds or simulator recordings
    if (isSimulator || hasOnlySimulatorClips) {
      // Simulate progress and navigate
      simulateExport();
      return;
    }

    isExportingRef.current = true;

    try {
      console.log('[Stitching] Jumpcut data:', jumpcutData);
      console.log('[Stitching] Total clips:', clips.length);

      // Flatten clips into export ranges. A trimmed clip contributes one range
      // per kept window, so a split clip lands as several ranges over the same
      // source file — see shared/utils/export-ranges.
      const processableClips: ProcessableClip[] = buildExportRanges(clips, jumpcutData);
      console.log('[Stitching] Processable clips built:', processableClips.length);
      processableClips.forEach((c, i) => {
        console.log(
          `  Clip ${i}: startTime=${c.startTime ?? 'undefined'}, endTime=${c.endTime ?? 'undefined'}, duration=${c.durationSeconds}s`
        );
      });

      if (processableClips.length === 0) {
        // Fall back to simulation if no real clips
        simulateExport();
        return;
      }

      // Duration of the file we're about to write — summed from the exact ranges handed to the
      // native exporter, so it can never drift from the real output (unlike a clip-level sum).
      const exportedDuration = exportDuration(processableClips);

      // Export using native module
      const outputPath = await VideoProcessor.exportProject(
        processableClips,
        {
          quality: 'high',
          format: 'mp4',
          resolution: '2k',
        },
        handleProgress
      );

      // Persist exported video path so the review screen can navigate to it later,
      // and promote the project: an exported final cut is what "Complete" means.
      if (id) {
        projectRepository.update(id, {
          exportedVideoPath: outputPath,
          exportedVideoDuration: exportedDuration,
        });
        updateProjectStatus(id, 'done');
      }
      spendFreeRun();

      // Navigate to complete screen with the video path
      router.replace(
        `/(main)/projects/${id}/complete?videoPath=${encodeURIComponent(outputPath)}&videoDuration=${exportedDuration}`
      );
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : 'Export failed', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      isExportingRef.current = false;
    }
  }, [
    clips,
    handleProgress,
    hasOnlySimulatorClips,
    id,
    jumpcutData,
    projectRepository,
    simulateExport,
    spendFreeRun,
    t,
    updateProjectStatus,
  ]);

  // Start export on mount
  useEffect(() => {
    if (hasStartedExportRef.current) return;
    hasStartedExportRef.current = true;
    runExport();
  }, [runExport]);

  // Spinner animation
  useEffect(() => {
    Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const spinnerStyle = useMemo(() => ({ transform: [{ rotate: spin }] }), [spin]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-8">
        <View className="relative mb-8 h-40 w-40 items-center justify-center">
          <View className="absolute h-40 w-40 rounded-full border-8 border-surface-line" />
          <Animated.View
            style={spinnerStyle}
            className="absolute h-40 w-40 rounded-full border-8 border-transparent border-t-primary"
          />
          <Text className="font-display text-4xl text-primary">{progress}%</Text>
        </View>

        <Text className="mb-4 text-2xl font-bold text-ink">
          {t('stitching.autoStitchingVideo')}
        </Text>

        <Text className="mb-6 text-center font-sans text-[15px] text-ink-secondary">
          {t('stitching.combining', { count: onCameraClips })}
        </Text>

        <Text className="text-ink-tertiary">{t('stitching.processing')}</Text>
      </View>
    </SafeAreaView>
  );
}
