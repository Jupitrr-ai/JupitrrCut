import {
  DEFAULT_WORDS_PER_GROUP,
  MAX_WORDS_PER_GROUP,
  MIN_WORDS_PER_GROUP,
} from '@shared/utils/auto-split';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { SettingsRepository as ISettingsRepository, TeleprompterSettings } from './types';

const DEFAULT_SETTINGS: TeleprompterSettings = {
  textSize: 24,
  scrollSpeed: 25,
  fontFamily: 'VarelaRound_400Regular',
  preparationDelaySeconds: 3,
};

const AUTO_SPLIT_WORDS_PER_GROUP_KEY = 'autoSplit.wordsPerGroup';

function clampWordsPerGroup(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WORDS_PER_GROUP;
  return Math.max(MIN_WORDS_PER_GROUP, Math.min(MAX_WORDS_PER_GROUP, Math.round(value)));
}

export function createSettingsRepository(db: SQLiteDatabase): ISettingsRepository {
  return {
    get<T>(key: string, defaultValue: T): T {
      const row = db.getFirstSync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [
        key,
      ]);
      if (!row) return defaultValue;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return defaultValue;
      }
    },

    set<T>(key: string, value: T): void {
      const serialized = JSON.stringify(value);
      db.runSync(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [key, serialized]
      );
    },

    delete(key: string): boolean {
      const result = db.runSync('DELETE FROM settings WHERE key = ?', [key]);
      return result.changes > 0;
    },

    getTeleprompterSettings(): TeleprompterSettings {
      return {
        textSize: this.get('teleprompter.textSize', DEFAULT_SETTINGS.textSize),
        scrollSpeed: this.get('teleprompter.scrollSpeed', DEFAULT_SETTINGS.scrollSpeed),
        fontFamily: this.get('teleprompter.fontFamily', DEFAULT_SETTINGS.fontFamily),
        preparationDelaySeconds: this.get(
          'teleprompter.preparationDelaySeconds',
          DEFAULT_SETTINGS.preparationDelaySeconds
        ),
      };
    },

    setTeleprompterSettings(settings: Partial<TeleprompterSettings>): TeleprompterSettings {
      const current = this.getTeleprompterSettings();
      const updated = { ...current, ...settings };

      if (settings.textSize !== undefined) {
        this.set('teleprompter.textSize', settings.textSize);
      }
      if (settings.scrollSpeed !== undefined) {
        this.set('teleprompter.scrollSpeed', settings.scrollSpeed);
      }
      if (settings.fontFamily !== undefined) {
        this.set('teleprompter.fontFamily', settings.fontFamily);
      }
      if (settings.preparationDelaySeconds !== undefined) {
        this.set('teleprompter.preparationDelaySeconds', settings.preparationDelaySeconds);
      }

      return updated;
    },

    getAutoSplitWordsPerGroup(): number {
      return clampWordsPerGroup(
        this.get<number>(AUTO_SPLIT_WORDS_PER_GROUP_KEY, DEFAULT_WORDS_PER_GROUP)
      );
    },

    setAutoSplitWordsPerGroup(value: number): number {
      const clamped = clampWordsPerGroup(value);
      this.set(AUTO_SPLIT_WORDS_PER_GROUP_KEY, clamped);
      return clamped;
    },
  };
}
