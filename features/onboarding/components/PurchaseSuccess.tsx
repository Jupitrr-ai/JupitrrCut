import type { PurchaseSuccess as PurchaseSuccessDetails } from '@lib/hooks/usePurchases';
import { trackEvent } from '@lib/services/analytics';
import { Button } from '@shared/components/ui/Button';
import { Icon } from '@shared/components/ui/Icon';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, findNodeHandle, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DottedBackground } from './DottedBackground';

interface Props {
  result: PurchaseSuccessDetails;
  source: 'onboarding' | 'gate' | 'settings';
  onContinue: () => void;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

/** Shared confirmation for purchases and restores. It is deliberately a calm, explicit
 * screen instead of another popup stacked over StoreKit's own modal. */
export function PurchaseSuccess({ result, source, onContinue }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const headingRef = useRef<Text>(null);
  const isTrial = result.periodType === 'trial';
  const expirationDate = formatDate(result.expirationDate);
  const planLabel = result.plan ? t(`paywall.${result.plan}Label`) : t('purchaseSuccess.premium');
  const headline =
    result.method === 'restore'
      ? t('purchaseSuccess.restoredHeadline')
      : isTrial
        ? t('purchaseSuccess.trialHeadline')
        : t('purchaseSuccess.premiumHeadline');

  const detail = isTrial
    ? expirationDate
      ? t('purchaseSuccess.trialDetail', { date: expirationDate })
      : t('purchaseSuccess.trialDetailBare')
    : expirationDate
      ? result.willRenew
        ? t('purchaseSuccess.renewsDetail', { plan: planLabel, date: expirationDate })
        : t('purchaseSuccess.accessDetail', { plan: planLabel, date: expirationDate })
      : t('purchaseSuccess.activeDetail', { plan: planLabel });

  useEffect(() => {
    trackEvent('purchase_success_viewed', {
      source,
      method: result.method,
      plan: result.plan,
      period_type: result.periodType,
    });
    const node = findNodeHandle(headingRef.current);
    if (node) AccessibilityInfo.setAccessibilityFocus(node);
  }, [result.method, result.periodType, result.plan, source]);

  const handleContinue = () => {
    trackEvent('purchase_success_continued', { source, method: result.method });
    onContinue();
  };

  return (
    <DottedBackground className="flex-1">
      <View className="flex-1" style={{ paddingTop: insets.top + 24 }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 24,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            className="mb-8 h-28 w-28 items-center justify-center rounded-[32px] border border-success-line bg-success-tint"
          >
            <Icon name="checkCircle" size={66} color="#1E9E6A" />
          </View>

          <Text
            ref={headingRef}
            accessibilityRole="header"
            className="text-center font-display text-[34px] leading-[40px] text-ink"
          >
            {headline}
          </Text>
          <Text className="mt-3 max-w-[320px] text-center font-sans text-[17px] leading-6 text-ink-secondary">
            {detail}
          </Text>

          <View className="mt-8 w-full max-w-[360px] rounded-3xl border border-surface-line bg-white px-5 py-4">
            <View className="flex-row items-center" style={{ gap: 12 }}>
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                className="h-10 w-10 items-center justify-center rounded-xl bg-primary-tint"
              >
                <Icon name="sparkles" size={21} color="#3C3FEF" />
              </View>
              <View className="flex-1">
                <Text className="font-heading text-[16px] text-ink">
                  {t('purchaseSuccess.unlockedTitle')}
                </Text>
                <Text className="mt-0.5 font-sans text-[14px] leading-5 text-ink-secondary">
                  {t('purchaseSuccess.unlockedDetail')}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View className="px-6" style={{ paddingBottom: insets.bottom + 16 }}>
          <Button
            label={
              source === 'onboarding'
                ? t('purchaseSuccess.startCreating')
                : source === 'settings'
                  ? t('common.done')
                  : t('purchaseSuccess.continue')
            }
            size="lg"
            onPress={handleContinue}
          />
        </View>
      </View>
    </DottedBackground>
  );
}
