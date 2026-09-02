import { useStitchProjectRepository } from '@lib/providers/DatabaseProvider';
import { ConfettiBurst } from '@shared/components/ConfettiBurst';
import { Icon } from '@shared/components/ui/Icon';
import { IconButton } from '@shared/components/ui/IconButton';
import * as MediaLibrary from 'expo-media-library';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function VideoStitchesCompleteScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stitchRepo = useStitchProjectRepository();
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const project = useMemo(() => (id ? stitchRepo.getById(id) : null), [id, stitchRepo]);

  const rawPath = project?.outputVideoPath ?? '';
  const hasVideo = rawPath.length > 0;
  const videoUri = hasVideo && !rawPath.startsWith('file://') ? `file://${rawPath}` : rawPath;

  const player = useVideoPlayer(hasVideo ? videoUri : null, (p) => {
    p.loop = true;
  });

  const handleSave = useCallback(async () => {
    if (!videoUri || isSaving) return;
    setIsSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'To save your stitched video, Teleprompter needs permission to add it to your photo library.'
        );
        return;
      }
      await MediaLibrary.createAssetAsync(videoUri);
      setIsSaved(true);
      Alert.alert('Saved!', 'Video saved to Camera Roll.');
    } catch {
      Alert.alert('Error', 'Failed to save video.');
    } finally {
      setIsSaving(false);
    }
  }, [videoUri, isSaving]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <IconButton
          icon="arrowLeft"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          size={16}
          color="#8A8FA3"
          style={{ marginRight: 4 }}
        />
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#111827' }}>
          {project?.name ?? 'Video Ready'}
        </Text>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        {hasVideo && player ? (
          <View
            style={{ flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#111827' }}
          >
            <VideoView
              player={player}
              style={{ flex: 1 }}
              contentFit="cover"
              nativeControls={true}
            />
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              backgroundColor: '#E5E7EB',
            }}
          >
            <Icon name="clapperboard" size={40} color="#101828" />
            <Text style={{ marginTop: 8, fontSize: 13, color: '#6B7280' }}>
              {t('stitches.simulatorPreview')}
            </Text>
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 24, paddingTop: 16 }}>
        {hasVideo && (
          <Pressable
            onPress={handleSave}
            disabled={isSaving || isSaved}
            style={{
              backgroundColor: isSaved ? '#22C55E' : '#3C3FEF',
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            {isSaved ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>
                  {t('complete.savedToCameraRoll')}
                </Text>
                <Icon name="check" size={15} color="white" />
              </View>
            ) : (
              <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>
                {isSaving ? 'Saving…' : 'Save to Camera Roll'}
              </Text>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={() => router.back()}
          style={{ alignItems: 'center', paddingVertical: 12 }}
        >
          <Text style={{ fontSize: 14, color: '#9CA3AF' }}>{t('stitches.backToProject')}</Text>
        </Pressable>
      </View>

      <ConfettiBurst />
    </SafeAreaView>
  );
}
