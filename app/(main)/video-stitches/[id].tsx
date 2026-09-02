import { useStitchProjectRepository } from '@lib/providers/DatabaseProvider';
import { Icon } from '@shared/components/ui/Icon';
import { IconButton } from '@shared/components/ui/IconButton';
import type { StitchProject, StitchVideo } from '@shared/types';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function VideoThumb({ uri, index }: { uri: string; index: number }) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(uri, { time: 0 })
      .then(({ uri: thumb }) => {
        if (!cancelled) setThumbUri(thumb);
      })
      .catch(() => {
        /* ignore errors — fallback shown */
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return (
    <View style={{ width: 88, height: 66, borderRadius: 10, marginRight: 12, overflow: 'hidden' }}>
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={{ width: 88, height: 66 }} resizeMode="cover" />
      ) : (
        <View
          style={{
            width: 88,
            height: 66,
            backgroundColor: '#EEF2FF',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="clapperboard" size={20} color="#101828" />
        </View>
      )}
      {/* Number badge overlay */}
      <View
        style={{
          position: 'absolute',
          bottom: 3,
          right: 3,
          backgroundColor: 'rgba(60,63,239,0.85)',
          borderRadius: 5,
          minWidth: 18,
          paddingHorizontal: 3,
          paddingVertical: 1,
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{index + 1}</Text>
      </View>
    </View>
  );
}

export default function StitchProjectDetailScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const stitchRepo = useStitchProjectRepository();
  const [project, setProject] = useState<StitchProject | null>(null);
  const [isPickingVideos, setIsPickingVideos] = useState(false);

  const refresh = useCallback(() => {
    if (!id) return;
    setProject(stitchRepo.getById(id));
  }, [id, stitchRepo]);

  useFocusEffect(refresh);

  const saveVideos = useCallback(
    (videos: StitchVideo[]) => {
      if (!id) return;
      const updated = stitchRepo.updateVideos(id, videos);
      if (updated) setProject(updated);
    },
    [id, stitchRepo]
  );

  const handlePickVideos = useCallback(async () => {
    setIsPickingVideos(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!result.canceled && result.assets.length > 0) {
        const newVideos: StitchVideo[] = result.assets.map((asset) => ({
          id: `${asset.uri}-${Date.now()}-${Math.random()}`,
          uri: asset.uri,
          durationMs: asset.duration ?? undefined,
          filename: asset.fileName ?? asset.uri.split('/').pop() ?? 'video',
        }));
        saveVideos([...(project?.videos ?? []), ...newVideos]);
      }
    } catch {
      Alert.alert('Error', 'Failed to pick videos');
    } finally {
      setIsPickingVideos(false);
    }
  }, [project?.videos, saveVideos]);

  const handleMoveUp = (index: number) => {
    if (!project || index === 0) return;
    const next = [...project.videos];
    const temp = next[index - 1]!;
    next[index - 1] = next[index]!;
    next[index] = temp;
    saveVideos(next);
  };

  const handleMoveDown = (index: number) => {
    if (!project || index === project.videos.length - 1) return;
    const next = [...project.videos];
    const temp = next[index + 1]!;
    next[index + 1] = next[index]!;
    next[index] = temp;
    saveVideos(next);
  };

  const handleRemove = (index: number) => {
    if (!project) return;
    saveVideos(project.videos.filter((_, i) => i !== index));
  };

  const handlePreview = () => {
    if (!project || project.videos.length === 0) {
      Alert.alert('No Videos', 'Add at least one video to preview.');
      return;
    }
    router.push({
      pathname: '/(main)/projects/[id]/review',
      params: { id: project.id, source: 'stitch' },
    });
  };

  const handleRename = useCallback(() => {
    if (!project || !id) return;
    Alert.prompt(
      'Rename Project',
      'Enter a new name for this project',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (newName: string | undefined) => {
            if (!newName?.trim()) return;
            const updated = stitchRepo.rename(id, newName.trim());
            if (updated) setProject(updated);
          },
        },
      ],
      'plain-text',
      project.name
    );
  }, [project, id, stitchRepo]);

  const handleViewOutput = () => {
    if (!project?.outputVideoPath) return;
    router.push({ pathname: '/(main)/video-stitches-complete', params: { id: project.id } });
  };

  if (!project) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#6B7280' }}>{t('common.loading')}</Text>
      </View>
    );
  }

  const videos = project.videos;

  const renderItem = ({ item, index }: { item: StitchVideo; index: number }) => (
    <View
      style={{
        backgroundColor: 'rgba(255,255,255,0.75)',
        borderRadius: 16,
        marginBottom: 10,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <VideoThumb uri={item.uri} index={index} />

      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }} numberOfLines={1}>
          {item.filename ?? 'video'}
        </Text>
        {item.durationMs != null && (
          <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
            {formatDuration(item.durationMs)}
          </Text>
        )}
      </View>

      <View style={{ flexDirection: 'row' }}>
        <IconButton
          icon="arrowUp"
          accessibilityLabel="Move up"
          onPress={() => handleMoveUp(index)}
          disabled={index === 0}
          size={14}
          color={index === 0 ? '#D1D5DB' : '#3C3FEF'}
          style={{ backgroundColor: index === 0 ? '#F3F4F6' : '#EEF2FF' }}
        />
        <IconButton
          icon="arrowDown"
          accessibilityLabel="Move down"
          onPress={() => handleMoveDown(index)}
          disabled={index === videos.length - 1}
          size={14}
          color={index === videos.length - 1 ? '#D1D5DB' : '#3C3FEF'}
          style={{ backgroundColor: index === videos.length - 1 ? '#F3F4F6' : '#EEF2FF' }}
        />
      </View>

      <IconButton
        icon="close"
        accessibilityLabel="Remove"
        onPress={() => handleRemove(index)}
        size={13}
        color="#EF4444"
        style={{ backgroundColor: '#FEE2E2' }}
      />
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconButton
            icon="arrowLeft"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            size={22}
            color="#8A8FA3"
          />
          <Text
            style={{ fontSize: 22, fontWeight: '600', color: '#111827', flex: 1 }}
            numberOfLines={1}
          >
            {project.name}
          </Text>
          <IconButton
            icon="edit"
            accessibilityLabel="Rename"
            onPress={handleRename}
            size={16}
            color="#6B7280"
          />
          {project.status === 'done' && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20,
                backgroundColor: '#dcfce7',
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '600', color: '#16a34a' }}>
                {t('common.done')}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Done banner */}
      {project.status === 'done' && project.outputVideoPath && (
        <Pressable
          onPress={handleViewOutput}
          style={{
            marginHorizontal: 16,
            marginBottom: 8,
            backgroundColor: '#f0fdf4',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#86efac',
            paddingHorizontal: 14,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="clapperboard" size={13} color="#16a34a" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#16a34a' }}>
              {t('stitches.stitchedReady')}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 13, color: '#16a34a' }}>{t('common.view')}</Text>
            <Icon name="arrowRight" size={13} color="#16a34a" />
          </View>
        </Pressable>
      )}

      {videos.length === 0 ? (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}
        >
          <View
            style={{
              width: 100,
              height: 100,
              borderRadius: 24,
              backgroundColor: '#EEF2FF',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Icon name="clapperboard" size={44} color="#101828" />
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: '#111827',
              textAlign: 'center',
              marginBottom: 8,
            }}
          >
            {t('stitches.noVideosTitle')}
          </Text>
          <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 }}>
            {t('stitches.noVideosDescription')}
          </Text>
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        />
      )}

      <View style={{ paddingHorizontal: 16, paddingBottom: 24, gap: 10 }}>
        {videos.length > 0 && (
          <Pressable
            onPress={handlePreview}
            style={{
              backgroundColor: 'rgba(255,255,255,0.9)',
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: 'center',
              borderWidth: 2,
              borderColor: '#3C3FEF',
            }}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#3C3FEF' }}>
              {t('common.next')}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={handlePickVideos}
          disabled={isPickingVideos}
          style={{
            backgroundColor: 'rgba(255,255,255,0.9)',
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
            borderWidth: 2,
            borderColor: videos.length === 0 ? '#3C3FEF' : '#D1D5DB',
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: videos.length === 0 ? '#3C3FEF' : '#6B7280',
            }}
          >
            {isPickingVideos
              ? 'Opening Library…'
              : videos.length > 0
                ? '+ Add More Videos'
                : '+ Pick Videos'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
