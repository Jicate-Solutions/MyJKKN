'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { createCoursesColumns } from './courses-columns';
import type { CoursesFiltersState } from './courses-filters';

export function CoursesDataTable({
  institutionId, filters, institutionName,
}: {
  institutionId: string | undefined;  // undefined = all institutions (super-admin only)
  filters: CoursesFiltersState;
  institutionName?: string;
}) {
  const { data, isLoading, error } = useBosCourses({
    institution_id: institutionId,
    regulation_code: filters.regulation_code || undefined,
    search: filters.search || undefined,
    is_active: filters.is_active,
    limit: 200,
  });
  const scope = useBosBoardScope();

  const columns = useMemo(() => createCoursesColumns(institutionName), [institutionName]);

  if (isLoading || scope.isLoading) return <Skeleton className='h-64 w-full' />;
  if (error) return <p className='text-sm text-red-600'>{(error as Error).message}</p>;

  // COE responses arrive as either {data: [...]} or a flat array — handle both.
  const rows = Array.isArray(data) ? data : (data?.data ?? []);

  // The /api/bos/courses-master GET returns {data:[]} when the caller is not a
  // super-admin AND has no bos_members rows (boardsOf empty). The DataTable's
  // default "No results" doesn't explain why — surface the board-membership
  // requirement instead so users know who to ask.
  if (rows.length === 0 && !scope.hasAnyAccess) {
    return (
      <EmptyState
        icon={<Users className='h-10 w-10 text-muted-foreground' />}
        title='No board access'
        description='Courses are scoped to BoS compositions. Ask an administrator to add you as a member of a composition for your board, then this list will populate.'
      />
    );
  }

  return <DataTable columns={columns} data={rows} />;
}
