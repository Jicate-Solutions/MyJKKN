'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { StaffPlanFilters } from './staff-plan-filters';
import type { StaffPlanningSearchParams } from './data-table-schema';

interface StaffPlanFiltersClientProps {
  searchParams: StaffPlanningSearchParams;
}

export function StaffPlanFiltersClient({ searchParams }: StaffPlanFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');

      if (value === undefined || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }

      // Reset to first page when filters change
      if (key !== 'page') {
        params.delete('page');
      }

      router.push(`?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    // Keep page and pageSize if they exist
    const page = currentSearchParams?.get('page');
    const pageSize = currentSearchParams?.get('pageSize');
    if (page) params.set('page', page);
    if (pageSize) params.set('pageSize', pageSize);

    router.push(`?${params.toString()}`);
  }, [router, currentSearchParams]);

  return (
    <StaffPlanFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
