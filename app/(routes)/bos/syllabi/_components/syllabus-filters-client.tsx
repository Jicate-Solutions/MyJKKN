'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { usePermissions } from '@/hooks/use-permissions';
import { SyllabusFilters } from './syllabus-filters';
import { SyllabusSearchParams } from './data-table-schema';

interface SyllabusFiltersClientProps {
  searchParams: SyllabusSearchParams;
}

export function SyllabusFiltersClient({ searchParams }: SyllabusFiltersClientProps) {
  const router = useRouter();
  const currentParams = useSearchParams();
  const { isSuperAdmin, userProfile } = usePermissions();

  const handleFilterChange = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(currentParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set('page', '1');
    router.push(`?${params.toString()}`);
  };

  const handleClearFilters = () => {
    router.push('?page=1');
  };

  return (
    <SyllabusFilters
      onFilterChange={handleFilterChange}
      onClearFilters={handleClearFilters}
      isSuperAdmin={isSuperAdmin}
      currentValues={{
        search: searchParams.search,
        boardId: searchParams.boardId,
        regulationId: searchParams.regulationId,
        stream: searchParams.stream,
        institutionsId: searchParams.institutionsId,
      }}
    />
  );
}
