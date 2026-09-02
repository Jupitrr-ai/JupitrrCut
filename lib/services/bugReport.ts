import { SUPPORT_EMAIL } from '@lib/constants/jupitrr';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

export interface BugReportOptions {
  /** Optional local file:// URI of a video to attach (e.g. the just-exported clip). */
  videoUri?: string;
  /** Short label describing where the report was opened from (e.g. "After export"). */
  context?: string;
}

export type BugReportResult = 'sent' | 'cancelled' | 'unavailable';

/**
 * Builds a diagnostics block appended to every report so we can reproduce issues
 * (app version, device model, OS) without asking the user.
 */
function buildDiagnostics(context?: string): string {
  const appVersion = Constants.expoConfig?.version ?? 'unknown';
  const buildNumber =
    Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : Constants.expoConfig?.android?.versionCode;
  const lines = [
    '',
    '',
    '--- Please describe what went wrong above this line ---',
    `App version: ${appVersion}${buildNumber ? ` (${buildNumber})` : ''}`,
    `Device: ${Device.modelName ?? 'unknown'} (${Device.brand ?? Platform.OS})`,
    `OS: ${Platform.OS} ${Device.osVersion ?? ''}`.trim(),
    context ? `Context: ${context}` : undefined,
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Opens the user's mail composer pre-filled with diagnostics and (optionally) the
 * exported video attached. Falls back to a `mailto:` link when no native mail UI is
 * available (e.g. simulator or no mail account configured).
 */
export async function reportBug(options: BugReportOptions = {}): Promise<BugReportResult> {
  const subject = 'Jupitrr Teleprompter — Bug report';
  const body = buildDiagnostics(options.context);
  const mailComposer = await import('expo-mail-composer').catch(() => null);

  const isAvailable = await mailComposer?.isAvailableAsync().catch(() => false);
  if (mailComposer && isAvailable) {
    const attachments = options.videoUri ? [options.videoUri] : undefined;
    const { status } = await mailComposer.composeAsync({
      recipients: [SUPPORT_EMAIL],
      subject,
      body,
      attachments,
    });
    return status === mailComposer.MailComposerStatus.SENT ? 'sent' : 'cancelled';
  }

  // Fallback: mailto cannot attach files, so note the video path in the body instead.
  const fallbackBody = options.videoUri
    ? `${body}\n(Video could not be auto-attached — reply with the saved clip.)`
    : body;
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    fallbackBody
  )}`;
  const canOpen = await Linking.canOpenURL(url).catch(() => false);
  if (!canOpen) return 'unavailable';
  await Linking.openURL(url);
  return 'sent';
}
