import { Icon } from '@shared/components/ui/Icon';
import React, { memo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

interface ClipCardProps {
  index: number;
  clipNumber: number;
  text: string;
  estimatedDuration: number;
  actualDuration?: number;
  isRecorded: boolean;
  thumbnailUri?: string;
  videoUri?: string;
  onTapToFilm: (index: number) => void;
  onPreview?: (index: number) => void;
  onDelete?: (index: number) => void;
  onSaveToCameraRoll?: (index: number) => void;
  isSavingToCameraRoll?: boolean;
  isSavedToCameraRoll?: boolean;
}

export const ClipCard = memo(function ClipCard({
  index,
  clipNumber,
  text,
  estimatedDuration: _estimatedDuration,
  actualDuration: _actualDuration,
  isRecorded,
  thumbnailUri,
  videoUri,
  onTapToFilm,
  onPreview,
  onDelete,
  onSaveToCameraRoll,
  isSavingToCameraRoll = false,
  isSavedToCameraRoll = false,
}: ClipCardProps) {
  const { t } = useTranslation();
  const swipeableRef = useRef<Swipeable>(null);

  const handlePress = () => {
    if (isRecorded && onPreview) {
      onPreview(index);
    } else {
      onTapToFilm(index);
    }
  };

  const handleDelete = () => {
    swipeableRef.current?.close();
    onDelete?.(index);
  };
  const canSaveToCameraRoll = isRecorded && !!videoUri && !videoUri.startsWith('simulator://');
  const handleSaveToCameraRoll = () => {
    swipeableRef.current?.close();
    onSaveToCameraRoll?.(index);
  };

  const renderRightActions = () => {
    // Extends 20pt under the card (which renders on top) so actions read as a
    // revealed background instead of separate blocks with a corner gap.
    if (canSaveToCameraRoll && onSaveToCameraRoll) {
      return (
        <View
          className="flex-row overflow-hidden"
          style={{
            marginLeft: -20,
            borderTopRightRadius: 20,
            borderBottomRightRadius: 20,
          }}
        >
          <Pressable
            onPress={handleSaveToCameraRoll}
            disabled={isSavingToCameraRoll || isSavedToCameraRoll}
            className="items-center justify-center"
            style={{
              width: 116,
              paddingLeft: 20,
              backgroundColor: isSavedToCameraRoll
                ? '#1E9E6A'
                : isSavingToCameraRoll
                  ? '#9698F5'
                  : '#4E5265',
            }}
          >
            <Text className="px-1 text-center font-heading text-[12px] text-white">
              {isSavedToCameraRoll
                ? t('clips.savedToCameraRoll')
                : isSavingToCameraRoll
                  ? t('clips.saving')
                  : t('clips.saveToCameraRoll')}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            className="w-20 items-center justify-center"
            style={{ backgroundColor: '#DC2626' }}
          >
            <Text className="font-heading text-[13px] text-white">{t('clips.delete')}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <Pressable
        onPress={handleDelete}
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
        <Text className="font-heading text-[13px] text-white">{t('clips.delete')}</Text>
      </Pressable>
    );
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
      <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} overshootRight={false}>
        <Pressable
          onPress={handlePress}
          className="flex-row items-start"
          style={{
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E6E9F4',
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 12,
          }}
        >
          {/* Thumbnail: portrait frame, or oversized scene numeral until filmed */}
          <View className="mr-3.5 shrink-0">
            {isRecorded && (thumbnailUri || videoUri) ? (
              <Image
                source={{ uri: thumbnailUri || videoUri }}
                style={{ width: 62, height: 82, borderRadius: 14 }}
                resizeMode="cover"
              />
            ) : (
              <View
                className="items-center justify-center"
                style={{
                  width: 62,
                  height: 82,
                  borderRadius: 14,
                  backgroundColor: '#F4F6FB',
                }}
              >
                <Text className="font-display text-[20px]" style={{ color: '#C4C9D6' }}>
                  {String(clipNumber).padStart(2, '0')}
                </Text>
              </View>
            )}
          </View>

          {/* Content */}
          <View className="flex-1">
            <View className="flex-row items-center justify-between">
              {/* Number badge — same design as the script editor's clip badges */}
              <View
                className="h-[22px] min-w-[22px] items-center justify-center rounded px-1"
                style={{ backgroundColor: '#EEF2FF' }}
              >
                <Text className="text-[11px] font-bold" style={{ color: '#3C3FEF' }}>
                  {clipNumber}
                </Text>
              </View>
              {isRecorded && (
                <View
                  className="ml-2 flex-row items-center rounded-full px-2.5 py-[5px]"
                  style={{ backgroundColor: '#D1FAE5' }}
                >
                  <Icon name="check" size={10} color="#059669" style={{ marginRight: 3 }} />
                  <Text className="font-heading text-[11px]" style={{ color: '#059669' }}>
                    {t('clips.done')}
                  </Text>
                </View>
              )}
            </View>

            <Text
              className="mt-1.5 font-sans text-[15px] leading-[21px] text-ink-secondary"
              numberOfLines={3}
            >
              {text}
            </Text>
          </View>
        </Pressable>
      </Swipeable>
    </View>
  );
});
