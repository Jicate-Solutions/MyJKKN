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
            staleTime: 30 * 1000, // 30 seconds - reduced from 1 minute for fresher data
            refetchOnWindowFocus: false,
            refetchOnMount: true, // Always refetch when component mounts
            refetchOnReconnect: true,
            retry: (failureCount, error) => {
              // Don't retry on auth errors or RLS policy errors
              const errorMessage = error?.message?.toLowerCase() || '';
              const errorStatus = (error as any)?.status;
              if (
                errorMessage.includes('unauthorized') ||
                errorMessage.includes('forbidden') ||
                errorMessage.includes('54001') || // Stack depth error
                errorMessage.includes('jwt') ||
                errorMessage.includes('invalid') ||
                errorStatus === 401 ||
                errorStatus === 403
              ) {
                return false;
              }
              // Retry up to 2 times for other errors
              return failureCount < 2;
            },
            retryDelay: (attemptIndex) =>
              Math.min(1000 * 2 ** attemptIndex, 30000)
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
