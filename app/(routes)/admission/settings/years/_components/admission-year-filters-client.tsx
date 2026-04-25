'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { AdmissionYearFilters } from './admission-year-filters';
import type { AdmissionYearsSearchParams } from './data-table-schema';

interface AdmissionYearFiltersClientProps {
  searchParams: AdmissionYearsSearchParams;
}

export function AdmissionYearFiltersClient({
  searchParams
}: AdmissionYearFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
      if (value) params.set(key, value);
      else params.delete(key);
      params.set('page', '1');
      router.push(`/admission/settings/years?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) params.set('pageSize', pageSize);
    router.push(`/admission/settings/years?${params.toString()}`);
  }, [router, currentSearchParams]);

  return (
    <AdmissionYearFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
    />
  );
}
