import { useStitchProjectRepository } from '@lib/providers/DatabaseProvider';
import { BottomTabBar } from '@shared/components/BottomTabBar';
import { Icon } from '@shared/components/ui/Icon';
import type { StitchProject } from '@shared/types';
import { formatDate } from '@shared/utils/date';
import { router, useFocusEffect } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Image, Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function FirstVideoThumb({ uri }: { uri?: string }) {
  const [thumbUri, setThumbUri] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return undefined;
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(uri, { time: 0 })
      .then(({ uri: thumb }) => {
        if (!cancelled) setThumbUri(thumb);
      })
      .catch(() => {
        /* ignore — fallback shown */
      });
    return () => {
      cancelled = true;
    };
  }, [uri]);

  return (
    <View
      style={{
        width: 82,
        height: 62,
        borderRadius: 14,
        overflow: 'hidden',
        marginRight: 14,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {thumbUri ? (
        <Image source={{ uri: thumbUri }} style={{ width: 82, height: 62 }} resizeMode="cover" />
      ) : (
        <Icon name="clapperboard" size={20} color="#3C3FEF" />
      )}
    </View>
  );
}

function StatusBadge({ status }: { status: StitchProject['status'] }) {
  const { t } = useTranslation();
  const isDone = status === 'done';
  const textColor = isDone ? '#059669' : '#4F46E5';
  return (
    <View
      style={{ backgroundColor: isDone ? '#D1FAE5' : '#EEF2FF' }}
      className="ml-2 flex-row items-center self-center rounded-full px-3 py-[7px]"
    >
      <Icon
        name={isDone ? 'checkCircle' : 'scissors'}
        size={11}
        color={textColor}
        style={{ marginRight: 4 }}
      />
      <Text style={{ color: textColor }} className="font-heading text-[11px]">
        {t(isDone ? 'stitches.statusDone' : 'stitches.statusDraft')}
      </Text>
    </View>
  );
}

interface StitchCardProps {
  item: StitchProject;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

const StitchCard = memo(function StitchCard({
  item,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onDelete,
}: StitchCardProps) {
  const { t } = useTranslation();
  const swipeableRef = useRef<Swipeable>(null);

  const handleSwipeDelete = () => {
    swipeableRef.current?.close();
    Alert.alert(t('stitches.deleteTitle'), t('stitches.deleteMessage', { name: item.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(item.id) },
    ]);
  };

  const renderRightActions = () => (
    // Extends 20pt under the card (which renders on top) so the red reads as a
    // revealed background instead of a separate block with a corner gap.
    <Pressable
      onPress={handleSwipeDelete}
      className="items-center justify-center"
      style={{
        width: 100,
        marginLeft: -20,
        paddingLeft: 20,
        backgroundColor: '#DC2626',
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
      }}
    >
      <Text className="font-heading text-[13px] text-white">{t('common.delete')}</Text>
    </Pressable>
  );

  const handlePress = () => {
    if (isSelectMode) {
      onToggleSelect(item.id);
    } else {
      router.push({ pathname: '/(main)/video-stitches/[id]', params: { id: item.id } });
    }
  };

  const handleLongPress = () => {
    if (!isSelectMode) onToggleSelect(item.id);
  };

  return (
    <View
      style={{
        marginBottom: 12,
        shadowColor: '#181A22',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        borderRadius: 20,
      }}
    >
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        enabled={!isSelectMode}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E6E9F4',
            borderRadius: 20,
            overflow: 'hidden',
          }}
        >
          <Pressable
            onPress={handlePress}
            onLongPress={handleLongPress}
            className="flex-row items-center px-3 py-3"
          >
            {isSelectMode && (
              <View
                className={`mr-3 h-7 w-7 items-center justify-center rounded-lg border-2 ${
                  isSelected ? 'border-red-500 bg-red-500' : 'border-gray-300 bg-white'
                }`}
              >
                {isSelected && <Icon name="check" size={14} color="#FFFFFF" />}
              </View>
            )}

            <FirstVideoThumb uri={item.videos[0]?.uri} />

            <View className="flex-1">
              <Text
                className="font-heading text-[17px] text-ink"
                style={{ letterSpacing: -0.4 }}
                numberOfLines={2}
              >
                {item.name}
              </Text>
              <View className="mt-1.5 flex-row items-center">
                <Text className="font-sans text-[13px] text-ink-tertiary">
                  {item.videos.length === 1
                    ? t('stitches.videoCountOne')
                    : t('stitches.videoCount', { count: item.videos.length })}
                </Text>
                <Text className="mx-1.5 text-[13px] text-ink-tertiary">·</Text>
                <Text className="font-sans text-[13px] text-ink-tertiary">
                  {formatDate(item.updatedAt)}
                </Text>
              </View>
            </View>

            <StatusBadge status={item.status} />
          </Pressable>

          {item.status === 'done' && (
            <Pressable
              onPress={handlePress}
              className="min-h-[44px] flex-row items-center px-4"
              style={{
                backgroundColor: '#ECFDF5',
                borderTopWidth: 1,
                borderTopColor: '#D1FAE5',
                gap: 6,
              }}
            >
              <Icon name="clapperboard" size={13} color="#059669" />
              <Text className="font-sans-medium text-[12px]" style={{ color: '#059669' }}>
                {t('stitches.readyBanner')}
              </Text>
            </Pressable>
          )}
        </View>
      </Swipeable>
    </View>
  );
});

export default function VideoStitchesListScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const stitchRepo = useStitchProjectRepository();
  const [projects, setProjects] = useState<StitchProject[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    setProjects(stitchRepo.getAll());
  }, [stitchRepo]);

  useFocusEffect(refresh);

  const handleNew = useCallback(() => {
    const name = `Stitch ${projects.length + 1}`;
    const created = stitchRepo.create(name);
    router.push({ pathname: '/(main)/video-stitches/[id]', params: { id: created.id } });
  }, [stitchRepo, projects.length]);

  const handleDelete = useCallback(
    (id: string) => {
      stitchRepo.delete(id);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      refresh();
    },
    [stitchRepo, refresh]
  );

  const toggleSelectMode = () => {
    setIsSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    if (!isSelectMode) setIsSelectMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      t('stitches.deleteSelectedTitle'),
      t('stitches.deleteSelectedMessage', { count: selectedIds.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            for (const id of selectedIds) stitchRepo.delete(id);
            setSelectedIds(new Set());
            setIsSelectMode(false);
            refresh();
          },
        },
      ]
    );
  };

  const ctaShadow = {
    shadowColor: '#3C3FEF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  };

  const renderItem = ({ item }: { item: StitchProject }) => (
    <StitchCard
      item={item}
      isSelectMode={isSelectMode}
      isSelected={selectedIds.has(item.id)}
      onToggleSelect={toggleSelect}
      onDelete={handleDelete}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text
              className="font-display text-[38px] leading-[42px] text-ink"
              style={{ letterSpacing: -1.9 }}
            >
              {t('stitches.title')}
            </Text>
            <Text
              className="mt-1 font-sans text-[15px] text-ink-tertiary"
              style={{ letterSpacing: -0.4 }}
            >
              {isSelectMode
                ? t('stitches.selectedCount', { count: selectedIds.size })
                : t('stitches.subtitle')}
            </Text>
          </View>
          {projects.length > 0 && (
            <Pressable
              onPress={toggleSelectMode}
              className="h-11 items-center justify-center rounded-full border border-solid border-surface-line bg-white px-4"
            >
              <Text className="text-sm font-medium text-gray-700">
                {isSelectMode ? t('common.done') : t('projects.select')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {projects.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <Icon name="scissors" size={64} color="#3C3FEF" style={{ marginBottom: 20 }} />
          <Text
            className="text-center font-display text-[28px] text-ink"
            style={{ letterSpacing: -0.8 }}
          >
            {t('stitches.emptyTitle')}
          </Text>
          <Text className="mt-2 text-center font-sans text-[15px] leading-[22px] text-ink-secondary">
            {t('stitches.emptyDescription')}
          </Text>
          <Pressable
            onPress={handleNew}
            accessibilityRole="button"
            accessibilityLabel={t('stitches.newStitch')}
            className="mt-7 min-h-[56px] flex-row items-center justify-center rounded-2xl bg-primary px-7 active:scale-95"
            style={ctaShadow}
          >
            <Icon name="plus" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text className="font-heading text-[17px] text-white">{t('stitches.newStitch')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={projects}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
        />
      )}

      {/* Multi-select delete bar */}
      {isSelectMode && selectedIds.size > 0 && (
        <View
          className="absolute left-0 right-0 px-5 pb-4 pt-4 shadow-lg"
          style={{ bottom: insets.bottom + 56 }}
        >
          <Pressable
            onPress={handleDeleteSelected}
            className="items-center justify-center rounded-lg bg-red-500 py-4 active:bg-red-600"
          >
            <Text className="text-base font-semibold text-white">
              {t('stitches.deleteSelected', { count: selectedIds.size })}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Floating new-stitch CTA */}
      {projects.length > 0 && !isSelectMode && (
        <View className="absolute right-5" style={{ bottom: insets.bottom + 82 }}>
          <Pressable
            onPress={handleNew}
            accessibilityRole="button"
            accessibilityLabel={t('stitches.newStitch')}
            className="min-h-[52px] flex-row items-center justify-center rounded-full bg-primary px-6 active:scale-95"
            style={ctaShadow}
          >
            <Icon name="plus" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text className="font-heading text-[17px] text-white">{t('stitches.newStitch')}</Text>
          </Pressable>
        </View>
      )}

      <BottomTabBar />
    </View>
  );
}
