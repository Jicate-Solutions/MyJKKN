'use client';

/**
 * ConversationLinkWatcher — reports ?conversation=<id> on arrival AND on every
 * later change of the query string.
 *
 * An "answer ready" notice links to /ai-query?conversation=<id>. Clicked while
 * the person is already on /ai-query, that is a same-route navigation: nothing
 * remounts, so reading the URL once on mount would miss it and the conversation
 * would never open. useSearchParams changes with the query string, so this does
 * not miss it.
 *
 * Render it inside its own <Suspense> boundary (AIQueryContainer does), so
 * useSearchParams never pushes the whole page into client-only rendering.
 */

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export function ConversationLinkWatcher({ onLink }: { onLink: (conversationId: string) => void }) {
  const params = useSearchParams();
  const id = params?.get('conversation') ?? null;
  useEffect(() => {
    if (id) onLink(id);
  }, [id, onLink]);
  return null;
}

export default ConversationLinkWatcher;
