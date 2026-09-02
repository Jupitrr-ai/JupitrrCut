import { useSettingsRepository, useStitchProjectRepository } from '@lib/providers/DatabaseProvider';
import { consumeFreeRun, stitchScope } from '@lib/services/freemium';
import { VideoProcessor, type ProcessableClip } from '@lib/services/VideoProcessor';
import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Animated, Easing, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const isSimulator = !Device.isDevice;

interface JumpcutSegment {
  startTime: number;
  endTime: number;
}

export default function VideoStitchesStitchingScreen() {
  const { t } = useTranslation();
  const { id, jumpcut } = useLocalSearchParams<{ id: string; jumpcut?: string }>();
  const jumpcutData = useMemo<Record<number, JumpcutSegment[]> | null>(() => {
    if (!jumpcut) return null;
    try {
      return JSON.parse(jumpcut) as Record<number, JumpcutSegment[]>;
    } catch {
      return null;
    }
  }, [jumpcut]);
  const stitchRepo = useStitchProjectRepository();
  const settingsRepo = useSettingsRepository();
  const [progress, setProgress] = useState(0);
  const spinValue = useState(new Animated.Value(0))[0];
  const isExportingRef = useRef(false);
  const hasStartedExportRef = useRef(false);

  const project = useMemo(() => (id ? stitchRepo.getById(id) : null), [id, stitchRepo]);
  const selectedVideos = useMemo(() => project?.videos ?? [], [project]);

  const clipCount = selectedVideos.length;
  const totalDuration = useMemo(
    () =>
      selectedVideos.reduce((sum, v, i) => {
        const segments = jumpcutData?.[i];
        if (segments && segments.length > 0) {
          return sum + segments.reduce((s, seg) => s + (seg.endTime - seg.startTime), 0);
        }
        return sum + (v.durationMs != null ? v.durationMs / 1000 : 0);
      }, 0),
    [selectedVideos, jumpcutData]
  );

  const handleProgress = useCallback((val: number) => setProgress(val), []);

  const simulateExport = useCallback(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += Math.random() * 15 + 5;
      if (current >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          if (id) {
            stitchRepo.markDone(id, '', totalDuration);
            consumeFreeRun(settingsRepo, stitchScope(id));
          }
          router.replace({
            pathname: '/(main)/video-stitches-complete',
            params: { id: id ?? '' },
          });
        }, 500);
      }
      handleProgress(Math.min(100, Math.round(current)));
    }, 800);
  }, [handleProgress, id, settingsRepo, stitchRepo, totalDuration]);

  const runExport = useCallback(async () => {
    if (isExportingRef.current || selectedVideos.length === 0) return;

    if (isSimulator) {
      simulateExport();
      return;
    }

    isExportingRef.current = true;
    try {
      const processableClips: ProcessableClip[] = [];
      selectedVideos.forEach((v, i) => {
        const fullDuration = v.durationMs != null ? v.durationMs / 1000 : 0;
        const segments = jumpcutData?.[i];
        if (segments && segments.length > 0) {
          for (const seg of segments) {
            processableClips.push({
              sourceUri: v.uri,
              durationSeconds: seg.endTime - seg.startTime,
              startTime: seg.startTime,
              endTime: seg.endTime,
            });
          }
        } else {
          processableClips.push({ sourceUri: v.uri, durationSeconds: fullDuration });
        }
      });

      const outputPath = await VideoProcessor.exportProject(
        processableClips,
        { quality: 'high', format: 'mp4', resolution: '2k' },
        handleProgress
      );

      if (id) {
        stitchRepo.markDone(id, outputPath, totalDuration);
        consumeFreeRun(settingsRepo, stitchScope(id));
      }
      router.replace({
        pathname: '/(main)/video-stitches-complete',
        params: { id: id ?? '' },
      });
    } catch (error) {
      Alert.alert('Export Failed', error instanceof Error ? error.message : 'Export failed', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      isExportingRef.current = false;
    }
  }, [
    selectedVideos,
    handleProgress,
    simulateExport,
    id,
    settingsRepo,
    stitchRepo,
    totalDuration,
    jumpcutData,
  ]);

  useEffect(() => {
    if (hasStartedExportRef.current) return;
    hasStartedExportRef.current = true;
    runExport();
  }, [runExport]);

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
      >
        <View
          style={{
            position: 'relative',
            width: 160,
            height: 160,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 32,
          }}
        >
          <View
            style={{
              position: 'absolute',
              width: 160,
              height: 160,
              borderRadius: 80,
              borderWidth: 8,
              borderColor: '#E5E7EB',
            }}
          />
          <Animated.View
            style={{
              position: 'absolute',
              width: 160,
              height: 160,
              borderRadius: 80,
              borderWidth: 8,
              borderColor: 'transparent',
              borderTopColor: '#3C3FEF',
              transform: [{ rotate: spin }],
            }}
          />
          <Text style={{ fontSize: 36, fontWeight: '700', color: '#3C3FEF' }}>{progress}%</Text>
        </View>

        <Text style={{ fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 16 }}>
          {t('stitches.stitchingTitle')}
        </Text>

        <View style={{ width: '100%', marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: '#6B7280' }}>{t('common.clips')}</Text>
            <Text style={{ fontWeight: '600', color: '#111827' }}>{clipCount}</Text>
          </View>
        </View>

        <Text style={{ color: '#9CA3AF' }}>{t('stitches.processing')}</Text>
      </View>
    </SafeAreaView>
  );
}
