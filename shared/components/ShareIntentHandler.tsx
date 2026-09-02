import { useDatabase } from '@lib/providers/DatabaseProvider';
import { extractUrl, fetchPreviewWithCache } from '@lib/services/linkPreview';
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useRef } from 'react';

export function ShareIntentHandler() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const { ideaRepository: ideaRepo, authRepository: authRepo, isReady } = useDatabase();
  const processingRef = useRef(false);

  useEffect(() => {
    if (!isReady || !ideaRepo || !authRepo) return;
    if (!hasShareIntent || !shareIntent || processingRef.current) return;

    const raw = shareIntent.webUrl ?? shareIntent.text ?? '';
    if (!raw.trim()) {
      resetShareIntent();
      return;
    }

    const state = authRepo.getState();
    if (!state) return;
    const ownerId =
      state.mode === 'authenticated' && state.firebaseUid
        ? state.firebaseUid
        : `guest_${state.guestId}`;

    processingRef.current = true;

    const url = shareIntent.webUrl ?? extractUrl(raw);

    (async () => {
      try {
        if (url) {
          const initialPreview = shareIntent.meta?.title
            ? { title: shareIntent.meta.title }
            : undefined;
          const created = ideaRepo.createLink({
            url,
            text: url === raw ? '' : raw,
            ownerId,
            preview: initialPreview,
          });
          try {
            const preview = await fetchPreviewWithCache(url, created.id);
            ideaRepo.updatePreview(created.id, {
              ...initialPreview,
              ...preview,
            });
          } catch {
            // best-effort — leave card with whatever we have
          }
        } else {
          ideaRepo.createNote({ text: raw, ownerId });
        }
        router.replace('/(main)/ideas');
      } finally {
        resetShareIntent();
        processingRef.current = false;
      }
    })();
  }, [isReady, hasShareIntent, shareIntent, ideaRepo, authRepo, resetShareIntent]);

  return null;
}
