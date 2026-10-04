'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { SectionFilters } from './section-filters';
import type { SectionsSearchParams } from './data-table-schema';

interface SectionFiltersClientProps {
  searchParams: SectionsSearchParams;
}

export function SectionFiltersClient({ searchParams }: SectionFiltersClientProps) {
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
      // Clear dependent filters in the SAME navigation (separate pushes off
      // the same stale params overwrite each other).
      const dependents: Record<string, string[]> = {
        institution_id: ['degree_id', 'department_id', 'program_id', 'semester_id'],
        degree_id: ['department_id', 'program_id', 'semester_id'],
        department_id: ['program_id', 'semester_id'],
        program_id: ['semester_id']
      };
      for (const dep of dependents[key] ?? []) params.delete(dep);
      params.set('page', '1');
      router.push(`/organizations/sections?${params.toString()}`);
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
    router.push(`/organizations/sections?${params.toString()}`);
  }, [router, currentSearchParams]);

  return (
    <SectionFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
