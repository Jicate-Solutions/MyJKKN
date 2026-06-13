'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { MemberTypeFilters } from './member-type-filters';
import type { MemberTypeSearchParams } from './data-table-schema';

interface MemberTypeFiltersClientProps {
  searchParams: MemberTypeSearchParams;
}

export function MemberTypeFiltersClient({ searchParams }: MemberTypeFiltersClientProps) {
  const router = useRouter();
  const currentSearchParams = useSearchParams();
  const { isSuperAdmin } = usePermissions();

  // No auto-seed of institutionsId for non-admins here (unlike experts):
  // the member-types API clamps non-admins to their own CAS-aware scope
  // server-side, so an empty filter already means "my institution".

  const handleFilterChange = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(currentSearchParams?.toString() ?? '');
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      router.push(`/bos/member-types?${params.toString()}`);
    },
    [router, currentSearchParams]
  );

  const handleClearFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set('page', '1');
    const pageSize = currentSearchParams?.get('pageSize');
    if (pageSize) params.set('pageSize', pageSize);
    router.push('/bos/member-types');
  }, [router, currentSearchParams]);

  return (
    <MemberTypeFilters
      searchParams={searchParams}
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
      isSuperAdmin={isSuperAdmin}
    />
  );
}
