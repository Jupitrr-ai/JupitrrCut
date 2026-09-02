import type { IconName } from '@shared/components/ui/Icon';
import { Icon } from '@shared/components/ui/Icon';
import { IconButton } from '@shared/components/ui/IconButton';
import {
  autoSplitScript,
  hasExplicitDelimiter,
  splitByDelimiter,
  DEFAULT_WORDS_PER_GROUP,
} from '@shared/utils/auto-split';
import { normalizeScript, parseClips } from '@shared/utils/clip-parser';
import * as Clipboard from 'expo-clipboard';
import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionSheetIOS,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

/**
 * Join two clips at the seam, inserting one space when neither side already has whitespace
 * there so merged sentences don't run together. Returns the seam offset for cursor placement.
 */
function joinClipTexts(first: string, second: string): { merged: string; seam: number } {
  const needsSpace =
    first.length > 0 && second.length > 0 && !/\s$/.test(first) && !/^\s/.test(second);
  const separator = needsSpace ? ' ' : '';
  return { merged: first + separator + second, seam: first.length + separator.length };
}

/** Parse initial script into clip text array */
function parseInitialClipTexts(script: string): string[] {
  const migrated = script.replace(/ \/\n/g, '\n').replace(/ \/$/, '').replace(/ \/ /g, '\n\n');
  return parseClips(migrated).map((clip) => clip.text);
}

type ToolbarTint = 'primary' | 'neutral' | 'danger';

/* Full class strings per tint so Tailwind can see them statically. NativeWind's Pressable
   drops a function-style `style` prop, so the pressed state lives in `active:` variants. */
const TOOLBAR_TINTS: Record<ToolbarTint, { container: string; label: string; fg: string }> = {
  primary: {
    container: 'bg-[#EEF2FF] active:bg-[#DDE3FF]',
    label: 'text-[#3C3FEF]',
    fg: '#3C3FEF',
  },
  neutral: {
    container: 'bg-[#F4F6FB] active:bg-[#E4E8F2]',
    label: 'text-[#4B5563]',
    fg: '#4B5563',
  },
  danger: {
    container: 'bg-[#FFF1F2] active:bg-[#FFE1E5]',
    label: 'text-[#E11D48]',
    fg: '#E11D48',
  },
};

interface ToolbarButtonProps {
  testID: string;
  icon: IconName;
  label: string;
  tint?: ToolbarTint;
  onPress: () => void;
}

/** Clip-editing toolbar action: 56pt square with pressed tint and scale feedback. */
function ToolbarButton({ testID, icon, label, tint = 'neutral', onPress }: ToolbarButtonProps) {
  const colors = TOOLBAR_TINTS[tint];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`h-14 min-w-[44px] shrink basis-14 items-center justify-center rounded-xl active:scale-95 ${colors.container}`}
    >
      <Icon name={icon} size={20} color={colors.fg} />
      <Text className={`mt-0.5 text-[10px] font-semibold ${colors.label}`}>{label}</Text>
    </Pressable>
  );
}

interface EditableScriptEditorProps {
  initialScript: string;
  onBack: () => void;
  onReady: (script: string) => void;
  onAutoSave?: (script: string) => void;
  /** Words-per-scene target for auto-split (from Settings). */
  wordsPerGroup?: number;
}

export function EditableScriptEditor({
  initialScript,
  onBack,
  onReady,
  onAutoSave,
  wordsPerGroup = DEFAULT_WORDS_PER_GROUP,
}: EditableScriptEditorProps) {
  const { t } = useTranslation();

  // Primary editing state: array of clip texts (no trimming, supports empty clips)
  const [clipTexts, setClipTexts] = useState<string[]>(() => parseInitialClipTexts(initialScript));

  // Derive serialized script for saving and offset calculation
  const script = useMemo(() => clipTexts.join('\n\n'), [clipTexts]);
  const normalizedScript = useMemo(() => normalizeScript(script), [script]);

  const inputRefs = useRef<Map<number, TextInput>>(new Map());
  const cursorPositions = useRef<Map<number, number>>(new Map());
  /** Caret to apply once the target input reports focus (see focusClipAt). */
  const pendingCaretRef = useRef<{ clipIndex: number; position: number } | null>(null);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutoSaveScriptRef = useRef<string | null>(null);
  const lastAutoSavedScriptRef = useRef<string>(normalizeScript(initialScript));

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  const prevClipCount = useRef(clipTexts.length);
  const clipCount = clipTexts.length;
  const hasClips = clipTexts.some((t) => t.trim().length > 0);
  const shouldRenderSceneList = clipCount > 1 || hasClips;
  const isValid = clipCount > 0 && clipTexts.every((t) => t.trim().length > 0);

  // Auto-focus first clip input when transitioning from empty state
  useEffect(() => {
    if (prevClipCount.current === 0 && clipCount > 0) {
      setTimeout(() => {
        inputRefs.current.get(0)?.focus();
      }, 50);
    }
    prevClipCount.current = clipCount;
  }, [clipCount]);

  useEffect(() => {
    setActiveClipIndex((current) => {
      if (clipCount === 0) return 0;
      return Math.max(0, Math.min(current, clipCount - 1));
    });
  }, [clipCount]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const handleClipTextChange = useCallback((index: number, newText: string) => {
    setClipTexts((prev) => prev.map((t, i) => (i === index ? newText : t)));
  }, []);

  const handleSelectionChange = useCallback((index: number, start: number) => {
    cursorPositions.current.set(index, start);
    setActiveClipIndex(index);
  }, []);

  // Detect paste when script is blank — split into scenes
  const handleEmptyScriptChange = useCallback(
    (newText: string) => {
      const isPaste = newText.trim().length > 20;
      if (!isPaste) {
        setClipTexts(newText.length > 0 ? [newText] : []);
        return;
      }

      // 1. Explicit "/" delimiters = the user's own break points. Honor them
      //    directly (paste-only), no prompt.
      if (hasExplicitDelimiter(newText)) {
        const segments = splitByDelimiter(newText);
        if (segments.length > 1) {
          setClipTexts(segments);
          return;
        }
      }

      // 2. Otherwise show the text and offer sentence/word auto-split.
      setClipTexts([newText]);

      Alert.alert(t('scriptEditor.autoSplitTitle'), t('scriptEditor.autoSplitMessage'), [
        {
          text: t('scriptEditor.autoSplitNo'),
          style: 'cancel',
        },
        {
          text: t('scriptEditor.autoSplitYes'),
          onPress: () => {
            setClipTexts(autoSplitScript(newText, { wordsPerGroup }));
          },
        },
      ]);
    },
    [t, wordsPerGroup]
  );

  const handleReady = useCallback(() => {
    if (isValid) {
      onReady(normalizedScript);
      lastAutoSavedScriptRef.current = normalizedScript;
      pendingAutoSaveScriptRef.current = null;
      clearAutoSaveTimer();
    }
  }, [clearAutoSaveTimer, isValid, normalizedScript, onReady]);

  const handleCopyScript = useCallback(async () => {
    if (!normalizedScript) return;
    await Clipboard.setStringAsync(normalizedScript);
    Alert.alert(t('scriptEditor.copySuccessTitle'), t('scriptEditor.copySuccessMessage'));
  }, [normalizedScript, t]);

  const handleShowMenu = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Copy Script'], cancelButtonIndex: 0 },
        (index) => {
          if (index === 1) void handleCopyScript();
        }
      );
    } else {
      Alert.alert('Options', undefined, [
        { text: 'Copy Script', onPress: () => void handleCopyScript() },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [handleCopyScript]);

  const setInputRef = useCallback((index: number, ref: TextInput | null) => {
    if (ref) {
      inputRefs.current.set(index, ref);
    } else {
      inputRefs.current.delete(index);
    }
  }, []);

  const handleAddScene = useCallback(() => {
    setClipTexts((prev) => {
      if (prev.length === 0) {
        setActiveClipIndex(0);
        setTimeout(() => {
          inputRefs.current.get(0)?.focus();
        }, 50);
        return [''];
      }

      const baseIndex = Math.max(0, Math.min(activeClipIndex, prev.length - 1));
      const insertIndex = baseIndex + 1;
      const next = [...prev.slice(0, insertIndex), '', ...prev.slice(insertIndex)];
      setActiveClipIndex(insertIndex);
      setTimeout(() => {
        inputRefs.current.get(insertIndex)?.focus();
      }, 50);
      return next;
    });
  }, [activeClipIndex]);

  /**
   * Move the caret imperatively, one frame later: iOS moves the caret to the end of a field
   * while it becomes first responder, so anything applied synchronously gets overwritten.
   */
  const placeCaret = useCallback((input: TextInput, position: number) => {
    requestAnimationFrame(() => {
      if (typeof input.setSelection === 'function') input.setSelection(position, position);
    });
  }, []);

  /**
   * Focus a clip and put the caret at `position`. If the input already has focus, the caret is
   * placed directly; otherwise it is applied from the input's onFocus, after native focus.
   */
  const focusClipAt = useCallback(
    (clipIndex: number, position: number | (() => number)) => {
      setTimeout(() => {
        const input = inputRefs.current.get(clipIndex);
        if (!input) return;
        // Resolved here, after React has run the state updater that computes the seam
        const resolved = typeof position === 'function' ? position() : position;
        const isFocused = typeof input.isFocused === 'function' && input.isFocused();
        if (isFocused) {
          placeCaret(input, resolved);
        } else {
          pendingCaretRef.current = { clipIndex, position: resolved };
          input.focus();
        }
      }, 50);
    },
    [placeCaret]
  );

  const handleInputFocus = useCallback(
    (index: number) => {
      setActiveClipIndex(index);
      const pending = pendingCaretRef.current;
      if (pending?.clipIndex !== index) return;
      pendingCaretRef.current = null;
      const input = inputRefs.current.get(index);
      if (input) placeCaret(input, pending.position);
    },
    [placeCaret]
  );

  // Split the active clip at the current cursor position
  const handleSplitAtCursor = useCallback(
    (index: number) => {
      const cursorPos = cursorPositions.current.get(index) ?? 0;
      setClipTexts((prev) => {
        const text = prev[index] ?? '';
        const before = text.slice(0, cursorPos);
        const after = text.slice(cursorPos);
        return [...prev.slice(0, index), before, after, ...prev.slice(index + 1)];
      });
      setActiveClipIndex(index + 1);
      // Caret stays at the split point, which is the start of the new clip
      focusClipAt(index + 1, 0);
    },
    [focusClipAt]
  );

  // Merge current clip up into the previous clip
  const handleMergeUp = useCallback(
    (index: number) => {
      if (index === 0) return;
      let seam = 0;
      setClipTexts((prev) => {
        const prevText = prev[index - 1] ?? '';
        const currentText = prev[index] ?? '';
        const joined = joinClipTexts(prevText, currentText);
        seam = joined.seam;
        return [...prev.slice(0, index - 1), joined.merged, ...prev.slice(index + 1)];
      });
      setActiveClipIndex(index - 1);
      focusClipAt(index - 1, () => seam);
    },
    [focusClipAt]
  );

  // Merge current clip down into the next clip
  const handleMergeDown = useCallback(
    (index: number) => {
      let seam = 0;
      setClipTexts((prev) => {
        if (index >= prev.length - 1) return prev;
        const currentText = prev[index] ?? '';
        const nextText = prev[index + 1] ?? '';
        const joined = joinClipTexts(currentText, nextText);
        seam = joined.seam;
        return [...prev.slice(0, index), joined.merged, ...prev.slice(index + 2)];
      });
      focusClipAt(index, () => seam);
    },
    [focusClipAt]
  );

  // Delete the clip at the given index
  const handleDeleteClip = useCallback(
    (index: number) => {
      const doDelete = () => {
        setClipTexts((prev) => {
          if (prev.length === 1) return [''];
          const newIndex = Math.max(0, index - 1);
          setActiveClipIndex(newIndex);
          setTimeout(() => {
            inputRefs.current.get(newIndex)?.focus();
          }, 50);
          return [...prev.slice(0, index), ...prev.slice(index + 1)];
        });
      };

      if ((clipTexts[index]?.trim() ?? '').length > 0) {
        Alert.alert(t('scriptEditor.deleteClipTitle'), t('scriptEditor.deleteClipMessage'), [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('scriptEditor.deleteClip'), style: 'destructive', onPress: doDelete },
        ]);
      } else {
        doDelete();
      }
    },
    [clipTexts, t]
  );

  useEffect(() => {
    if (!onAutoSave) return;
    if (normalizedScript === lastAutoSavedScriptRef.current) return;

    pendingAutoSaveScriptRef.current = normalizedScript;
    clearAutoSaveTimer();
    autoSaveTimerRef.current = setTimeout(() => {
      if (!pendingAutoSaveScriptRef.current) return;
      onAutoSave(pendingAutoSaveScriptRef.current);
      lastAutoSavedScriptRef.current = pendingAutoSaveScriptRef.current;
      pendingAutoSaveScriptRef.current = null;
      autoSaveTimerRef.current = null;
    }, 500);
  }, [clearAutoSaveTimer, normalizedScript, onAutoSave]);

  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
      if (onAutoSave && pendingAutoSaveScriptRef.current) {
        onAutoSave(pendingAutoSaveScriptRef.current);
        lastAutoSavedScriptRef.current = pendingAutoSaveScriptRef.current;
        pendingAutoSaveScriptRef.current = null;
      }
    };
  }, [clearAutoSaveTimer, onAutoSave]);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header — single row: back | emoji | title | more */}
      <View className="flex-row items-center gap-2 px-6 pb-3 pt-4">
        <IconButton
          icon="arrowLeft"
          accessibilityLabel={t('common.back')}
          onPress={onBack}
          testID="back-button"
          size={24}
          color="#8A8FA3"
          className="-ml-2"
        />
        <View className="flex-1">
          <Text className="text-xl font-bold text-gray-900">{t('scriptEditor.title')}</Text>
          <Text className="text-sm text-ink-tertiary">{t('scriptEditor.subtitleEditable')}</Text>
        </View>
        <Pressable onPress={handleShowMenu} className="p-2" hitSlop={8}>
          <Icon name="more" size={20} color="#6B7280" />
        </Pressable>
      </View>

      {/* Script Content in card */}
      <ScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
        <View
          className="flex-1 overflow-hidden rounded-2xl bg-white"
          style={{
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          <View
            style={{
              flex: 1,
              borderRadius: 16,
            }}
          >
            <View className="flex-1 p-3" style={{ minHeight: 300 }}>
              {!shouldRenderSceneList ? (
                <TextInput
                  testID="script-input"
                  className="min-h-[260px] text-[17px] leading-8 text-gray-700"
                  value={clipTexts[0] ?? ''}
                  onChangeText={handleEmptyScriptChange}
                  multiline
                  placeholder={t('scriptEditor.placeholder')}
                  placeholderTextColor="#98A2B3"
                  textAlignVertical="top"
                  autoFocus
                />
              ) : (
                clipTexts.map((text, index) => (
                  <View key={`clip-${index}`} className={index > 0 ? 'mt-5' : ''}>
                    {/* Clip header: number badge only — editing actions are in the footer toolbar */}
                    <View className="mb-1.5 flex-row items-center">
                      <View
                        className="h-[22px] min-w-[22px] items-center justify-center rounded px-1"
                        style={{ backgroundColor: '#EEF2FF' }}
                      >
                        <Text className="text-[11px] font-bold" style={{ color: '#3C3FEF' }}>
                          {index + 1}
                        </Text>
                      </View>
                    </View>
                    <TextInput
                      ref={(ref) => setInputRef(index, ref)}
                      testID={`clip-input-${index}`}
                      className="text-[17px] leading-8 text-gray-700"
                      value={text}
                      onChangeText={(t) => handleClipTextChange(index, t)}
                      onSelectionChange={(e) =>
                        handleSelectionChange(index, e.nativeEvent.selection.start)
                      }
                      onFocus={() => handleInputFocus(index)}
                      multiline
                      textAlignVertical="top"
                      scrollEnabled={false}
                    />
                  </View>
                ))
              )}
            </View>
          </View>
        </View>

        <View className="h-6" />
      </ScrollView>

      {/* Footer CTA */}
      {/* pb clears the home indicator; keyboard replaces that zone, so shrink it while typing */}
      <View className={`bg-white px-4 pt-2 ${isKeyboardVisible ? 'pb-2' : 'pb-10'}`}>
        {/* Toolbar: clip-editing actions for the active clip, most-used first */}
        {shouldRenderSceneList && (
          <View className="mb-4 flex-row items-center gap-2">
            <ToolbarButton
              testID="toolbar-split"
              icon="scissors"
              label={t('scriptEditor.split')}
              tint="primary"
              onPress={() => handleSplitAtCursor(activeClipIndex)}
            />
            {activeClipIndex > 0 && (
              <ToolbarButton
                testID="toolbar-merge-up"
                icon="arrowUp"
                label={t('scriptEditor.merge')}
                onPress={() => handleMergeUp(activeClipIndex)}
              />
            )}
            {activeClipIndex < clipCount - 1 && (
              <ToolbarButton
                testID="toolbar-merge-down"
                icon="arrowDown"
                label={t('scriptEditor.merge')}
                onPress={() => handleMergeDown(activeClipIndex)}
              />
            )}
            <ToolbarButton
              testID="toolbar-add"
              icon="plus"
              label={t('common.add')}
              onPress={handleAddScene}
            />
            {clipCount > 1 && (
              <ToolbarButton
                testID="toolbar-delete"
                icon="close"
                label={t('common.delete')}
                tint="danger"
                onPress={() => handleDeleteClip(activeClipIndex)}
              />
            )}
            {isKeyboardVisible && (
              <Pressable
                onPress={() => Keyboard.dismiss()}
                className="items-center justify-center rounded-xl active:bg-gray-100"
                style={{ width: 44, height: 56, marginLeft: 'auto' }}
                hitSlop={4}
              >
                <Icon name="keyboardHide" size={22} color="#6B7280" />
              </Pressable>
            )}
          </View>
        )}

        {!isKeyboardVisible && (
          <Pressable
            testID="ready-button"
            onPress={handleReady}
            disabled={!isValid}
            className="min-h-[56px] flex-row items-center justify-center rounded-2xl active:scale-95"
            style={{
              backgroundColor: isValid ? '#3C3FEF' : '#EAECF0',
            }}
          >
            <Text
              className="font-heading text-[17px]"
              style={{ color: isValid ? '#fff' : '#98A2B3' }}
            >
              {t('scriptEditor.readyForRecording')}
            </Text>
            <Icon
              name="video"
              size={16}
              color={isValid ? '#fff' : '#98A2B3'}
              style={{ marginLeft: 8 }}
            />
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
