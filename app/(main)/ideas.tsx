import { useAuthRepository, useIdeaRepository } from '@lib/providers/DatabaseProvider';
import {
  cachePreviewThumbnail,
  deleteCachedThumbnail,
  detectProvider,
  extractUrl,
  fetchLinkPreview,
  fetchPreviewWithCache,
} from '@lib/services/linkPreview';
import { BottomSheetModal } from '@shared/components/BottomSheetModal';
import { BottomTabBar } from '@shared/components/BottomTabBar';
import { Icon } from '@shared/components/ui/Icon';
import type { Idea } from '@shared/types';
import { formatRelativeTime } from '@shared/utils/date';
import * as Clipboard from 'expo-clipboard';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type FilterId = 'all' | 'reels' | 'tiktok' | 'youtube' | 'notes' | 'links';

const FILTERS: { id: FilterId; labelKey: string }[] = [
  { id: 'all', labelKey: 'ideas.filterAll' },
  { id: 'reels', labelKey: 'ideas.filterReels' },
  { id: 'tiktok', labelKey: 'ideas.filterTikTok' },
  { id: 'youtube', labelKey: 'ideas.filterYouTube' },
  { id: 'notes', labelKey: 'ideas.filterNotes' },
  { id: 'links', labelKey: 'ideas.filterLinks' },
];

type Provider = NonNullable<Idea['preview']>['provider'];

const PROVIDER_LABEL: Record<NonNullable<Provider> & string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  twitter: 'Twitter',
  generic: 'Link',
};

const CARD_STYLE = {
  backgroundColor: '#FFFFFF',
  borderWidth: 1,
  borderColor: '#E6E9F4',
  shadowColor: '#181A22',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 2,
  borderRadius: 20,
};

function useResolvedOwnerId(): string | null {
  const authRepo = useAuthRepository();
  return useMemo(() => {
    const state = authRepo.getState();
    if (!state) return null;
    if (state.mode === 'authenticated' && state.firebaseUid) return state.firebaseUid;
    return `guest_${state.guestId}`;
  }, [authRepo]);
}

const MEDIA_PROVIDERS: ReadonlySet<string> = new Set(['instagram', 'tiktok', 'youtube']);

function isMediaIdea(idea: Idea): boolean {
  const provider = idea.preview?.provider;
  return !!(provider && MEDIA_PROVIDERS.has(provider) && idea.preview?.thumbnail);
}

interface CardProps {
  idea: Idea;
  onMenu: (idea: Idea) => void;
  onEdit: (idea: Idea) => void;
  onOpenLink: (idea: Idea) => void;
}

function MenuButton({ onPress, dark = false }: { onPress: () => void; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full"
      style={{
        zIndex: 10,
        backgroundColor: dark ? 'rgba(0,0,0,0.45)' : 'transparent',
      }}
    >
      <Icon name="more" size={20} color={dark ? '#fff' : '#6B7280'} />
    </Pressable>
  );
}

function MediaCard({ idea, onMenu, onEdit }: CardProps) {
  const preview = idea.preview!;
  const provider = (preview.provider ?? 'generic') as keyof typeof PROVIDER_LABEL;
  const overlay = idea.text?.trim() || preview.title?.trim() || '';

  return (
    <Pressable
      onPress={() => onEdit(idea)}
      className="mb-3 overflow-hidden active:opacity-80"
      style={CARD_STYLE}
    >
      <View style={{ aspectRatio: 9 / 16, width: '100%' }}>
        <Image
          source={{ uri: preview.thumbnail! }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
        <View
          className="absolute left-2 top-2 rounded-md px-2 py-0.5"
          style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
        >
          <Text className="font-heading text-[10px] tracking-wider text-white">
            {PROVIDER_LABEL[provider].toUpperCase()}
          </Text>
        </View>
        <MenuButton onPress={() => onMenu(idea)} dark />
        {overlay ? (
          <View
            className="absolute bottom-0 left-0 right-0 px-3 pb-3 pt-6"
            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
          >
            <Text className="font-heading text-sm text-white" numberOfLines={3}>
              {overlay}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function StickerCard({ idea, onMenu, onEdit }: CardProps) {
  const { t } = useTranslation();
  const fullText = idea.text ?? '';
  const firstBreak = fullText.indexOf('\n');
  const title = (firstBreak >= 0 ? fullText.slice(0, firstBreak) : fullText).trim();
  const body = firstBreak >= 0 ? fullText.slice(firstBreak + 1).trim() : '';
  const headline = title || idea.url || t('ideas.stickerHeader');

  return (
    <Pressable
      onPress={() => onEdit(idea)}
      className="mb-3 overflow-hidden active:opacity-80"
      style={CARD_STYLE}
    >
      <MenuButton onPress={() => onMenu(idea)} />
      <View className="p-4 pr-10">
        <Text className="text-xs font-medium uppercase tracking-wider text-gray-400">
          {t('ideas.stickerHeader')}
        </Text>
        <Text
          className="font-heading mt-1 text-[17px] text-ink"
          style={{ letterSpacing: -0.4 }}
          numberOfLines={3}
        >
          {headline}
        </Text>
        {body ? (
          <Text
            className="mt-1 font-sans text-[14px] leading-relaxed text-ink-secondary"
            numberOfLines={5}
          >
            {body}
          </Text>
        ) : null}
        <Text className="mt-3 font-sans text-[12px] text-ink-tertiary">
          {formatRelativeTime(idea.createdAt)}
        </Text>
      </View>
    </Pressable>
  );
}

function IdeaCard(props: CardProps) {
  return isMediaIdea(props.idea) ? <MediaCard {...props} /> : <StickerCard {...props} />;
}

interface ActionMenuSheetProps {
  idea: Idea | null;
  onClose: () => void;
  onEdit: (idea: Idea) => void;
  onOpenLink: (idea: Idea) => void;
  onRemove: (idea: Idea) => void;
}

function ActionMenuSheet({ idea, onClose, onEdit, onOpenLink, onRemove }: ActionMenuSheetProps) {
  const { t } = useTranslation();
  const visible = idea !== null;

  return (
    <BottomSheetModal visible={visible} onClose={onClose}>
      <Text className="mb-3 text-sm font-medium text-gray-500">{t('ideas.actionMenuTitle')}</Text>
      {idea?.url ? (
        <Pressable
          onPress={() => idea && onOpenLink(idea)}
          className="flex-row items-center rounded-xl px-4 py-4 active:bg-black/5"
        >
          <Icon name="link" size={20} color="#101828" style={{ marginRight: 12 }} />
          <Text className="text-base font-medium text-gray-900">{t('ideas.openLink')}</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => idea && onEdit(idea)}
        className="flex-row items-center rounded-xl px-4 py-4 active:bg-black/5"
      >
        <Icon name="edit" size={20} color="#101828" style={{ marginRight: 12 }} />
        <Text className="text-base font-medium text-gray-900">{t('ideas.edit')}</Text>
      </Pressable>
      <Pressable
        onPress={() => idea && onRemove(idea)}
        className="flex-row items-center rounded-xl px-4 py-4 active:bg-black/5"
      >
        <Icon name="trash" size={20} color="#DC2626" style={{ marginRight: 12 }} />
        <Text className="text-base font-medium" style={{ color: '#DC2626' }}>
          {t('ideas.remove')}
        </Text>
      </Pressable>
      <Pressable
        onPress={onClose}
        className="mt-2 flex-row items-center justify-center rounded-xl py-4 active:bg-black/5"
      >
        <Text className="text-base font-medium text-gray-600">{t('ideas.cancel')}</Text>
      </Pressable>
    </BottomSheetModal>
  );
}

interface EditIdeaSheetProps {
  idea: Idea | null;
  onClose: () => void;
  onSave: (id: string, text: string) => Promise<void>;
  onOpenLink: (idea: Idea) => void;
}

function EditIdeaSheet({ idea, onClose, onSave, onOpenLink }: EditIdeaSheetProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const visible = idea !== null;

  useEffect(() => {
    if (idea) {
      setInput(idea.text);
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [idea]);

  const trimmed = input.trim();
  const canSave = !!trimmed && trimmed !== idea?.text;

  const handleSave = async () => {
    if (!idea) return;
    if (!canSave) {
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await onSave(idea.id, trimmed);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheetModal visible={visible} onClose={onClose} keyboardAvoiding>
      <Text className="text-xl font-semibold text-gray-900">{t('ideas.editNoteTitle')}</Text>
      <Text className="mt-1 text-sm text-gray-500">{t('ideas.editNoteSubtitle')}</Text>

      <View
        className="mt-4 rounded-2xl border px-4 py-3"
        style={{ borderColor: 'rgba(60,63,239,0.15)', backgroundColor: '#F8F9FF' }}
      >
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          placeholderTextColor="#9CA3AF"
          multiline
          className="min-h-[88px] text-base text-gray-900"
          style={{ textAlignVertical: 'top' }}
          autoCapitalize="sentences"
          editable={!submitting}
        />
      </View>

      <View className="mt-4 flex-row" style={{ gap: 8 }}>
        {idea?.url ? (
          <Pressable
            onPress={() => idea && onOpenLink(idea)}
            disabled={submitting}
            className="flex-row items-center justify-center rounded-xl border px-4 py-4 active:bg-black/5"
            style={{ borderColor: 'rgba(60,63,239,0.25)' }}
          >
            <Icon name="link" size={16} color="#3C3FEF" style={{ marginRight: 6 }} />
            <Text className="text-base font-semibold" style={{ color: '#3C3FEF' }}>
              {t('ideas.openLink')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={handleSave}
          disabled={!canSave || submitting}
          className="flex-1 flex-row items-center justify-center rounded-xl py-4"
          style={{
            backgroundColor: canSave && !submitting ? '#3C3FEF' : '#EAECF0',
          }}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              className="text-base font-semibold"
              style={{ color: canSave ? '#fff' : '#98A2B3' }}
            >
              {t('ideas.saveChanges')}
            </Text>
          )}
        </Pressable>
      </View>
    </BottomSheetModal>
  );
}

interface AddIdeaSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (args: { text: string; url: string | null }) => Promise<void>;
}

function AddIdeaSheet({ visible, onClose, onSubmit }: AddIdeaSheetProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setInput('');
      const timer = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const detectedUrl = useMemo(() => extractUrl(input), [input]);
  const detectedProvider = useMemo(
    () => (detectedUrl ? detectProvider(detectedUrl) : null),
    [detectedUrl]
  );

  const handlePaste = async () => {
    const clip = await Clipboard.getStringAsync();
    if (clip) setInput(clip);
  };

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onSubmit({ text: trimmed, url: detectedUrl });
      setInput('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const saveLabel = t('ideas.saveIdea');

  return (
    <BottomSheetModal visible={visible} onClose={onClose} keyboardAvoiding>
      <Text className="text-xl font-semibold text-gray-900">{t('ideas.sheetTitle')}</Text>
      <Text className="mt-1 text-sm text-gray-500">{t('ideas.sheetSubtitle')}</Text>

      <View
        className="mt-5 rounded-2xl border px-4 py-3"
        style={{ borderColor: 'rgba(60,63,239,0.15)', backgroundColor: '#F8F9FF' }}
      >
        <TextInput
          ref={inputRef}
          value={input}
          onChangeText={setInput}
          placeholder={t('ideas.inputPlaceholder')}
          placeholderTextColor="#9CA3AF"
          multiline
          className="min-h-[88px] text-base text-gray-900"
          style={{ textAlignVertical: 'top' }}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
        />
      </View>

      {detectedProvider ? (
        <View className="mt-3 flex-row items-center">
          <View className="rounded-md bg-surface-subtle px-2 py-1">
            <Text className="font-heading text-[11px] tracking-wider text-ink-secondary">
              {t('ideas.detected')} · {PROVIDER_LABEL[detectedProvider].toUpperCase()}
            </Text>
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={handlePaste}
        disabled={submitting}
        className="mt-4 flex-row items-center justify-center rounded-xl border py-3 active:bg-black/5"
        style={{ borderColor: 'rgba(60,63,239,0.25)' }}
      >
        <Icon name="clipboard" size={16} color="#3C3FEF" style={{ marginRight: 8 }} />
        <Text className="text-sm font-medium" style={{ color: '#3C3FEF' }}>
          {t('ideas.pasteFromClipboard')}
        </Text>
      </Pressable>

      <Pressable
        onPress={handleSubmit}
        disabled={!input.trim() || submitting}
        className="mt-3 flex-row items-center justify-center rounded-xl py-4"
        style={{
          backgroundColor: input.trim() && !submitting ? '#3C3FEF' : '#EAECF0',
        }}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text
            className="text-base font-semibold"
            style={{ color: input.trim() ? '#fff' : '#98A2B3' }}
          >
            {saveLabel}
          </Text>
        )}
      </Pressable>
    </BottomSheetModal>
  );
}

export default function IdeasScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const ideaRepo = useIdeaRepository();
  const ownerId = useResolvedOwnerId();

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [filter, setFilter] = useState<FilterId>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuIdea, setMenuIdea] = useState<Idea | null>(null);
  const [editingIdea, setEditingIdea] = useState<Idea | null>(null);
  const attemptedPreviewRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!ownerId) return;
    setIdeas(ideaRepo.getAll(ownerId));
  }, [ideaRepo, ownerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const todo = ideas.filter((i) => {
      if (i.type !== 'link' || !i.url) return false;
      if (attemptedPreviewRef.current.has(i.id)) return false;
      const thumb = i.preview?.thumbnail;
      const needsFetch = !i.preview?.title && !thumb;
      const needsLocalCache = !!thumb && /^https?:\/\//i.test(thumb);
      return needsFetch || needsLocalCache;
    });
    if (todo.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const idea of todo) {
        if (cancelled || !idea.url) continue;
        attemptedPreviewRef.current.add(idea.id);
        try {
          let preview = idea.preview ?? null;
          const needsFetch = !preview?.title && !preview?.thumbnail;

          if (needsFetch) {
            preview = await fetchLinkPreview(idea.url);
          }
          if (cancelled) return;

          if (preview?.thumbnail && /^https?:\/\//i.test(preview.thumbnail)) {
            const localUri = await cachePreviewThumbnail(preview.thumbnail, idea.id);
            if (localUri) preview = { ...preview, thumbnail: localUri };
          }
          if (cancelled) return;

          if (preview && (preview.title || preview.thumbnail || preview.provider)) {
            const merged = { ...(idea.preview ?? {}), ...preview };
            const updated = ideaRepo.updatePreview(idea.id, merged);
            if (updated) {
              setIdeas((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
            }
          }
        } catch {
          // best-effort
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ideas, ideaRepo]);

  const handleOpenLink = useCallback(async (idea: Idea) => {
    if (!idea.url) return;
    try {
      await Linking.openURL(idea.url);
    } catch {
      // ignore — if the URL is malformed the OS will surface the failure
    }
  }, []);

  const handleEditIdea = useCallback((idea: Idea) => {
    setEditingIdea(idea);
  }, []);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'reels':
        return ideas.filter((i) => i.type === 'link' && i.preview?.provider === 'instagram');
      case 'tiktok':
        return ideas.filter((i) => i.type === 'link' && i.preview?.provider === 'tiktok');
      case 'youtube':
        return ideas.filter((i) => i.type === 'link' && i.preview?.provider === 'youtube');
      case 'notes':
        return ideas.filter((i) => i.type === 'note');
      case 'links':
        return ideas.filter((i) => i.type === 'link');
      default:
        return ideas;
    }
  }, [ideas, filter]);

  const columns = useMemo(() => {
    const a: Idea[] = [];
    const b: Idea[] = [];
    let hA = 0;
    let hB = 0;
    for (const idea of filtered) {
      // Rough height estimates so the two columns balance visually.
      const h = isMediaIdea(idea) ? 280 : 100 + Math.min(180, (idea.text?.length ?? 0) * 0.8);
      if (hA <= hB) {
        a.push(idea);
        hA += h;
      } else {
        b.push(idea);
        hB += h;
      }
    }
    return [a, b] as const;
  }, [filtered]);

  const handleMenuRemove = (idea: Idea) => {
    setMenuIdea(null);
    Alert.alert(t('ideas.deleteTitle'), t('ideas.deleteMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('ideas.remove'),
        style: 'destructive',
        onPress: () => {
          ideaRepo.delete(idea.id);
          void deleteCachedThumbnail(idea.preview?.thumbnail);
          refresh();
        },
      },
    ]);
  };

  const handleMenuEdit = (idea: Idea) => {
    setMenuIdea(null);
    setEditingIdea(idea);
  };

  const handleSaveEdit = async (id: string, text: string) => {
    const url = extractUrl(text);
    const existing = ideas.find((i) => i.id === id);
    const urlChanged = (existing?.url ?? null) !== (url ?? null);
    const basePreview = urlChanged ? null : (existing?.preview ?? null);

    const updated = ideaRepo.updateContent(id, {
      text,
      url,
      preview: basePreview,
      type: url ? 'link' : 'note',
    });
    if (!updated) return;
    setIdeas((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));

    if (urlChanged) {
      void deleteCachedThumbnail(existing?.preview?.thumbnail);
    }

    if (url && urlChanged) {
      attemptedPreviewRef.current.delete(id);
      try {
        const preview = await fetchPreviewWithCache(url, id);
        if (preview.title || preview.thumbnail || preview.provider) {
          const withPreview = ideaRepo.updatePreview(id, preview);
          if (withPreview) {
            setIdeas((prev) => prev.map((i) => (i.id === withPreview.id ? withPreview : i)));
          }
        }
      } catch {
        // best-effort
      }
    }
  };

  const handleSubmit = async ({ text, url }: { text: string; url: string | null }) => {
    if (!ownerId) return;

    if (url) {
      const created = ideaRepo.createLink({ url, text, ownerId });
      setIdeas((prev) => [created, ...prev]);

      try {
        const preview = await fetchPreviewWithCache(url, created.id);
        const updated = ideaRepo.updatePreview(created.id, preview);
        if (updated) {
          setIdeas((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        }
      } catch {
        // best-effort — leave card without preview
      }
    } else {
      const created = ideaRepo.createNote({ text, ownerId });
      setIdeas((prev) => [created, ...prev]);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {Platform.OS === 'ios' && <StatusBar barStyle="dark-content" />}

      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 12 }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text
              className="font-display text-[38px] leading-[42px] text-ink"
              style={{ letterSpacing: -1.9 }}
            >
              {t('ideas.title')}
            </Text>
            <Text
              className="mt-1 font-sans text-[15px] text-ink-tertiary"
              style={{ letterSpacing: -0.4 }}
            >
              {t('ideas.captured', { count: ideas.length })}
            </Text>
          </View>
          <Link href="/(main)/settings" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.settings')}
              className="h-11 w-11 items-center justify-center rounded-full border border-solid border-surface-line bg-white"
            >
              <Icon name="settings" size={20} color="#101828" />
            </Pressable>
          </Link>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-6"
          style={{ marginHorizontal: -16 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
        >
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilter(f.id)}
                className="min-h-[44px] items-center justify-center rounded-full px-5 active:scale-95"
                style={{
                  backgroundColor: active ? '#3C3FEF' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: active ? '#3C3FEF' : '#E6E9F4',
                }}
              >
                <Text
                  style={{ color: active ? '#fff' : '#4E5265' }}
                  className={active ? 'font-heading text-[14px]' : 'font-sans-medium text-[14px]'}
                >
                  {t(f.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 160 }}
        showsVerticalScrollIndicator={false}
      >
        {filtered.length === 0 ? (
          <View className="items-center py-16">
            <Icon name="idea" size={36} color="#98A2B3" style={{ marginBottom: 12 }} />
            <Text className="font-sans text-[16px] text-ink-tertiary">{t('ideas.empty')}</Text>
          </View>
        ) : (
          <View className="flex-row">
            <View className="flex-1 px-1">
              {columns[0].map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onMenu={setMenuIdea}
                  onEdit={handleEditIdea}
                  onOpenLink={handleOpenLink}
                />
              ))}
            </View>
            <View className="flex-1 px-1">
              {columns[1].map((idea) => (
                <IdeaCard
                  key={idea.id}
                  idea={idea}
                  onMenu={setMenuIdea}
                  onEdit={handleEditIdea}
                  onOpenLink={handleOpenLink}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View
        className="absolute right-5"
        style={{ bottom: insets.bottom + 82 }}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => setSheetOpen(true)}
          className="min-h-[52px] flex-row items-center justify-center rounded-full px-6 active:scale-95"
          style={{
            backgroundColor: '#3C3FEF',
            shadowColor: '#3C3FEF',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 12,
            elevation: 6,
          }}
        >
          <Icon name="plus" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text className="font-heading text-[17px] text-white">{t('ideas.addIdea')}</Text>
        </Pressable>
      </View>

      <BottomTabBar />

      <AddIdeaSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleSubmit}
      />

      <ActionMenuSheet
        idea={menuIdea}
        onClose={() => setMenuIdea(null)}
        onEdit={handleMenuEdit}
        onOpenLink={(idea) => {
          setMenuIdea(null);
          void handleOpenLink(idea);
        }}
        onRemove={handleMenuRemove}
      />

      <EditIdeaSheet
        idea={editingIdea}
        onClose={() => setEditingIdea(null)}
        onSave={handleSaveEdit}
        onOpenLink={(idea) => {
          setEditingIdea(null);
          void handleOpenLink(idea);
        }}
      />
    </View>
  );
}
