/**
 * Timetable Filters - Client Component Wrapper
 *
 * URL-based filtering for timetables list page.
 * Updates URL search params for server-side data fetching.
 */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { TimetableFilters } from './timetable-filters';
import type { TimetablesSearchParams } from './data-table-schema';

interface TimetableFiltersClientProps {
  searchParams: TimetablesSearchParams;
}

export function TimetableFiltersClient({
  searchParams
}: TimetableFiltersClientProps) {
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

      router.push(`/academic/timetables?${params.toString()}`);
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
    router.push(`/academic/timetables?${params.toString()}`);
  }, [router, currentSearchParams]);

  return (
    <TimetableFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
