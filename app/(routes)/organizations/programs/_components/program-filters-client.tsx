'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { ProgramFilters } from './program-filters';
import type { ProgramsSearchParams } from './data-table-schema';

interface ProgramFiltersClientProps {
  searchParams: ProgramsSearchParams;
}

export function ProgramFiltersClient({ searchParams }: ProgramFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`/organizations/programs?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) {
      params.set('pageSize', pageSize);
    }
    router.push(`/organizations/programs?${params.toString()}`);
  }, [router, currentSearchParams]);

  return (
    <ProgramFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
