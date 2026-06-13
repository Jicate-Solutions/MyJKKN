'use client';

// Resolves a learner's quota_id (FK → quotas) to its display name on the
// client. Storage is quota_id only (the legacy `quota` TEXT column is retired),
// so read/display surfaces resolve the name here. Shares the React Query cache
// key with the quota dropdowns, so the lookup is fetched once per session.

import { useQuery } from '@tanstack/react-query';
import { LookupService } from '@/lib/services/admission/lookup-service';

export function useQuotaName(quotaId: string | null | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: ['lookup', 'quotas', 'active'],
    queryFn: () => LookupService.listQuotas(true),
    staleTime: 5 * 60 * 1000,
  });
  if (!quotaId) return undefined;
  return data?.find((q) => q.id === quotaId)?.name;
}
