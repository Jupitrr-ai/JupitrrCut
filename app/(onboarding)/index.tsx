import { DotIndicator } from '@features/onboarding/components/DotIndicator';
import { DottedBackground } from '@features/onboarding/components/DottedBackground';
import { OnboardingCapabilities } from '@features/onboarding/components/OnboardingCapabilities';
import { OnboardingConfidence } from '@features/onboarding/components/OnboardingConfidence';
import { OnboardingPage } from '@features/onboarding/components/OnboardingPage';
import { OnboardingRating } from '@features/onboarding/components/OnboardingRating';
import { PaywallFunnel } from '@features/onboarding/components/PaywallFunnel';
import {
  ONBOARDING_STEPS,
  SETTINGS_KEY_ONBOARDING_COMPLETED,
} from '@features/onboarding/constants';
import {
  useAuthRepository,
  useClipRepository,
  useProjectRepository,
  useSettingsRepository,
} from '@lib/providers/DatabaseProvider';
import { trackEvent } from '@lib/services/analytics';
import {
  markAppReviewDeclined,
  markAppReviewPrompted,
  requestStoreReview,
} from '@lib/services/appReview';
import { seedMockProjectsIfNeeded } from '@lib/services/seedMockProjects';
import { Button } from '@shared/components/ui/Button';
import { invalidateProjectsCache } from '@stores/useProjectStore';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Dimensions, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SCREEN_WIDTH = Dimensions.get('window').width;

/** Everything before the offer is one pager, so Skip, the dots and the CTA stay put while
 *  the content slides underneath. The funnel has exactly one entrance — the CTA on the last
 *  slide — so it is always reached by a deliberate tap rather than as a side effect. The
 *  offers themselves (primary → downsell → primer) are `PaywallFunnel`'s state, not this
 *  screen's, because the same sequence is replayed later by the freemium gate. */
type Phase = 'pages' | 'funnel';

type Slide =
  | { kind: 'step'; key: string; step: (typeof ONBOARDING_STEPS)[number] }
  | { kind: 'confidence'; key: string }
  | { kind: 'capabilities'; key: string }
  | { kind: 'rating'; key: string };

const SLIDES: Slide[] = [
  ...ONBOARDING_STEPS.map((step) => ({ kind: 'step' as const, key: step.key, step })),
  { kind: 'confidence', key: 'confidence' },
  { kind: 'capabilities', key: 'capabilities' },
  { kind: 'rating', key: 'rating' },
];

/** The rating ask is last so its hold gates the one exit, not a swipe the user can outrun. */
const RATING_INDEX = SLIDES.length - 1;
const RATING_HOLD_SECONDS = 3;

/** Where the pager opens. Seeds `currentIndex` too — everything keyed off the visible page
 *  (dots, step tracking, per-slide entrance animations) is wrong if the two disagree. */
const INITIAL_INDEX = 0;

export default function OnboardingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settingsRepo = useSettingsRepository();
  const projectRepo = useProjectRepository();
  const clipRepo = useClipRepository();
  const authRepo = useAuthRepository();
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(INITIAL_INDEX);
  const [phase, setPhase] = useState<Phase>('pages');

  const [ratingHold, setRatingHold] = useState(RATING_HOLD_SECONDS);
  /* Whether the native prompt has been fired — drives the second tap on the rating slide. */
  const [ratingPrompted, setRatingPrompted] = useState(false);

  const isLastStep = currentIndex === SLIDES.length - 1;
  const onRating = currentIndex === RATING_INDEX;
  const ctaLocked = onRating && ratingHold > 0;

  useEffect(() => {
    trackEvent('onboarding_started');
  }, []);

  useEffect(() => {
    if (phase !== 'pages') return;
    const slide = SLIDES[currentIndex];
    if (slide) trackEvent('onboarding_step_viewed', { step: slide.key, index: currentIndex });
  }, [currentIndex, phase]);

  /* Only counts down while the rating slide is the visible one — otherwise it would run
     during the earlier slides and be spent before anyone reaches it. */
  useEffect(() => {
    if (!onRating || ratingHold <= 0) return;
    const timer = setTimeout(() => setRatingHold((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [onRating, ratingHold]);

  const handleComplete = useCallback(() => {
    settingsRepo.set(SETTINGS_KEY_ONBOARDING_COMPLETED, true);
    seedMockProjectsIfNeeded(projectRepo, clipRepo, authRepo);
    invalidateProjectsCache();
    trackEvent('onboarding_completed');
    router.replace('/(main)');
  }, [settingsRepo, projectRepo, clipRepo, authRepo, router]);

  const handleNext = useCallback(() => {
    if (!isLastStep) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      return;
    }

    /* Two taps on the rating slide. iOS gives no callback when its prompt is dismissed, so
       the second tap is what stands in for "done" — the first fires the prompt and leaves the
       user on this screen, rather than yanking the paywall up underneath an open sheet. */
    if (onRating && !ratingPrompted) {
      setRatingPrompted(true);
      markAppReviewPrompted(settingsRepo);
      void requestStoreReview('onboarding');
      return;
    }

    setPhase('funnel');
  }, [currentIndex, isLastStep, onRating, ratingPrompted, settingsRepo]);

  /* Skips the rating ask itself — straight past it into the funnel, without spending an
     iOS prompt on someone who has said no. Persisted so the app knows to give this user
     one more chance once they've actually finished a video (see complete.tsx). */
  const handleSkipRating = useCallback(() => {
    trackEvent('onboarding_rating_skipped');
    markAppReviewDeclined(settingsRepo);
    setPhase('funnel');
  }, [settingsRepo]);

  const onMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  }, []);

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: SCREEN_WIDTH,
      offset: SCREEN_WIDTH * index,
      index,
    }),
    []
  );

  if (phase === 'funnel') {
    /* Declining both offers still finishes onboarding — the user is let into the app on the
       free run, and the funnel is replayed by the gate once that run is spent. Trapping them
       here would only cost the install. */
    return (
      <PaywallFunnel
        source="onboarding"
        onPurchased={handleComplete}
        onDismissed={handleComplete}
      />
    );
  }

  return (
    <DottedBackground className="flex-1">
      {/* No Skip: the tour is short and every slide is walked deliberately via the CTA. The
          only exit past the offer is the paywall's own dismiss. */}

      {/* Full-screen pages */}
      <FlatList
        ref={flatListRef}
        style={{ flex: 1 }}
        data={SLIDES}
        initialScrollIndex={INITIAL_INDEX}
        /* Slides that animate on entrance need to know they are the visible one — the pager
           renders neighbours ahead of time, so mounting is not arrival. extraData re-renders
           the cells when that changes; without it the rows keep the index they were built with. */
        extraData={currentIndex}
        renderItem={({ item, index }) => {
          switch (item.kind) {
            case 'confidence':
              return <OnboardingConfidence width={SCREEN_WIDTH} active={currentIndex === index} />;
            case 'capabilities':
              return (
                <OnboardingCapabilities width={SCREEN_WIDTH} active={currentIndex === index} />
              );
            case 'rating':
              return <OnboardingRating width={SCREEN_WIDTH} />;
            default:
              return <OnboardingPage step={item.step} width={SCREEN_WIDTH} />;
          }
        }}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        getItemLayout={getItemLayout}
        keyExtractor={(item) => item.key}
      />

      {/* Pinned to the bottom edge: the CTA sits in the same spot on every page, so it stays
          a fixed target while the pages change underneath it. */}
      <View className="px-6 pt-5" style={{ paddingBottom: insets.bottom + 16 }}>
        <View className="mb-5 items-center">
          <DotIndicator total={SLIDES.length} current={currentIndex} />
        </View>
        <Button
          label={
            ctaLocked
              ? t('onboarding.rating.ctaWaiting', { seconds: ratingHold })
              : onRating && !ratingPrompted
                ? t('onboarding.rating.ctaRate')
                : isLastStep
                  ? t('onboarding.getStarted')
                  : t('onboarding.next')
          }
          size="lg"
          disabled={ctaLocked}
          onPress={handleNext}
        />

        {/* The quieter way past the rating ask, for users who don't want to be prompted at
            all. Hidden once the prompt has fired, and gated by the same hold as the CTA. */}
        {onRating && !ratingPrompted && !ctaLocked && (
          <Pressable
            onPress={handleSkipRating}
            accessibilityRole="button"
            className="mt-3 min-h-[44px] items-center justify-center"
          >
            <Text className="font-sans-medium text-[15px] text-ink-tertiary">
              {t('onboarding.skip')}
            </Text>
          </Pressable>
        )}
      </View>
    </DottedBackground>
  );
}
