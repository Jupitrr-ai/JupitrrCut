import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

/** Free vs Pro matrix. `free: true` means the row is already available without paying —
 *  the contrast is what does the selling, so at least one row must stay true or the table
 *  reads as a wall of locks and loses credibility. */
const ROWS: { key: string; free: boolean }[] = [
  { key: 'paywall.compare.row1', free: true },
  { key: 'paywall.compare.row2', free: false },
  { key: 'paywall.compare.row3', free: false },
  { key: 'paywall.compare.row4', free: false },
  { key: 'paywall.compare.row5', free: false },
  { key: 'paywall.compare.row6', free: false },
  { key: 'paywall.compare.row7', free: false },
  { key: 'paywall.compare.row8', free: false },
];

/** The Pro badge, shared so the header and the comparison table can't drift apart. */
export function ProPill() {
  const { t } = useTranslation();

  return (
    <View className="rounded-md bg-primary px-2 py-0.5">
      <Text className="text-xs font-bold text-white">{t('paywall.compare.pro')}</Text>
    </View>
  );
}

export function PaywallComparison() {
  const { t } = useTranslation();

  return (
    <View className="mb-6">
      {/* Header: the Pro column carries a filled chip so the eye lands on the paid side. */}
      <View className="mb-1 h-8 flex flex-row items-center justify-center">
        <Text className="text-center font-display text-[22px] text-ink">
          {t('paywall.compare.headline')}
        </Text>
        <View className="ml-2 items-center">
          <ProPill />
        </View>
      </View>

      <View className="mb-1 flex-row items-center"></View>

      <View className="overflow-hidden rounded-card bg-surface-subtle">
        {ROWS.map((row, i) => (
          <View
            key={row.key}
            className={`flex-row items-center px-5 py-3 ${
              i > 0 ? 'border-t border-surface-line' : ''
            }`}
          >
            <Text className="flex-1  text-[15px] leading-5 text-ink">{t(row.key)}</Text>
            <View className="items-center">
              <Text className="text-base text-green-600">{t('icons.checkmark')}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}
