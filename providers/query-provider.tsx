'use client';

import {
  QueryClient,
  QueryClientProvider as ReactQueryClientProvider
} from '@tanstack/react-query';
import { useState, ReactNode } from 'react';

export function QueryClientProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh longer
            gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache longer
            refetchOnWindowFocus: true, // Re-enable: Refetch when tab regains focus after inactivity
            refetchOnMount: true, // Refetch on mount
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
            retryDelay: (attemptIndex) =>
              Math.min(1000 * 2 ** attemptIndex, 30000),
            // Only notify components when these specific props change
            notifyOnChangeProps: ['data', 'error', 'isLoading', 'isFetching']
          },
          mutations: {
            retry: 1,
            retryDelay: 1000
          }
        }
      })
  );

  return (
    <ReactQueryClientProvider client={queryClient}>
      {children}
    </ReactQueryClientProvider>
  );
}
