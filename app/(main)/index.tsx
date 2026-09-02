import { LimitedOfferCard } from '@features/purchases/components/LimitedOfferCard';
import { useDatabase } from '@lib/providers/DatabaseProvider';
import { BottomSheetModal } from '@shared/components/BottomSheetModal';
import { BottomTabBar } from '@shared/components/BottomTabBar';
import { Icon, type IconName } from '@shared/components/ui/Icon';
import type { Project, ProjectStatus } from '@shared/types';
import { autoSplitScript } from '@shared/utils/auto-split';
import { formatDate } from '@shared/utils/date';
import { formatTimecode } from '@shared/utils/duration';
import { useProjectStore } from '@stores/useProjectStore';
import * as Clipboard from 'expo-clipboard';
import { Link, useRouter } from 'expo-router';
import React, { memo, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STATUS_CONFIG: Record<
  ProjectStatus,
  { labelKey: string; bgColor: string; textColor: string; icon: IconName; iconBg: string }
> = {
  scripted: {
    labelKey: 'status.scripted',
    bgColor: '#EEF2FF',
    textColor: '#4F46E5',
    icon: 'notepad',
    iconBg: '#dee9ff',
  },
  filming: {
    labelKey: 'status.filming',
    bgColor: '#FEF3C7',
    textColor: '#D97706',
    icon: 'clapperboard',
    iconBg: '#fef3c7',
  },
  editing: {
    labelKey: 'status.editing',
    bgColor: '#F3E8FF',
    textColor: '#9333EA',
    icon: 'scissors',
    iconBg: '#f3e8ff',
  },
  done: {
    labelKey: 'status.done',
    bgColor: '#D1FAE5',
    textColor: '#059669',
    icon: 'checkCircle',
    iconBg: '#dcfce7',
  },
};

type FilterStatus = 'all' | 'scripted' | 'filming' | 'done';

const FILTER_TABS: {
  id: FilterStatus;
  icon: IconName;
  labelKey: string;
  color: string;
  iconBg: string;
}[] = [
  { id: 'all', icon: 'list', labelKey: 'projects.filterAll', color: '#3C3FEF', iconBg: '#EEF2FF' },
  {
    id: 'scripted',
    icon: 'notepad',
    labelKey: 'projects.filterScripted',
    color: '#4F46E5',
    iconBg: '#dee9ff',
  },
  {
    id: 'filming',
    icon: 'clapperboard',
    labelKey: 'projects.filterRecording',
    color: '#D97706',
    iconBg: '#FEF3C7',
  },
  {
    id: 'done',
    icon: 'checkCircle',
    labelKey: 'projects.filterFinished',
    color: '#059669',
    iconBg: '#D1FAE5',
  },
];

type ModalStep = 'choose' | 'createBlank';

interface ProjectCardProps {
  project: Project;
  index: number;
  onDelete: (id: string) => void;
  isSelectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

const ProjectCard = memo(function ProjectCard({
  project,
  index,
  onDelete,
  isSelectMode,
  isSelected,
  onToggleSelect,
}: ProjectCardProps) {
  const { t } = useTranslation();
  const swipeableRef = useRef<Swipeable>(null);
  const statusConfig = STATUS_CONFIG[project.status];
  const { clipRepository } = useDatabase();

  const { firstClipThumbnail, totalDuration } = useMemo(() => {
    if (!clipRepository) return { firstClipThumbnail: null, totalDuration: 0 };
    const clips = clipRepository.getByProject(project.id);
    return {
      firstClipThumbnail:
        project.status === 'scripted'
          ? null
          : (clips.find((c) => c.thumbnailUri)?.thumbnailUri ?? null),
      totalDuration: clips.reduce((sum, c) => sum + (c.durationSeconds ?? 0), 0),
    };
  }, [project.id, project.status, clipRepository]);

  const handleDelete = () => {
    swipeableRef.current?.close();
    Alert.alert(t('projects.deleteTitle'), t('projects.deleteMessage', { name: project.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('projects.delete'),
        style: 'destructive',
        onPress: () => onDelete(project.id),
      },
    ]);
  };

  const renderRightActions = () => (
    // Extends 20pt under the card (which renders on top) so the red reads as a
    // revealed background instead of a separate block with a corner gap.
    <Pressable
      onPress={handleDelete}
      className="items-center justify-center bg-danger"
      style={{
        width: 100,
        marginLeft: -20,
        paddingLeft: 20,
        borderTopRightRadius: 20,
        borderBottomRightRadius: 20,
      }}
    >
      <Text className="text-sm font-semibold text-white">{t('projects.delete')}</Text>
    </Pressable>
  );

  const cardShadowStyle = {
    shadowColor: '#181A22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    borderRadius: 20,
  };

  const cardStyle = {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6E9F4',
    borderRadius: 20,
    overflow: 'hidden' as const,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  };
  const cardInnerStyleAndroid = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    flex: 1,
  };
  const cardOuterStyleAndroid = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    shadowColor: '#181A22',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden' as const,
  };

  const cardChildren = (
    <>
      {isSelectMode && (
        <View
          className={`mr-3 h-7 w-7 items-center justify-center rounded-lg border-2 ${
            isSelected ? 'border-red-500 bg-red-500' : 'border-gray-300 bg-white'
          }`}
        >
          {isSelected && <Icon name="check" size={14} color="#FFFFFF" />}
        </View>
      )}

      {firstClipThumbnail ? (
        <Image
          source={{ uri: firstClipThumbnail }}
          style={{ width: 62, height: 82, borderRadius: 14, marginRight: 14 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            backgroundColor: statusConfig.iconBg,
            width: 62,
            height: 82,
            borderRadius: 14,
            marginRight: 14,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text className="font-display text-[20px]" style={{ color: statusConfig.textColor }}>
            {String(index + 1).padStart(2, '0')}
          </Text>
        </View>
      )}

      <View className="flex-1">
        <Text
          className="font-heading text-[17px] text-ink"
          style={{ letterSpacing: -0.4 }}
          numberOfLines={2}
        >
          {project.name}
        </Text>
        <View className="mt-1.5 flex-row items-center">
          {project.id.startsWith('sample-') && (
            <View className="mr-2 rounded-md bg-surface-subtle px-2 py-0.5">
              <Text className="font-sans-medium text-[11px] text-ink-tertiary">
                {t('projects.sample')}
              </Text>
            </View>
          )}
          <Text className="font-sans text-[13px] text-ink-tertiary">
            {formatDate(project.updatedAt)}
          </Text>
          {totalDuration > 0 && (
            <>
              <Text className="mx-1.5 text-[13px] text-ink-tertiary">·</Text>
              <Text className="font-mono text-[12px] text-ink-tertiary">
                {formatTimecode(totalDuration)}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Status badge: vertically centered trailing accessory */}
      <View
        style={{ backgroundColor: statusConfig.bgColor }}
        className="ml-2 flex-row items-center self-center rounded-full px-3 py-[7px]"
      >
        <Icon
          name={statusConfig.icon}
          size={11}
          color={statusConfig.textColor}
          style={{ marginRight: 4 }}
        />
        <Text style={{ color: statusConfig.textColor }} className="font-heading text-[11px]">
          {t(statusConfig.labelKey)}
        </Text>
      </View>
    </>
  );

  const cardContent =
    Platform.OS === 'android' ? (
      <Pressable
        onPress={isSelectMode ? () => onToggleSelect(project.id) : undefined}
        style={cardOuterStyleAndroid}
      >
        <View style={cardInnerStyleAndroid}>{cardChildren}</View>
      </Pressable>
    ) : (
      <Pressable
        onPress={isSelectMode ? () => onToggleSelect(project.id) : undefined}
        style={cardStyle}
      >
        {cardChildren}
      </Pressable>
    );

  if (isSelectMode) {
    return (
      <View className="mb-3" style={cardShadowStyle}>
        {cardContent}
      </View>
    );
  }

  return (
    <View className="mb-3" style={cardShadowStyle}>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        overshootRight={false}
        containerStyle={{ backgroundColor: 'transparent' }}
      >
        <Link
          href={
            project.status === 'scripted'
              ? `/(main)/projects/${project.id}/script`
              : `/(main)/projects/${project.id}/clips`
          }
          asChild
        >
          {cardContent}
        </Link>
      </Swipeable>
    </View>
  );
});

function EmptyState({ onCreatePress }: { onCreatePress: () => void }) {
  const { t } = useTranslation();

  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="mb-10 items-center">
        <View className="h-36 w-36 items-center justify-center rounded-[32px] bg-primary-tint">
          <Icon name="clapperboard" size={64} color="#3C3FEF" />
        </View>
      </View>

      <Text
        className="font-display mb-2 text-center text-[28px] text-ink"
        style={{ letterSpacing: -0.8 }}
      >
        {t('projects.empty')}
      </Text>
      <Text className="mb-8 max-w-[300px] text-center font-sans text-[17px] leading-relaxed text-ink-secondary">
        {t('projects.emptyDescription')}
      </Text>

      <Pressable
        onPress={onCreatePress}
        className="flex-row items-center justify-center rounded-lg px-8 py-3 active:scale-[0.97]"
        style={{ backgroundColor: '#3C3FEF' }}
      >
        <Icon name="plus" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text className="text-base font-semibold text-white">{t('projects.createProject')}</Text>
      </Pressable>

      <Text className="mt-8 text-center text-sm text-gray-400">{t('projects.emptyTagline')}</Text>
    </View>
  );
}

// const STATUS_BADGE_CONFIG: Record<string, { bg: string; text: string }> = {
//   ready_to_record: { bg: '#D1FAE5', text: '#059669' },
//   scheduled: { bg: '#FEF3C7', text: '#D97706' },
//   published: { bg: '#EEF2FF', text: '#4F46E5' },
//   default: { bg: '#F3F4F6', text: '#6B7280' },
// };

export default function ProjectsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { projects, addProject, addProjectWithScript, deleteProject } = useProjectStore();

  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>('choose');
  const [newProjectName, setNewProjectName] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');

  const filteredProjects = useMemo(() => {
    if (filterStatus === 'all') return projects;
    if (filterStatus === 'done')
      return projects.filter((p) => p.status === 'editing' || p.status === 'done');
    return projects.filter((p) => p.status === filterStatus);
  }, [projects, filterStatus]);

  const resetModal = () => {
    setShowModal(false);
    setModalStep('choose');
    setNewProjectName('');
  };

  const toggleSelectMode = () => {
    setIsSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      t('projects.deleteSelectedTitle'),
      t('projects.deleteSelectedMessage', { count: selectedIds.size }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('projects.delete'),
          style: 'destructive',
          onPress: () => {
            for (const id of selectedIds) {
              deleteProject(id);
            }
            setSelectedIds(new Set());
            setIsSelectMode(false);
          },
        },
      ]
    );
  };

  const handleCreateBlank = () => {
    if (newProjectName.trim()) {
      const newProject = addProject(newProjectName.trim());
      resetModal();
      router.push(`/(main)/projects/${newProject.id}/script`);
    }
  };

  const handlePasteFromClipboard = async () => {
    let text = '';
    try {
      text = await Clipboard.getStringAsync();
    } catch {
      // Permission denied or clipboard unavailable — treat as empty
    }
    if (!text.trim()) {
      Alert.alert(t('import.clipboardEmpty'), t('import.clipboardEmptyDesc'));
      return;
    }

    const trimmedText = text.trim();
    const normalizedForSplit = trimmedText
      .replace(/\r\n?/g, '\n')
      .replace(/\u2028|\u2029|\u0085/g, '\n')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    Alert.alert(t('import.pasteConfirmTitle'), t('import.pasteConfirmMessage'), [
      {
        text: t('import.keepAsIs'),
        style: 'cancel',
        onPress: () => {
          const name = trimmedText.slice(0, 40) || t('projects.newProject');
          const newProject = addProjectWithScript(name, trimmedText);
          resetModal();
          router.push(`/(main)/projects/${newProject.id}/script`);
        },
      },
      {
        text: t('import.splitScenes'),
        onPress: () => {
          const scenes = autoSplitScript(normalizedForSplit);
          const script = scenes.join('\n\n');
          const name = scenes[0]?.slice(0, 40) ?? t('projects.newProject');

          const newProject = addProjectWithScript(name, script);
          resetModal();
          router.push(`/(main)/projects/${newProject.id}/script`);
        },
      },
    ]);
  };

  const renderModalContent = () => {
    switch (modalStep) {
      case 'choose':
        return (
          <>
            <View className="mb-6 h-1 w-12 self-center rounded-full bg-gray-300" />
            <Text className="mb-6 text-2xl font-bold tracking-tight text-gray-900">
              {t('import.title')}
            </Text>

            <Pressable
              onPress={() => setModalStep('createBlank')}
              className="mb-3 flex-row items-center rounded-xl border-2 border-solid border-gray-100 p-4 active:bg-gray-50"
            >
              <Icon name="notepad" size={24} color="#3C3FEF" style={{ marginRight: 16 }} />
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900">
                  {t('import.createBlank')}
                </Text>
                <Text className="text-sm text-gray-500">{t('import.createBlankDesc')}</Text>
              </View>
            </Pressable>

            <Pressable
              onPress={handlePasteFromClipboard}
              className="mb-3 flex-row items-center rounded-xl border-2 border-solid border-gray-100 p-4 active:bg-gray-50"
            >
              <Icon name="clipboard" size={24} color="#0D9488" style={{ marginRight: 16 }} />
              <View className="flex-1">
                <Text className="text-base font-semibold text-gray-900">
                  {t('import.pasteFromClipboard')}
                </Text>
                <Text className="text-sm text-gray-500">{t('import.pasteFromClipboardDesc')}</Text>
              </View>
            </Pressable>
          </>
        );

      case 'createBlank':
        return (
          <>
            <View className="mb-6 h-1 w-12 self-center rounded-full bg-gray-300" />
            <Text className="mb-2 text-2xl font-bold tracking-tight text-gray-900">
              {t('projects.newProject')}
            </Text>
            <Text className="mb-6 text-sm text-gray-500">{t('projects.newProjectSubtitle')}</Text>

            <View className="mb-6">
              <Text className="mb-2 text-sm font-medium text-gray-700">
                {t('projects.projectName')}
              </Text>
              <TextInput
                value={newProjectName}
                onChangeText={setNewProjectName}
                placeholder={t('projects.projectNamePlaceholder')}
                placeholderTextColor="#9CA3AF"
                className="h-14 rounded-xl border-2 border-gray-100 bg-gray-50 px-4 text-base text-gray-900"
                autoFocus
              />
            </View>

            <View className="flex-row" style={{ gap: 12 }}>
              <Pressable
                onPress={() => setModalStep('choose')}
                style={{ flex: 1 }}
                className="items-center justify-center rounded-lg border-2 border-gray-200 py-4 active:bg-gray-50"
              >
                <Text className="font-semibold text-gray-500">{t('common.back')}</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateBlank}
                disabled={!newProjectName.trim()}
                style={{ flex: 1, backgroundColor: newProjectName.trim() ? '#3C3FEF' : '#E5E7EB' }}
                className="items-center justify-center rounded-lg py-4"
              >
                <Text
                  className={`font-semibold ${newProjectName.trim() ? 'text-white' : 'text-gray-400'}`}
                >
                  {t('common.create')}
                </Text>
              </Pressable>
            </View>
          </>
        );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS === 'ios' && <StatusBar barStyle="dark-content" />}

      {/* Header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text
              className="font-display text-[38px] leading-[42px] text-ink"
              style={{ letterSpacing: -1.9 }}
            >
              {t('projects.title')}
            </Text>
            <Text
              className="mt-1 font-sans text-[15px] text-ink-tertiary"
              style={{ letterSpacing: -0.4 }}
            >
              {t('projects.subtitle')}
            </Text>
          </View>
          <View className="flex-row items-center" style={{ gap: 8 }}>
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
            <Link href="/(main)/settings" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.settings')}
                className="h-11 w-11 items-center justify-center rounded-full border border-solid border-surface-line bg-white"
              >
                <Icon name="settings" size={20} color="#374151" />
              </Pressable>
            </Link>
          </View>
        </View>

        {projects.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-6"
            style={{ marginHorizontal: -16 }}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
          >
            {isSelectMode ? (
              <View className="min-h-[44px] justify-center">
                <Text className="font-heading text-lg text-ink">
                  {t('projects.selectedCount', { count: selectedIds.size })}
                </Text>
              </View>
            ) : (
              FILTER_TABS.map((tab) => {
                const isActive = filterStatus === tab.id;
                return (
                  <Pressable
                    key={tab.id}
                    onPress={() => setFilterStatus(tab.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={t(tab.labelKey)}
                    className={`min-h-[44px] items-center justify-center rounded-full px-5 active:scale-95 ${
                      isActive
                        ? 'border border-solid border-primary bg-primary'
                        : 'border border-solid border-surface-line bg-white'
                    }`}
                    hitSlop={4}
                  >
                    <Text
                      className={
                        isActive
                          ? 'font-heading text-[14px] text-white'
                          : 'font-sans-medium text-[14px] text-ink-secondary'
                      }
                    >
                      {t(tab.labelKey)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}
      </View>

      {!isSelectMode && <LimitedOfferCard />}

      {projects.length === 0 ? (
        <EmptyState onCreatePress={() => setShowModal(true)} />
      ) : (
        <>
          <ScrollView className="flex-1 px-4" showsVerticalScrollIndicator={false}>
            {filteredProjects.length === 0 ? (
              <View className="items-center py-16" style={{ backgroundColor: 'transparent' }}>
                <View className="mb-3">
                  <Icon name="search" size={36} color="#98A2B3" />
                </View>
                <Text className="text-base font-medium text-gray-500">
                  {t('projects.emptyFilter')}
                </Text>
                <Pressable
                  onPress={() => setFilterStatus('all')}
                  className="mt-4 min-h-[44px] justify-center rounded-xl px-5 active:bg-primary-tint"
                >
                  <Text className="text-base font-semibold text-primary">
                    {t('projects.emptyFilterCta')}
                  </Text>
                </Pressable>
              </View>
            ) : (
              filteredProjects.map((project, projectIndex) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  index={projectIndex}
                  onDelete={deleteProject}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.has(project.id)}
                  onToggleSelect={toggleSelect}
                />
              ))
            )}
          </ScrollView>
        </>
      )}

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
              {t('projects.deleteSelected', { count: selectedIds.size })}
            </Text>
          </Pressable>
        </View>
      )}

      {projects.length > 0 && !isSelectMode && (
        <View className="absolute right-5" style={{ bottom: insets.bottom + 82 }}>
          <Pressable
            onPress={() => setShowModal(true)}
            accessibilityRole="button"
            accessibilityLabel={t('projects.newProject')}
            className="min-h-[52px] flex-row items-center justify-center rounded-full bg-primary px-6 active:scale-95"
            style={{
              shadowColor: '#3C3FEF',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
              elevation: 6,
            }}
          >
            <Icon name="plus" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text className="font-heading text-[17px] text-white">{t('projects.newProject')}</Text>
          </Pressable>
        </View>
      )}

      <BottomSheetModal
        visible={showModal}
        onClose={resetModal}
        keyboardAvoiding
        showHandle={false}
      >
        {renderModalContent()}
      </BottomSheetModal>

      <BottomTabBar />
    </View>
  );
}
