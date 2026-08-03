'use client';

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * ONE QueryClient for the whole app.
 *
 * Until 2026-08-02 the app ran TWO independent QueryClients:
 *   - this file's module-scoped client (root layout, `ReactQueryProvider`)
 *   - a second client created inside `providers/query-provider.tsx`
 *     (mounted by app/(routes)/layout.tsx)
 *
 * Any query used by BOTH trees was fetched, cached, and polled twice — e.g.
 * the unread-notifications badge: `AppBadgeSync` (root layout) and
 * `NotificationBell` (navbar, routes layout) share the exact same query key
 * `['notifications','unread',userId]`, but each client fetched + polled it
 * independently → 2× /api/notifications on every page, platform-wide.
 *
 * Both providers now hand out the SAME browser-singleton client, so N
 * consumers of a key share 1 request and 1 cache entry regardless of which
 * layout mounted them.
 *
 * The defaults below are the ones 99% of queries already ran under (the
 * routes-layout client); the root client's only differences were a shorter
 * gcTime and a simpler retry.
 *
 * SSR note: on the server we return a fresh client per call (queries don't
 * execute server-side here — no prefetch/hydration in this app), so nothing
 * is ever shared across requests/users. The singleton exists only in the
 * browser, which is per-user by definition.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
        gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
        refetchOnWindowFocus: false, // Disabled: was causing excessive refetches on every tab switch
        refetchOnMount: true, // Refetch on mount (only when stale)
        refetchOnReconnect: true, // Refetch on network reconnect
        retry: (failureCount, error) => {
          // Don't retry on auth errors, RLS policy errors, or 404s
          const errorMessage = error?.message?.toLowerCase() || '';
          const errorStatus = (error as any)?.status;
          if (
            errorMessage.includes('unauthorized') ||
            errorMessage.includes('forbidden') ||
            errorMessage.includes('not found') ||
            errorMessage.includes('54001') || // Stack depth error
            errorMessage.includes('jwt') ||
            errorMessage.includes('invalid') ||
            errorStatus === 401 ||
            errorStatus === 403 ||
            errorStatus === 404 // Don't retry deleted resources
          ) {
            return false;
          }
          // Retry only once for other errors
          return failureCount < 1;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        // Only notify components when these specific props change
        notifyOnChangeProps: ['data', 'error', 'isLoading', 'isFetching']
      },
      mutations: {
        retry: 1,
        retryDelay: 1000
      }
    }
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always a fresh client — never share state across requests.
    return makeQueryClient();
  }
  // Browser: one client for the whole tab, shared by every provider mount.
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function ReactQueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = React.useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
