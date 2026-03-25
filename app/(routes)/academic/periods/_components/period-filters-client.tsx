'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { PeriodFilters } from './period-filters';
import type { PeriodsSearchParams } from './data-table-schema';

interface PeriodFiltersClientProps {
  searchParams: PeriodsSearchParams;
}

export function PeriodFiltersClient({ searchParams }: PeriodFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  // Handle filter changes by updating URL
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset page to 1 when filters change
      params.set('page', '1');

      router.push(`/academic/periods?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  // Handle clearing all filters
  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    // Keep only page and pageSize
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) {
      params.set('pageSize', pageSize);
    }
    router.push(`/academic/periods?${params.toString()}`);
  }, [router, currentSearchParams]);

  return (
    <PeriodFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
