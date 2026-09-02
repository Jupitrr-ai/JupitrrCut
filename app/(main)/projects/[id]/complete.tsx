import { useSettingsRepository } from '@lib/providers/DatabaseProvider';
import {
  getAppReviewStatus,
  markAppReviewPrompted,
  requestStoreReview,
} from '@lib/services/appReview';
import { reportBug } from '@lib/services/bugReport';
import { ConfettiBurst } from '@shared/components/ConfettiBurst';
import { Icon } from '@shared/components/ui/Icon';
import { IconButton } from '@shared/components/ui/IconButton';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CompleteScreen() {
  const { t } = useTranslation();
  const { videoPath } = useLocalSearchParams<{
    id: string;
    videoPath: string;
    videoDuration: string;
  }>();
  const settingsRepo = useSettingsRepository();
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const hasVideo = !!videoPath && videoPath.length > 0;
  // Ensure video path has file:// prefix
  const videoUri = hasVideo && !videoPath.startsWith('file://') ? `file://${videoPath}` : videoPath;

  /* One more chance for someone who declined the onboarding ask, now that they've actually
     finished a video — the emotional high point beats asking before they'd made anything.
     Flips the status off 'declined' so this never fires more than once. */
  useEffect(() => {
    if (!hasVideo) return;
    if (getAppReviewStatus(settingsRepo) !== 'declined') return;
    markAppReviewPrompted(settingsRepo);
    void requestStoreReview('post_export');
  }, [hasVideo, settingsRepo]);

  // Create video player
  const player = useVideoPlayer(hasVideo ? videoUri : null, (p) => {
    p.loop = true;
  });

  const handleSaveToCameraRoll = useCallback(async () => {
    if (!videoUri || isSaving) return;

    setIsSaving(true);

    try {
      // Request permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(t('complete.permissionRequired'), t('complete.permissionMessage'));
        setIsSaving(false);
        return;
      }

      // Save to camera roll
      await MediaLibrary.createAssetAsync(videoUri);
      setIsSaved(true);
      Alert.alert(t('complete.savedTitle'), t('complete.savedToCameraRoll'));
    } catch {
      Alert.alert(t('common.error'), t('complete.saveError'));
    } finally {
      setIsSaving(false);
    }
  }, [videoUri, isSaving, t]);

  const handleBackToReview = () => {
    router.back();
  };

  const handleBackToHome = () => {
    router.replace('/(main)');
  };

  const handleReportIssue = useCallback(async () => {
    const result = await reportBug({
      videoUri: hasVideo ? videoUri : undefined,
      context: 'After export',
    });
    if (result === 'unavailable') {
      Alert.alert(t('bugReport.unavailableTitle'), t('bugReport.unavailableMessage'));
    }
  }, [hasVideo, videoUri, t]);

  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-4 py-2">
        <IconButton
          icon="arrowLeft"
          accessibilityLabel={t('common.back')}
          onPress={handleBackToReview}
          size={20}
          color="#8A8FA3"
          className="-ml-2"
        />
        <Pressable
          onPress={handleReportIssue}
          className="min-h-[44px] items-center justify-center px-2 active:opacity-60"
        >
          <Text className="font-sans text-[13px] text-ink-tertiary">
            {t('complete.reportIssue')}
          </Text>
        </Pressable>
      </View>

      {/* Video — true 9:16 frame centered in the remaining space */}
      <View className="flex-1 items-center justify-center px-4">
        {hasVideo && player ? (
          <View
            className="overflow-hidden rounded-2xl bg-studio"
            style={{ aspectRatio: 9 / 16, flex: 1, maxWidth: '100%' }}
          >
            <VideoView
              player={player}
              style={{ flex: 1 }}
              contentFit="contain"
              nativeControls={true}
            />
          </View>
        ) : (
          <View className="flex-1 items-center justify-center overflow-hidden rounded-2xl bg-surface-subtle">
            <Icon name="video" size={36} color="#98A2B3" />
            <Text className="mt-2 text-sm text-ink-tertiary">{t('review.simulatorRecording')}</Text>
          </View>
        )}
      </View>

      <View className="px-4 pb-1 pt-4">
        {hasVideo && (
          <Pressable
            onPress={handleSaveToCameraRoll}
            disabled={isSaving || isSaved}
            className="mb-3 min-h-[56px] flex-row items-center justify-center rounded-2xl border-2 border-solid active:bg-primary-tint"
            style={{
              borderColor: isSaved ? '#1E9E6A' : '#3C3FEF',
              opacity: isSaving ? 0.6 : 1,
            }}
          >
            <Icon
              name={isSaved ? 'check' : 'download'}
              size={18}
              color={isSaved ? '#1E9E6A' : '#3C3FEF'}
              style={{ marginRight: 8 }}
            />
            <Text
              className="font-heading text-[17px]"
              style={{ color: isSaved ? '#1E9E6A' : '#3C3FEF' }}
            >
              {isSaved
                ? t('complete.savedToCameraRoll')
                : isSaving
                  ? t('complete.saving')
                  : t('complete.saveToCameraRoll')}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleBackToHome}
          className="min-h-[48px] items-center justify-center rounded-2xl active:bg-surface-subtle"
        >
          <Text className="font-sans-medium text-[15px] text-ink-secondary">
            {t('complete.backToHome')}
          </Text>
        </Pressable>
      </View>

      <ConfettiBurst />
    </SafeAreaView>
  );
}
