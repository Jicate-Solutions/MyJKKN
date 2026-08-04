'use client';

import { QueryClientProvider as ReactQueryClientProvider } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';
import { getQueryClient } from './query-client-provider';

/**
 * Routes-layout React Query provider (mounted by app/(routes)/layout.tsx).
 *
 * This used to construct its OWN QueryClient, giving the app two independent
 * caches (see providers/query-client-provider.tsx for the full story). It now
 * reuses the shared browser-singleton client, so queries mounted under the
 * routes tree and queries mounted in the root layout (e.g. the notification
 * badge) share one cache entry and one network request per key.
 *
 * The component is kept (rather than deleted) so app/(routes)/layout.tsx
 * doesn't need to change; providing the same client twice is a no-op.
 */
export function QueryClientProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <ReactQueryClientProvider client={queryClient}>
      {children}
    </ReactQueryClientProvider>
  );
}
