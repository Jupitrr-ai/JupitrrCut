import { File, Paths } from 'expo-file-system';

/**
 * Recorded clips, thumbnails and exported videos live under the app's
 * Documents directory. On iOS the absolute prefix of that directory contains
 * the app-container UUID (e.g. `file:///var/mobile/Containers/Data/Application/
 * <UUID>/Documents/…`), which changes on every reinstall and can change on app
 * updates. Persisting absolute URIs therefore breaks playback after an upgrade
 * even though the files themselves survive in the new Documents directory.
 *
 * To stay upgrade-proof we persist paths RELATIVE to the Documents directory
 * (e.g. `clip_x.mp4`, `samples/1_original.mp4`) and resolve them against the
 * CURRENT Documents directory at read time. `resolveDocumentPath` also accepts
 * legacy absolute paths, so installs that already stored absolute URIs heal
 * themselves on the next read.
 */

// The Documents directory segment differs per platform: iOS uses `Documents`,
// Android uses `files`. We split a stored absolute path on these markers to
// recover the portion relative to the documents root.
const DOC_DIR_MARKERS = ['/Documents/', '/files/'];

// simulator placeholder recordings and remote (Jupitrr CDN) clips are not
// document-relative and must be stored / returned verbatim.
function isPassThrough(uri: string): boolean {
  return uri.startsWith('simulator://') || /^https?:\/\//i.test(uri);
}

function isAbsolute(uri: string): boolean {
  return uri.startsWith('file://') || uri.startsWith('/');
}

/**
 * Strip the volatile container prefix, returning the path relative to the
 * Documents directory (may include a subdirectory like `samples/`). Already
 * relative values and pass-through URIs are returned unchanged.
 */
export function toDocumentRelativePath(uri: string | null | undefined): string | undefined {
  if (!uri) return uri ?? undefined;
  if (isPassThrough(uri)) return uri;
  if (!isAbsolute(uri)) return uri; // already relative

  for (const marker of DOC_DIR_MARKERS) {
    const idx = uri.lastIndexOf(marker);
    if (idx !== -1) return uri.slice(idx + marker.length);
  }
  return uri; // outside the Documents directory (unexpected) — leave as-is
}

/**
 * Resolve a stored value to an absolute URI usable by the video player and the
 * native export module. Accepts both relative paths (new) and legacy absolute
 * paths (old installs). Pass-through URIs (simulator/remote) are returned
 * untouched.
 */
export function resolveDocumentPath(stored: string | null | undefined): string | undefined {
  if (!stored) return stored ?? undefined;
  if (isPassThrough(stored)) return stored;

  const relative = toDocumentRelativePath(stored);
  if (!relative) return undefined;
  // Marker not found in a legacy absolute path — hand it back untouched rather
  // than re-rooting something we don't understand.
  if (isAbsolute(relative)) return stored;

  const segments = relative.split('/').filter(Boolean);
  return new File(Paths.document, ...segments).uri;
}
