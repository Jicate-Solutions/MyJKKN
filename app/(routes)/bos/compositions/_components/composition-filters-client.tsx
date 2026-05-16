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
  const { isSuperAdmin } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();

  // For non-admins: seed the institutionsId URL param from their resolved context so
  // the server-side searchParams (and thus CompositionDataTable) are institution-scoped.
  // Super-admins pick their institution from the dropdown instead.
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
    [router, currentSearchParams],
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) params.set('pageSize', pageSize);
    // Non-admins keep their institutionsId so data stays scoped after clearing.
    if (!isSuperAdmin && institutionCtx?.myjkkn_id) {
      params.set('institutionsId', institutionCtx.myjkkn_id);
    }
    router.push(`/bos/compositions?${params.toString()}`);
  }, [router, currentSearchParams, isSuperAdmin, institutionCtx?.myjkkn_id]);

  return (
    <CompositionFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
