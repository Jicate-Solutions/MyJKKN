/**
 * Timetable Filters - Client Component Wrapper
 *
 * URL-based filtering for timetables list page.
 * Updates URL search params for server-side data fetching.
 *
 * Fixed: 2025-12-31 - Stabilized callback references to prevent re-render loops
 * - handleFilterChange now reads URL inside callback (not from deps)
 * - handleClearFilters uses same pattern for stability
 */

'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { TimetableFilters } from './timetable-filters';
import type { TimetablesSearchParams } from './data-table-schema';

interface TimetableFiltersClientProps {
  searchParams: TimetablesSearchParams;
}

export function TimetableFiltersClient({
  searchParams: _serverSearchParams
}: TimetableFiltersClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentSearchParams = useSearchParams();

  // Use client-side URL params for immediate UI feedback
  // This prevents the "selection not sticking" issue
  const searchParams = useMemo((): TimetablesSearchParams => {
    return {
      page: Number(currentSearchParams?.get('page')) || 1,
      pageSize: Number(currentSearchParams?.get('pageSize')) || 10,
      search: currentSearchParams?.get('search') || undefined,
      institution_id: currentSearchParams?.get('institution_id') || undefined,
      academic_year_id: currentSearchParams?.get('academic_year_id') || undefined,
      degree_id: currentSearchParams?.get('degree_id') || undefined,
      program_id: currentSearchParams?.get('program_id') || undefined,
      department_id: currentSearchParams?.get('department_id') || undefined,
      semester: currentSearchParams?.get('semester') || undefined,
      section: currentSearchParams?.get('section') || undefined,
      is_active: currentSearchParams?.get('is_active') as 'true' | 'false' | undefined,
      is_template: currentSearchParams?.get('is_template') as 'true' | 'false' | undefined,
      timetable_type: currentSearchParams?.get('timetable_type') as 'section' | 'semester' | undefined,
    };
  }, [currentSearchParams]);

  // Handle filter changes by updating URL
  // CRITICAL FIX: Read currentSearchParams INSIDE the callback to keep function reference stable
  // This prevents cascading useEffect re-runs in TimetableFilters
  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      // Read fresh URL params from window.location to avoid dependency on currentSearchParams
      const params = new URLSearchParams(window.location.search);

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset page to 1 when filters change (except for page itself)
      if (key !== 'page') {
        params.set('page', '1');
      }

      // Use router.replace instead of push to avoid polluting browser history with filter changes
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname] // Only depend on stable references
  );

  // Handle clearing all filters
  // Same pattern - read from window.location inside callback
  const handleClearFilters = useCallback(() => {
    const currentParams = new URLSearchParams(window.location.search);
    const params = new URLSearchParams();

    // Keep only page and pageSize
    params.set('page', '1');
    const pageSize = currentParams.get('pageSize');
    if (pageSize) {
      params.set('pageSize', pageSize);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname]);

  return (
    <TimetableFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
