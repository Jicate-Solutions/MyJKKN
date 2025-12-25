'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { CategoryFilters } from './category-filters';
import type { StaffCategoriesSearchParams } from './data-table-schema';

interface CategoryFiltersClientProps {
  searchParams: StaffCategoriesSearchParams;
}

export function CategoryFiltersClient({ searchParams }: CategoryFiltersClientProps) {
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
      router.push(`/staff/category?${params.toString()}`);
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
    router.push(`/staff/category?${params.toString()}`);
  }, [router, currentSearchParams]);

  return (
    <CategoryFilters
      filters={{
        search: searchParams.search || '',
        isActive: searchParams.isActive,
        page: searchParams.page,
        limit: searchParams.pageSize
      }}
      onFilterChange={(filters) => {
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined) {
            handleFilterChange(key, String(value));
          }
        });
      }}
    />
  );
}
