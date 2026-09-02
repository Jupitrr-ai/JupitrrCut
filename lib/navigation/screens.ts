/**
 * Centralized screen configuration for navigation.
 * All screen names and i18n title keys in one place.
 */

export const screens = {
  onboarding: {
    index: {
      name: 'index',
      titleKey: 'onboarding.step1.title',
    },
  },
  main: {
    index: {
      name: 'index',
      titleKey: 'projects.title',
    },
    settings: {
      name: 'settings',
      titleKey: 'common.settings',
    },
    videoStitches: {
      name: 'video-stitches',
      titleKey: 'videoStitches.title',
    },
    ideas: {
      name: 'ideas',
      titleKey: 'ideas.title',
    },
    videoStitchesStitching: {
      name: 'video-stitches-stitching',
      titleKey: 'stitching.title',
    },
    videoStitchesComplete: {
      name: 'video-stitches-complete',
      titleKey: 'complete.title',
    },
  },
  project: {
    script: {
      name: 'script',
      titleKey: 'scriptEditor.title',
    },
    clips: {
      name: 'clips',
      titleKey: 'clips.title',
    },
    record: {
      name: 'record',
      titleKey: 'recording.title',
    },
    review: {
      name: 'review',
      titleKey: 'review.title',
    },
    stitching: {
      name: 'stitching',
      titleKey: 'stitching.title',
    },
    complete: {
      name: 'complete',
      titleKey: 'complete.title',
    },
  },
};
