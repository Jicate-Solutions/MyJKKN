'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { CommitteeFilters } from './committee-filters';
import type { CommitteeSearchParams } from './data-table-schema';

interface CommitteeFiltersClientProps {
  searchParams: CommitteeSearchParams;
}

export function CommitteeFiltersClient({ searchParams }: CommitteeFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();

  // No auto-seed of institutionsId for non-admins (unlike experts): the
  // committees API clamps non-admins to their own CAS-aware scope server-side,
  // so an empty filter already means "my institution".

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`/bos/committees?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) params.set('pageSize', pageSize);
    router.push('/bos/committees');
  }, [router, currentSearchParams]);

  return (
    <CommitteeFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
