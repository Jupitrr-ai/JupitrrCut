import type { Clip, Project } from '@shared/types';

export const SAMPLE_VIDEO_URLS = [
  'https://d1ncc9q91dserr.cloudfront.net/teleprompter/1_original.mp4',
  'https://d1ncc9q91dserr.cloudfront.net/teleprompter/2_original.mp4',
  'https://d1ncc9q91dserr.cloudfront.net/teleprompter/3_original.mp4',
  'https://d1ncc9q91dserr.cloudfront.net/teleprompter/4_original.mp4',
];

export const SAMPLE_SCRIPT = `Demo: 5 Productivity Tips /

Hey everyone, today I'm sharing 5 productivity hacks that changed my life. /

First: time blocking. Block your calendar into focused work sessions. /

Second: the two-minute rule. If it takes less than two minutes, do it now. /

Want the full guide? Download my free ebook at jupitrr.com /`;

export const PRODUCT_DEMO_SCRIPT = `Hey. Thanks for downloading this app. I'm one of the co creator Jerome.

My friend Viren and I were so bad at memorizing all the script, and we keep making retakes, so we make this teleprompter app to help us shoot videos easily.

Now you can just simply paste your script here, and we automatically split it into scenes for you. Next, you can record each scene individually. And at last, we will stitch them all together for you.

It's way faster, and it's way more efficient, and it's way easier for your record. So start now.`;

export const PRODUCT_DEMO_CLIPS: Omit<Clip, 'id' | 'projectId'>[] = [
  {
    index: 0,
    text: "Hey. Thanks for downloading this app. I'm one of the co creator Jerome.",
    status: 'done',
    source: 'recorded',
    videoUri: SAMPLE_VIDEO_URLS[0],
    durationSeconds: 3,
  },
  {
    index: 1,
    text: 'My friend Viren and I were so bad at memorizing all the script, and we keep making retakes, so we make this teleprompter app to help us shoot videos easily.',
    status: 'done',
    source: 'recorded',
    videoUri: SAMPLE_VIDEO_URLS[1],
    durationSeconds: 9,
  },
  {
    index: 2,
    text: 'Now you can just simply paste your script here, and we automatically split it into scenes for you. Next, you can record each scene individually. And at last, we will stitch them all together for you.',
    status: 'done',
    source: 'recorded',
    videoUri: SAMPLE_VIDEO_URLS[2],
    durationSeconds: 10,
  },
  {
    index: 3,
    text: "It's way faster, and it's way more efficient, and it's way easier for your record. So start now.",
    status: 'done',
    source: 'recorded',
    videoUri: SAMPLE_VIDEO_URLS[3],
    durationSeconds: 7,
  },
];

export const MOCK_GUEST_ID = 'mock-guest-id';

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'sample-1',
    name: 'Demo:5 Productivity Tips',
    status: 'scripted',
    script: SAMPLE_SCRIPT,
    createdAt: new Date('2026-01-17T00:00:00Z'),
    updatedAt: new Date('2026-01-17T00:00:00Z'),
    source: 'local',
    ownerId: `guest_${MOCK_GUEST_ID}`,
  },
  {
    id: 'sample-2',
    name: 'Demo: Intro Video',
    status: 'done',
    script: PRODUCT_DEMO_SCRIPT,
    createdAt: new Date('2026-01-16T00:00:00Z'),
    updatedAt: new Date('2026-01-16T00:00:00Z'),
    source: 'local',
    ownerId: `guest_${MOCK_GUEST_ID}`,
  },
];

/** Stable names used to identify seeded demo projects (IDs are generated at insert time). */
export const DEMO_PROJECT_NAMES = new Set(MOCK_PROJECTS.map((project) => project.name));
