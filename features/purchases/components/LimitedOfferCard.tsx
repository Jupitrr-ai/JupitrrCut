import { useSettingsRepository } from '@lib/providers/DatabaseProvider';
import { trackEvent } from '@lib/services/analytics';
import { getLimitedOfferRemainingMs } from '@lib/services/freemium';
import { getCombinedEntitlementStatus } from '@lib/services/purchases';
import { Icon } from '@shared/components/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

function formatCountdown(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return {
    hours: String(hours).padStart(2, '0'),
    minutes: String(minutes).padStart(2, '0'),
    seconds: String(seconds).padStart(2, '0'),
  };
}

/** A real, persisted countdown: it appears only for confirmed free users and disappears
 * permanently 24 hours after both paywall offers were declined. */
export function LimitedOfferCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const settingsRepo = useSettingsRepository();
  const [remainingMs, setRemainingMs] = useState(0);
  const [eligible, setEligible] = useState(false);
  const impressionTrackedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      let timer: ReturnType<typeof setInterval> | null = null;
      const updateRemaining = () => {
        const remaining = getLimitedOfferRemainingMs(settingsRepo);
        setRemainingMs(remaining);
        if (remaining <= 0) setEligible(false);
      };

      getCombinedEntitlementStatus().then((status) => {
        if (cancelled) return;
        const remaining = getLimitedOfferRemainingMs(settingsRepo);
        setRemainingMs(remaining);
        setEligible(status === 'inactive' && remaining > 0);
        if (status === 'inactive' && remaining > 0) {
          timer = setInterval(updateRemaining, 1000);
        }
      });

      return () => {
        cancelled = true;
        if (timer) clearInterval(timer);
      };
    }, [settingsRepo])
  );

  useEffect(() => {
    if (!eligible || impressionTrackedRef.current) return;
    impressionTrackedRef.current = true;
    trackEvent('limited_offer_card_viewed', { remaining_seconds: Math.ceil(remainingMs / 1000) });
  }, [eligible, remainingMs]);

  if (!eligible || remainingMs <= 0) return null;

  const countdown = formatCountdown(remainingMs);
  const accessibilityLabel = t('projects.limitedOffer.accessibilityLabel', {
    hours: countdown.hours,
    minutes: countdown.minutes,
    seconds: countdown.seconds,
  });

  const handlePress = () => {
    trackEvent('limited_offer_card_tapped', {
      remaining_seconds: Math.ceil(remainingMs / 1000),
    });
    router.push('/paywall');
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      className="mx-4 mb-3 overflow-hidden rounded-3xl border border-[#F1D7B5] active:opacity-80"
    >
      <LinearGradient
        colors={['#FFF8ED', '#F3F1FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        className="p-4"
      >
        <View className="flex-row items-start gap-3">
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            className="h-11 w-11 items-center justify-center rounded-2xl bg-white/80"
          >
            <Icon name="clock" size={23} color="#D97706" />
          </View>

          <View className="min-w-0 flex-1">
            <View className="self-start rounded-full bg-[#FEF3C7] px-2.5 py-1">
              <Text className="font-heading text-[10px] tracking-[0.6px] text-[#92400E]">
                {t('projects.limitedOffer.badge')}
              </Text>
            </View>
            <Text className="mt-2 font-heading text-[19px] leading-6 text-ink">
              {t('projects.limitedOffer.title')}
            </Text>
            <Text className="mt-1 font-sans text-[14px] leading-5 text-ink-secondary">
              {t('projects.limitedOffer.description')}
            </Text>

            <View className="mt-3 flex-row flex-wrap items-center justify-between gap-y-2">
              <View className="flex-row items-center gap-1">
                {[
                  ['hours', countdown.hours],
                  ['minutes', countdown.minutes],
                  ['seconds', countdown.seconds],
                ].map(([unit, value], index) => (
                  <View key={unit} className="flex-row items-center">
                    {index > 0 && (
                      <Text className="mx-1 font-mono-semibold text-[14px] text-ink-tertiary">
                        :
                      </Text>
                    )}
                    <View className="min-w-[34px] rounded-lg bg-white/90 px-2 py-1.5">
                      <Text className="text-center font-mono-semibold text-[14px] text-ink">
                        {value}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                className="flex-row items-center gap-1"
              >
                <Text className="font-heading text-[14px] text-primary">
                  {t('projects.limitedOffer.cta')}
                </Text>
                <Icon name="arrowRight" size={15} color="#3C3FEF" />
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
