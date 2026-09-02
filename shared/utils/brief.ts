const MAX_TITLE_LENGTH = 40;

/**
 * Returns a usable project title for an imported brief. Falls back to the
 * first words of the script when the brief has no title, then to the provided
 * default (briefs may be created on the website without a title).
 */
export function deriveBriefTitle(
  title: string | null | undefined,
  script: string | null | undefined,
  fallback: string
): string {
  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  const firstLine = script?.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH).trim();
  if (firstLine) {
    return firstLine;
  }

  return fallback;
}
