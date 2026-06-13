'use client';

import { useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { ExpertFilters } from './expert-filters';
import type { ExpertSearchParams } from './data-table-schema';

interface ExpertFiltersClientProps {
  searchParams: ExpertSearchParams;
}

export function ExpertFiltersClient({ searchParams }: ExpertFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();

  // Auto-seed institutionsId for non-admin users once institution context resolves.
  useEffect(() => {
    if (isSuperAdmin || !institutionCtx?.myjkkn_id) return;
    if (currentSearchParams?.get('institutionsId')) return;
    const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
    params.set('institutionsId', institutionCtx.myjkkn_id);
    router.replace(`/bos/experts?${params.toString()}`);
  }, [isSuperAdmin, institutionCtx?.myjkkn_id, currentSearchParams, router]);

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`/bos/experts?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) params.set('pageSize', pageSize);
    router.push('/bos/experts');
  }, [router, currentSearchParams]);

  return (
    <ExpertFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
