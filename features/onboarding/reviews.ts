/* eslint-disable @typescript-eslint/no-require-imports -- static assets */
const AVATARS = {
  sanket: require('../../assets/images/reviewers/sanket.png'),
  sean: require('../../assets/images/reviewers/sean.png'),
  buck: require('../../assets/images/reviewers/buck.png'),
  bryan: require('../../assets/images/reviewers/bryan.png'),
  jordan: require('../../assets/images/reviewers/jordan.png'),
  novie: require('../../assets/images/reviewers/novie.png'),
  auntieso: require('../../assets/images/reviewers/auntieso.png'),
};
/* eslint-enable @typescript-eslint/no-require-imports */

export interface Review {
  nameKey: string;
  roleKey: string;
  quoteKey: string;
  avatar: number;
}

/**
 * Real, publicly-published Jupitrr customers. Name, role, quote and face are one record and
 * must never be mixed — swapping a face onto another person's words misattributes a real
 * testimonial.
 *
 * Two sets so a user who reads the rating slide does not meet the same three faces again on
 * the paywall. Both live here because the sets previously drifted: the rating screen was
 * updated and the paywall was left pointing at translation keys that no longer existed.
 */
export const RATING_REVIEWS: Review[] = [
  {
    nameKey: 'paywall.social.reviewer1',
    roleKey: 'paywall.social.role1',
    quoteKey: 'paywall.social.review1',
    avatar: AVATARS.sanket,
  },
  {
    nameKey: 'paywall.social.reviewer2',
    roleKey: 'paywall.social.role2',
    quoteKey: 'paywall.social.review2',
    avatar: AVATARS.sean,
  },
  {
    nameKey: 'paywall.social.reviewer3',
    roleKey: 'paywall.social.role3',
    quoteKey: 'paywall.social.review3',
    avatar: AVATARS.buck,
  },
];

export const PAYWALL_REVIEWS: Review[] = [
  {
    nameKey: 'paywall.social.reviewer6',
    roleKey: 'paywall.social.role6',
    quoteKey: 'paywall.social.review6',
    avatar: AVATARS.novie,
  },
  {
    nameKey: 'paywall.social.reviewer7',
    roleKey: 'paywall.social.role7',
    quoteKey: 'paywall.social.review7',
    avatar: AVATARS.auntieso,
  },
  {
    nameKey: 'paywall.social.reviewer5',
    roleKey: 'paywall.social.role5',
    quoteKey: 'paywall.social.review5',
    avatar: AVATARS.jordan,
  },
  {
    nameKey: 'paywall.social.reviewer4',
    roleKey: 'paywall.social.role4',
    quoteKey: 'paywall.social.review4',
    avatar: AVATARS.bryan,
  },
];
