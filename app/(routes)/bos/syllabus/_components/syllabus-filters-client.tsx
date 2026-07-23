'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { SyllabusFilters } from './syllabus-filters';
import { SyllabusSearchParams } from './data-table-schema';

interface SyllabusFiltersClientProps {
  searchParams: SyllabusSearchParams;
}

export function SyllabusFiltersClient({ searchParams }: SyllabusFiltersClientProps) {
  const router = useRouter();
  const currentParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();

  // Auto-seed institutionsId for regular users once the institution context resolves.
  // Uses router.replace so the param is set without adding a browser history entry.
  useEffect(() => {
    if (isSuperAdmin || !institutionCtx?.myjkkn_id) return;
    if (currentParams.get('institutionsId')) return;
    const params = new URLSearchParams(currentParams.toString());
    params.set('institutionsId', institutionCtx.myjkkn_id);
    router.replace(`?${params.toString()}`);
  }, [isSuperAdmin, institutionCtx?.myjkkn_id, currentParams, router]);

  const handleFilterChange = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(currentParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handleClearFilters = () => {
    router.push('?page=1');
  };

  return (
    <SyllabusFilters
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
      isSuperAdmin={isSuperAdmin}
      currentValues={{
        search: searchParams.search,
        boardId: searchParams.boardId,
        regulationId: searchParams.regulationId,
        stream: searchParams.stream,
        // Fall back to the resolved context id while the URL replace is in flight
        institutionsId: searchParams.institutionsId ?? institutionCtx?.myjkkn_id,
      }}
    />
  );
}
