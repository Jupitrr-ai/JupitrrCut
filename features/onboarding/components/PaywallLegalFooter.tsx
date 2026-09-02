import { useTranslation } from 'react-i18next';
import { Linking, Pressable, Text, View } from 'react-native';

const TERMS_URL = 'https://jupitrr.com/terms';
const PRIVACY_URL = 'https://jupitrr.com/privacy';

interface Props {
  onRestore: () => void;
  restoring: boolean;
}

/** Restore + terms + privacy + renewal disclosure. App Review requires all four on any
 *  screen that can start a subscription, so every paywall in the funnel carries this. */
export function PaywallLegalFooter({ onRestore, restoring }: Props) {
  const { t } = useTranslation();

  return (
    <>
      <View className="flex-row items-center justify-center" style={{ gap: 12 }}>
        <Pressable onPress={onRestore} disabled={restoring}>
          <Text className="text-xs text-ink-tertiary">
            {restoring ? t('paywall.restoring') : t('paywall.restore')}
          </Text>
        </Pressable>
        <Text className="text-xs text-gray-300">{t('icons.divider')}</Text>
        <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
          <Text className="text-xs text-ink-tertiary">{t('paywall.terms')}</Text>
        </Pressable>
        <Text className="text-xs text-gray-300">{t('icons.divider')}</Text>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text className="text-xs text-ink-tertiary">{t('paywall.privacy')}</Text>
        </Pressable>
      </View>
      <Text className="text-center text-[10px] leading-4 text-gray-400">
        {t('paywall.legalNote')}
      </Text>
    </>
  );
}
