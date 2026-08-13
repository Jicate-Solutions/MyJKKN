// hooks/school-fees/use-school-fee-heads.ts
//
// Fee heads change about once a year, so they sit in the STABLE_DATA tier
// alongside institutions and programs.

import { useQuery } from '@tanstack/react-query';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { SchoolFeeHeadService } from '@/lib/services/school-fees/school-fee-head-service';
import type { SchoolFeeHead } from '@/types/school-fees';

export const SCHOOL_FEE_HEAD_KEYS = {
  all: ['school-fee-heads'] as const,
  list: (includeInactive: boolean) => ['school-fee-heads', 'list', includeInactive] as const,
};

/**
 * Fee heads a school may put on a plan — billing_categories rows whose
 * `applies_to` contains 'school'. The filter lives in the service, so no
 * caller can accidentally offer college heads in the school grid.
 */
export function useSchoolFeeHeads(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;

  const query = useQuery({
    queryKey: SCHOOL_FEE_HEAD_KEYS.list(includeInactive),
    queryFn: () => SchoolFeeHeadService.list({ includeInactive }),
    ...QUERY_CONFIG.STABLE_DATA,
  });

  const heads: SchoolFeeHead[] = query.data ?? [];

  return {
    heads,
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: query.refetch,
  };
}
