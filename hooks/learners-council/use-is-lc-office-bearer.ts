'use client';

// hooks/learners-council/use-is-lc-office-bearer.ts
// "Is the signed-in person a Learners Council office bearer?"
//
// Used by the notification composer to narrow the audience picker it draws.
// The answer is presentational only — see the route's header comment: the send
// path and RLS decide who may actually be reached, not this hook.

import { useQuery } from '@tanstack/react-query';

export interface LCOfficeBearerStatus {
  isOfficeBearer: boolean;
  isAdmin: boolean;
}

// Anything other than a clear "yes" leaves the caller on the default,
// unrestricted path — a failed lookup must never silently narrow an
// administrator's composer.
const UNKNOWN: LCOfficeBearerStatus = { isOfficeBearer: false, isAdmin: false };

export function useIsLcOfficeBearer() {
  const { data, isLoading } = useQuery<LCOfficeBearerStatus>({
    queryKey: ['lc-office-bearer', 'me'],
    queryFn: async () => {
      const res = await fetch('/api/learners-council/me/office-bearer', {
        cache: 'no-store'
      });
      if (!res.ok) return UNKNOWN;

      const json = await res.json();
      return {
        isOfficeBearer: json?.isOfficeBearer === true,
        isAdmin: json?.isAdmin === true
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 1
  });

  return {
    isOfficeBearer: data?.isOfficeBearer ?? false,
    isAdmin: data?.isAdmin ?? false,
    isLoading
  };
}
