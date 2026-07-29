'use client';

import { useMemo } from 'react';
import { Users } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { useBosCourses } from '@/hooks/bos/use-bos-courses';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { institutionSkipsPartLevel } from '@/lib/services/bos/courses-schemas';
import { createCoursesColumns } from './courses-columns';
import type { CoursesFiltersState } from './courses-filters';

/**
 * Single source of truth for the list-query arguments. The export button
 * builds the exact same object so its useBosCourses call shares this table's
 * React Query cache entry instead of triggering a second COE round-trip.
 */
export function coursesQueryArgs(
  institutionId: string | undefined,
  filters: CoursesFiltersState,
) {
  return {
    institution_id: institutionId,
    regulation_code: filters.regulation_code || undefined,
    search: filters.search || undefined,
    is_active: filters.is_active,
    limit: 200,
  } as const;
}

export function CoursesDataTable({
  institutionId, filters, institutionName, institutionCode,
}: {
  institutionId: string | undefined;  // undefined = all institutions (super-admin only)
  filters: CoursesFiltersState;
  institutionName?: string;
  institutionCode?: string;
}) {
  const { data, isLoading, error } = useBosCourses(coursesQueryArgs(institutionId, filters));
  const scope = useBosBoardScope();

  const columns = useMemo(
    () => createCoursesColumns(institutionName, {
      hidePart: institutionSkipsPartLevel(institutionCode),
      // College of Pharmacy hosts year-based Pharm.D courses alongside B.Pharm —
      // surface the Academic Year column so year placement is visible.
      showAcademicYear: institutionCode?.trim().toUpperCase() === 'COP',
    }),
    [institutionName, institutionCode],
  );

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
