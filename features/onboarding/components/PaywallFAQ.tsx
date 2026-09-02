import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

const ITEMS = [
  { q: 'paywall.faq.q1', a: 'paywall.faq.a1' },
  { q: 'paywall.faq.q2', a: 'paywall.faq.a2' },
  { q: 'paywall.faq.q3', a: 'paywall.faq.a3' },
  { q: 'paywall.faq.q4', a: 'paywall.faq.a4' },
];

/** One row open at a time — every answer expanded at once reads noisier than the objection
 *  this section exists to defuse. */
export function PaywallFAQ() {
  const { t } = useTranslation();
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <View className="mb-6">
      <Text className="mb-3 text-center font-display text-[20px] text-ink">
        {t('paywall.faq.headline')}
      </Text>
      <View className="overflow-hidden rounded-card bg-surface-subtle">
        {ITEMS.map((item, i) => {
          const isOpen = openKey === item.q;
          return (
            <Pressable
              key={item.q}
              onPress={() => setOpenKey(isOpen ? null : item.q)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              className={`px-5 py-4 ${i > 0 ? 'border-t border-surface-line' : ''}`}
            >
              <View className="flex-row items-center justify-between" style={{ gap: 10 }}>
                <Text className="flex-1 text-[15px] font-heading text-ink">{t(item.q)}</Text>
                <Text className="text-base text-ink-tertiary">
                  {isOpen ? t('icons.arrowUp') : t('icons.arrowDown')}
                </Text>
              </View>
              {isOpen && (
                <Text className="mt-2 text-sm leading-5 text-ink-secondary">{t(item.a)}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
