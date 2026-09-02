import { PurchaseSuccess } from '@features/onboarding/components/PurchaseSuccess';
import type { PurchaseSuccess as PurchaseSuccessDetails } from '@lib/hooks/usePurchases';
import { useSubscriptionStatus } from '@lib/hooks/useSubscriptionStatus';
import { trackEvent } from '@lib/services/analytics';
import {
  getActivePremiumEntitlement,
  restorePurchases,
  showManageSubscriptions,
} from '@lib/services/purchases';
import { Button } from '@shared/components/ui/Button';
import { Icon } from '@shared/components/ui/Icon';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, Text, View } from 'react-native';

function formatDate(value: string | number | null): string | null {
  if (!value) return null;
  const numeric = Number(value);
  const date =
    String(value).trim() !== '' && Number.isFinite(numeric)
      ? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
      : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function PremiumSection() {
  const { t } = useTranslation();
  const router = useRouter();
  const subscription = useSubscriptionStatus();
  const [restoring, setRestoring] = useState(false);
  const [success, setSuccess] = useState<PurchaseSuccessDetails | null>(null);

  useEffect(() => {
    if (subscription.state !== 'loading') {
      trackEvent('subscription_section_viewed', { state: subscription.state });
    }
  }, [subscription.state]);

  const handleUpgrade = () => {
    trackEvent('subscription_upgrade_tapped');
    router.push('/paywall');
  };

  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const info = await restorePurchases();
      const entitlement = getActivePremiumEntitlement(info);
      if (!entitlement) {
        trackEvent('subscription_restore_empty');
        Alert.alert(
          t('settings.subscription.restoreEmptyTitle'),
          t('settings.subscription.restoreEmptyMessage')
        );
        return;
      }
      const result: PurchaseSuccessDetails = {
        method: 'restore',
        periodType: entitlement.periodType.toLowerCase() as PurchaseSuccessDetails['periodType'],
        expirationDate: entitlement.expirationDate,
        willRenew: entitlement.willRenew,
        productIdentifier: entitlement.productIdentifier,
      };
      trackEvent('subscription_restore_completed', { period_type: result.periodType });
      setSuccess(result);
      await subscription.refresh();
    } catch {
      trackEvent('subscription_restore_failed');
      Alert.alert(
        t('settings.subscription.restoreFailedTitle'),
        t('settings.subscription.restoreFailedMessage')
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleManage = async () => {
    trackEvent('subscription_manage_tapped');
    try {
      await showManageSubscriptions();
      trackEvent('subscription_manage_opened', { method: 'native' });
      await subscription.refresh();
    } catch {
      const url = subscription.native?.managementURL;
      if (url && (await Linking.canOpenURL(url).catch(() => false))) {
        await Linking.openURL(url);
        trackEvent('subscription_manage_opened', { method: 'url' });
        return;
      }
      trackEvent('subscription_manage_failed');
      Alert.alert(
        t('settings.subscription.manageUnavailableTitle'),
        t('settings.subscription.manageUnavailableMessage')
      );
    }
  };

  const nativeDate = formatDate(subscription.native?.expirationDate ?? null);
  const nativePlan = subscription.native?.plan
    ? t(`paywall.${subscription.native.plan}Label`)
    : t('settings.subscription.premium');
  const nativeDetail = subscription.native
    ? subscription.native.periodType === 'trial'
      ? nativeDate
        ? t('settings.subscription.trialEnds', { date: nativeDate })
        : t('settings.subscription.trialActive')
      : nativeDate
        ? subscription.native.willRenew
          ? t('settings.subscription.renews', { plan: nativePlan, date: nativeDate })
          : t('settings.subscription.accessUntil', { plan: nativePlan, date: nativeDate })
        : t('settings.subscription.lifetime', { plan: nativePlan })
    : null;
  const activePlanTitle = t('settings.subscription.premium');

  return (
    <View className="mt-6">
      <Text className="mb-1 ml-4 font-heading text-[16px] text-ink">
        {t('settings.subscription.title')}
      </Text>

      <View className="mx-4 overflow-hidden rounded-3xl border border-surface-line bg-white p-5">
        {subscription.state === 'loading' ? (
          <View className="min-h-[116px] items-center justify-center">
            <ActivityIndicator color="#3C3FEF" />
            <Text className="mt-3 font-sans text-[14px] text-ink-tertiary">
              {t('settings.subscription.checking')}
            </Text>
          </View>
        ) : subscription.state === 'active' ? (
          <>
            <View className="flex-row items-start gap-3">
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                className="h-12 w-12 items-center justify-center rounded-2xl bg-success-tint"
              >
                <Icon name="checkCircle" size={29} color="#1E9E6A" />
              </View>
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="font-heading text-[19px] text-ink">{activePlanTitle}</Text>
                  <View className="rounded-full bg-primary-tint px-2 py-1">
                    <Text className="font-heading text-[10px] tracking-[0.5px] text-primary">
                      {t('settings.subscription.activeBadge')}
                    </Text>
                  </View>
                </View>
                {!!nativeDetail && (
                  <Text className="mt-1 font-sans text-[14px] leading-5 text-ink-secondary">
                    {nativeDetail}
                  </Text>
                )}
              </View>
            </View>

            <Button
              label={t('settings.subscription.manage')}
              variant="secondary"
              className="mt-5"
              onPress={handleManage}
            />
          </>
        ) : subscription.state === 'inactive' ? (
          <>
            <View className="flex-row items-start gap-3">
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                className="h-12 w-12 items-center justify-center rounded-2xl bg-primary-tint"
              >
                <Icon name="sparkles" size={25} color="#3C3FEF" />
              </View>
              <View className="flex-1">
                <Text className="font-heading text-[19px] text-ink">
                  {t('settings.subscription.freePlan')}
                </Text>
                <Text className="mt-1 font-sans text-[14px] leading-5 text-ink-secondary">
                  {t('settings.subscription.freeDescription')}
                </Text>
              </View>
            </View>
            <Button
              label={t('settings.subscription.upgrade')}
              className="mt-5"
              onPress={handleUpgrade}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: restoring, disabled: restoring }}
              disabled={restoring}
              onPress={handleRestore}
              className="mt-2 min-h-[44px] items-center justify-center active:opacity-60"
            >
              <Text className="font-sans-medium text-[15px] text-primary">
                {restoring
                  ? t('settings.subscription.restoring')
                  : t('settings.subscription.restore')}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
            <View className="flex-row items-start gap-3">
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                className="h-12 w-12 items-center justify-center rounded-2xl bg-surface-subtle"
              >
                <Icon name="refresh" size={24} color="#4E5265" />
              </View>
              <View className="flex-1">
                <Text className="font-heading text-[19px] text-ink">
                  {t('settings.subscription.unavailableTitle')}
                </Text>
                <Text className="mt-1 font-sans text-[14px] leading-5 text-ink-secondary">
                  {t('settings.subscription.unavailableMessage')}
                </Text>
              </View>
            </View>
            <Button
              label={t('common.refresh')}
              variant="secondary"
              loading={subscription.refreshing}
              className="mt-5"
              onPress={subscription.refresh}
            />
          </>
        )}
      </View>

      <Modal visible={!!success} animationType="fade" presentationStyle="fullScreen">
        {success && (
          <PurchaseSuccess result={success} source="settings" onContinue={() => setSuccess(null)} />
        )}
      </Modal>
    </View>
  );
}
