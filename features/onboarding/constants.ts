export interface OnboardingStep {
  key: string;
  titleKey: string;
  descriptionKey: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: 'writeScript',
    titleKey: 'onboarding.step1.title',
    descriptionKey: 'onboarding.step1.description',
  },
  {
    key: 'sceneRecording',
    titleKey: 'onboarding.step2.title',
    descriptionKey: 'onboarding.step2.description',
  },
  {
    key: 'autoStitch',
    titleKey: 'onboarding.step3.title',
    descriptionKey: 'onboarding.step3.description',
  },
  /* 'brollPublish' is intentionally omitted: subtitles and B-roll happen on Jupitrr after a
     handoff, not in this app, so the page is hidden until that lands natively. Its copy,
     illustration and translations are all still in place — re-add this entry to restore it.
  {
    key: 'brollPublish',
    titleKey: 'onboarding.step4.title',
    descriptionKey: 'onboarding.step4.description',
  },
  */
];

export const SETTINGS_KEY_ONBOARDING_COMPLETED = 'onboarding.completed';
