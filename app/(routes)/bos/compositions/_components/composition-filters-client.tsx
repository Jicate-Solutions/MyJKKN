'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { CompositionFilters } from './composition-filters';
import type { CompositionSearchParams } from './data-table-schema';

interface CompositionFiltersClientProps {
  searchParams: CompositionSearchParams;
}

export function CompositionFiltersClient({ searchParams }: CompositionFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();
  const { isSuperAdmin, userProfile } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();

  // Auto-seed institutionsId for regular users once institution context resolves.
  useEffect(() => {
    if (isSuperAdmin || !institutionCtx?.myjkkn_id) return;
    if (currentSearchParams?.get('institutionsId')) return;
    const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
    params.set('institutionsId', institutionCtx.myjkkn_id);
    router.replace(`/bos/compositions?${params.toString()}`);
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
      router.push(`/bos/compositions?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) params.set('pageSize', pageSize);
    router.push('/bos/compositions');
  }, [router, currentSearchParams]);

  return (
    <CompositionFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
      isSuperAdmin={isSuperAdmin}
      institutionContextId={institutionCtx?.myjkkn_id}
    />
  );
}
