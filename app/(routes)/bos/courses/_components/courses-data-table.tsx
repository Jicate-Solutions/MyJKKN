'use client';

import { DataTable } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { coursesColumns } from './courses-columns';
import type { CoursesFiltersState } from './courses-filters';

export function CoursesDataTable({
  institutionId, filters,
}: { institutionId: string; filters: CoursesFiltersState }) {
  const { data, isLoading, error } = useBosCourses({
    institution_id: institutionId,
    regulation_code: filters.regulation_code || undefined,
    search: filters.search || undefined,
    is_active: filters.is_active,
    limit: 200,
  });

  if (isLoading) return <Skeleton className='h-64 w-full' />;
  if (error) return <p className='text-sm text-red-600'>{(error as Error).message}</p>;

  // COE responses arrive as either {data: [...]} or a flat array — handle both.
  // (See lib/services/internal-marks/cia-marks-service.ts which uses the same dual-shape unwrap.)
  const rows = Array.isArray(data) ? data : (data?.data ?? []);

  return <DataTable columns={coursesColumns} data={rows} />;
}
