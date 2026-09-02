import { PremiumSection } from '@features/settings/components/PremiumSection';
import { resetDatabase } from '@lib/database';
import { useSettingsRepository } from '@lib/providers/DatabaseProvider';
import type { TeleprompterFont } from '@lib/repositories/types';
import { reportBug } from '@lib/services/bugReport';
import { Slider } from '@shared/components/Slider';
import { Icon } from '@shared/components/ui/Icon';
import { IconButton } from '@shared/components/ui/IconButton';
import {
  autoSplitScript,
  MAX_WORDS_PER_GROUP,
  MIN_WORDS_PER_GROUP,
} from '@shared/utils/auto-split';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Full-width settings group: transparent rows, structure comes from dividers. */
function Section({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}

/** Bold editorial section label (Studio Pop take on the iOS group header). */
function SectionHeader({ children }: { children: React.ReactNode }) {
  return <Text className="mb-1 ml-4 font-heading text-[16px] text-ink">{children}</Text>;
}

/** Footnote below a group. */
function SectionFooter({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mt-1 px-4 font-sans text-[13px] leading-[18px] text-ink-tertiary">
      {children}
    </Text>
  );
}

/** Hairline between rows, inset from the left like iOS grouped lists. */
function RowSeparator() {
  return <View className="ml-4 h-px bg-surface-line" />;
}

const FONT_OPTIONS: { value: TeleprompterFont; label: string }[] = [
  { value: 'VarelaRound_400Regular', label: 'Varela Round' },
  { value: 'Nunito_400Regular', label: 'Nunito' },
  { value: 'OpenSans_400Regular', label: 'Open Sans' },
  { value: 'Lato_400Regular', label: 'Lato' },
  { value: 'Raleway_400Regular', label: 'Raleway' },
  { value: 'Inter_400Regular', label: 'Inter' },
  { value: 'Poppins_400Regular', label: 'Poppins' },
  { value: 'Lexend_400Regular', label: 'Lexend' },
  { value: 'AtkinsonHyperlegible_400Regular', label: 'Atkinson Hyperlegible' },
  { value: 'Merriweather_400Regular', label: 'Merriweather' },
];

const TEXT_SIZE_OPTIONS = [
  { value: 18, labelKey: 'settings.textSizeSmall' },
  { value: 24, labelKey: 'settings.textSizeMedium' },
  { value: 32, labelKey: 'settings.textSizeLarge' },
];

const MIN_SCROLL_SPEED = 10;
const MAX_SCROLL_SPEED = 120;
// Whole-number speed steps (stored value is 10x the displayed speed)
const SCROLL_SPEED_STEP = 10;

// Sample paragraph used to preview how the "words per scene" setting groups a
// script. Long and multi-sentence on purpose, so the slider visibly changes the
// grouping across its full range.
const WORDS_PER_GROUP_PREVIEW_SAMPLE =
  "Hey everyone, welcome back to the channel. Today we are talking about how to film better videos with just your phone. The first thing you need is good lighting. Natural light from a window works really well. Try to face the light instead of standing in front of it. Next, let's talk about audio. Bad audio will ruin an otherwise great shot. A cheap clip-on microphone makes a huge difference. Now for framing your shot. Keep your eyes near the top third of the screen. Finally, plan your script before you record. Write down the key points you want to hit. A clear script keeps you confident and concise. That is it for today, thanks for watching.";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const settingsRepository = useSettingsRepository();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const gitCommit = (Constants.expoConfig?.extra?.gitCommit as string | undefined) ?? 'unknown';

  // Hidden build-info reveal: tap the version label 3x to surface the bundle's
  // commit hash (handy for confirming which build / OTA is actually live).
  const [showCommit, setShowCommit] = useState(false);
  const versionTapCountRef = useRef(0);
  const handleVersionPress = () => {
    versionTapCountRef.current += 1;
    if (versionTapCountRef.current >= 3) setShowCommit(true);
  };
  const handleCommitPress = async () => {
    await Clipboard.setStringAsync(gitCommit);
    Alert.alert(t('settings.commitCopied'), gitCommit);
  };

  const [textSize, setTextSize] = useState(
    () => settingsRepository.getTeleprompterSettings().textSize
  );
  const [scrollSpeed, setScrollSpeed] = useState(
    () => settingsRepository.getTeleprompterSettings().scrollSpeed
  );
  const [fontFamily, setFontFamily] = useState<TeleprompterFont>(
    () => settingsRepository.getTeleprompterSettings().fontFamily
  );
  const [wordsPerGroup, setWordsPerGroup] = useState(() =>
    settingsRepository.getAutoSplitWordsPerGroup()
  );
  const [fontPickerOpen, setFontPickerOpen] = useState(false);

  const handleWordsPerGroupChange = (value: number) => {
    const saved = settingsRepository.setAutoSplitWordsPerGroup(value);
    setWordsPerGroup(saved);
  };

  const previewScenes = React.useMemo(
    () => autoSplitScript(WORDS_PER_GROUP_PREVIEW_SAMPLE, { wordsPerGroup }),
    [wordsPerGroup]
  );

  const handleFontChange = (font: TeleprompterFont) => {
    setFontFamily(font);
    settingsRepository.setTeleprompterSettings({ fontFamily: font });
  };

  const handleTextSizeChange = (size: number) => {
    setTextSize(size);
    settingsRepository.setTeleprompterSettings({ textSize: size });
  };

  const handleScrollSpeedChange = (delta: number) => {
    setScrollSpeed((current) => {
      // Snap onto the step grid so legacy fractional values (e.g. 25) normalize
      const stepped =
        Math.round((current + delta * SCROLL_SPEED_STEP) / SCROLL_SPEED_STEP) * SCROLL_SPEED_STEP;
      const nextSpeed = Math.max(MIN_SCROLL_SPEED, Math.min(MAX_SCROLL_SPEED, stepped));
      settingsRepository.setTeleprompterSettings({ scrollSpeed: nextSpeed });
      return nextSpeed;
    });
  };

  const formatScrollSpeed = (speed: number) => {
    const value = speed / 10;
    return value.toFixed(2).replace(/\.?0+$/, '');
  };

  const selectedFontLabel = FONT_OPTIONS.find((option) => option.value === fontFamily)?.label ?? '';

  const handleReportBug = async () => {
    const result = await reportBug({ context: 'Settings' });
    if (result === 'unavailable') {
      Alert.alert(t('bugReport.unavailableTitle'), t('bugReport.unavailableMessage'));
    }
  };

  const handleClearData = () => {
    Alert.alert(t('settings.clearAllDataTitle'), t('settings.clearAllDataMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.clear'),
        style: 'destructive',
        onPress: () => {
          router.replace('/');
          // Delay DB reset to let screens unmount first,
          // avoiding queries against the closed database handle
          setTimeout(() => {
            resetDatabase();
          }, 500);
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-surface-subtle" edges={['top']}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent={Platform.OS === 'android'}
      />

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pb-2 pt-3">
          <IconButton
            icon="arrowLeft"
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            className="-ml-2 mb-3 self-start"
            color="#8A8FA3"
          />
          <Text className="font-display text-[30px] text-ink" style={{ letterSpacing: -1.5 }}>
            {t('common.settings')}
          </Text>
        </View>

        <PremiumSection />

        {/* Teleprompter section */}
        <View className="mt-6">
          <SectionHeader>{t('settings.teleprompter')}</SectionHeader>
          <Section>
            {/* Text size */}
            <View className="min-h-[52px] flex-row items-center justify-between py-2 pl-4 pr-3">
              <Text className="font-sans text-[17px] text-ink">{t('settings.textSize')}</Text>
              <View className="flex-row rounded-[10px] border border-surface-line bg-white p-0.5">
                {TEXT_SIZE_OPTIONS.map((option) => {
                  const isSelected = textSize === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => handleTextSizeChange(option.value)}
                      hitSlop={6}
                      className={`rounded-lg px-3 py-1.5 ${isSelected ? 'bg-primary' : ''}`}
                    >
                      <Text
                        className={`font-sans-medium text-[13px] ${
                          isSelected ? 'text-white' : 'text-ink-secondary'
                        }`}
                      >
                        {t(option.labelKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <RowSeparator />

            {/* Font: value row that expands into an inline picker */}
            <Pressable
              onPress={() => setFontPickerOpen((open) => !open)}
              className="min-h-[48px] flex-row items-center justify-between px-4 active:bg-white"
            >
              <Text className="font-sans text-[17px] text-ink">{t('settings.font')}</Text>
              <View className="flex-row items-center">
                <Text className="mr-1 text-[15px] text-ink-secondary" style={{ fontFamily }}>
                  {selectedFontLabel}
                </Text>
                <Icon
                  name="chevronForward"
                  size={17}
                  color="#98A2B3"
                  style={{ transform: [{ rotate: fontPickerOpen ? '90deg' : '0deg' }] }}
                />
              </View>
            </Pressable>
            {fontPickerOpen &&
              FONT_OPTIONS.map((option) => {
                const isSelected = fontFamily === option.value;
                return (
                  <React.Fragment key={option.value}>
                    <RowSeparator />
                    <Pressable
                      onPress={() => handleFontChange(option.value)}
                      className="min-h-[48px] flex-row items-center justify-between pl-8 pr-4 active:bg-white"
                    >
                      <Text
                        className={`text-[17px] ${isSelected ? 'text-primary' : 'text-ink'}`}
                        style={{ fontFamily: option.value }}
                      >
                        {option.label}
                      </Text>
                      {isSelected && <Icon name="check" size={18} color="#3C3FEF" />}
                    </Pressable>
                  </React.Fragment>
                );
              })}
            <RowSeparator />

            {/* Scroll speed */}
            <View className="min-h-[56px] flex-row items-center justify-between py-2 pl-4 pr-3">
              <Text className="font-sans text-[17px] text-ink">{t('settings.scrollSpeed')}</Text>
              <View className="flex-row items-center">
                <Pressable
                  onPress={() => handleScrollSpeedChange(-1)}
                  hitSlop={6}
                  className="h-9 w-9 items-center justify-center rounded-full border border-surface-line bg-white active:bg-surface-disabled"
                >
                  <Icon name="minus" size={18} color="#4E5265" />
                </Pressable>
                <Text className="w-12 text-center font-mono-semibold text-[15px] text-ink">
                  {formatScrollSpeed(scrollSpeed)}
                </Text>
                <Pressable
                  onPress={() => handleScrollSpeedChange(1)}
                  hitSlop={6}
                  className="h-9 w-9 items-center justify-center rounded-full border border-surface-line bg-white active:bg-surface-disabled"
                >
                  <Icon name="plus" size={18} color="#4E5265" />
                </Pressable>
              </View>
            </View>
          </Section>
        </View>

        {/* Script (auto-split) section */}
        <View className="mt-6">
          <SectionHeader>{t('settings.script')}</SectionHeader>
          <Section>
            <View className="min-h-[48px] flex-row items-center justify-between px-4">
              <Text className="font-sans text-[17px] text-ink">{t('settings.wordsPerGroup')}</Text>
              <Text className="font-mono-semibold text-[15px] text-primary">
                {t('settings.wordsPerGroupValue', { count: wordsPerGroup })}
              </Text>
            </View>
            <View className="px-4 pb-3">
              <Slider
                testID="words-per-group-slider"
                value={wordsPerGroup}
                min={MIN_WORDS_PER_GROUP}
                max={MAX_WORDS_PER_GROUP}
                step={1}
                onChange={handleWordsPerGroupChange}
              />
              <View className="mt-1 flex-row justify-between">
                <Text className="font-mono text-[11px] text-ink-tertiary">
                  {MIN_WORDS_PER_GROUP}
                </Text>
                <Text className="font-mono text-[11px] text-ink-tertiary">
                  {MAX_WORDS_PER_GROUP}
                </Text>
              </View>
            </View>
            <RowSeparator />

            {/* Live preview */}
            <View className="px-4 py-3">
              <Text className="mb-2 font-sans-medium text-[13px] text-ink-tertiary">
                {t('settings.wordsPerGroupPreview')}
              </Text>
              <View style={{ gap: 6 }}>
                {previewScenes.map((scene, index) => (
                  <View
                    key={`preview-${index}`}
                    className="flex-row items-start rounded-lg border border-surface-line bg-white p-2"
                  >
                    <View className="mr-2 h-[18px] min-w-[18px] items-center justify-center rounded bg-primary-tint px-1">
                      <Text className="font-mono-semibold text-[10px] text-primary">
                        {index + 1}
                      </Text>
                    </View>
                    <Text className="flex-1 font-sans text-xs leading-5 text-ink-secondary">
                      {scene}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </Section>
          <SectionFooter>{t('settings.wordsPerGroupHint')}</SectionFooter>
        </View>

        {/* Support */}
        <View className="mt-6">
          <SectionHeader>{t('settings.support')}</SectionHeader>
          <Section>
            <Pressable
              onPress={handleReportBug}
              className="min-h-[48px] flex-row items-center justify-between px-4 active:bg-white"
            >
              <Text className="font-sans text-[17px] text-ink">{t('settings.reportBug')}</Text>
              <Icon name="chevronForward" size={17} color="#98A2B3" />
            </Pressable>
            <RowSeparator />
            <Pressable
              onPress={handleClearData}
              className="min-h-[48px] flex-row items-center justify-between px-4 active:bg-danger-tint"
            >
              <Text className="font-sans text-[17px] text-danger">
                {t('settings.clearAllData')}
              </Text>
              <Icon name="trash" size={18} color="#DC2626" />
            </Pressable>
          </Section>
        </View>

        {/* Version */}
        <View className="mb-10 mt-8">
          <Pressable onPress={handleVersionPress} hitSlop={8} className="py-1.5">
            <Text className="text-center font-sans text-sm text-ink-tertiary">
              {t('common.version', { version: appVersion })}
            </Text>
          </Pressable>
          {showCommit && (
            <Pressable onPress={handleCommitPress} hitSlop={8} className="py-1">
              <Text className="text-center font-mono text-xs text-ink-tertiary">{gitCommit}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
