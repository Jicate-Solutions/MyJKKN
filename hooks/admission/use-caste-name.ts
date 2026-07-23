'use client';

// Resolves a learner's caste_id (FK) → the caste name on the client. The legacy
// `caste` text column is retired, so display surfaces resolve it here. Fetches
// the castes lookup once per session (cached); RLS on castes is open to anon.

import { useQuery } from '@tanstack/react-query';
import { CasteService } from '@/lib/services/admission/caste-service';

export function useCasteName(casteId: string | null | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: ['lookup', 'castes', 'active'],
    queryFn: () => CasteService.list(true),
    staleTime: 5 * 60 * 1000,
  });
  if (!casteId) return undefined;
  return data?.find((c) => c.id === casteId)?.name;
}
