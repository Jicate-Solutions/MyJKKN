'use client';

// Course Events — the /courses list page (Phase 2a Task 5). First UI in the
// module; Tasks 1-4 (types, CourseEventService, hooks, nav) are already
// merged and this is the page the nav entry has been pointing at.
//
// fetchDataFn calls CourseEventService.list(...) directly rather than going
// through the useCourseEvents hook — this is the established pattern for
// every advanced-DataTable list page in this app (events, organizations/
// courses, the myjkkn-page-development skill template all do the same): the
// DataTable owns page/search/sort state imperatively and calls fetchDataFn on
// change, so a React-Query-cached hook here would just be a second, unsynced
// source of truth for the same params. useCourseEvents (Task 3) stays for the
// detail/edit pages that read a single course event by id.

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DataTable } from '@/components/data-table/data-table';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDataTableRefreshOnInvalidate } from '@/hooks/use-data-table-refresh';
import { useDeleteCourseEvent } from '@/hooks/courses/use-course-events';
import { CourseEventService } from '@/lib/services/courses/course-event-service';
import { queryKeys } from '@/lib/query/query-keys';
import { COURSE_EVENT_STATUSES, type CourseEvent, type CourseEventStatus } from '@/types/courses';
import { getColumns } from './_components/columns';

const ALL = 'all';

export default function CoursesPage() {
  // Institution scope comes from useInstitutionsWithAccess, NOT from useAuth and NOT
  // from branching on isSuperAdmin. Passing the accessible IDs keeps 'All Institutions'
  // working for multi-institution users; branching on isSuperAdmin silently strips
  // access from secondary roles carrying scope='all'.
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const institutionIds = useMemo(() => institutions.map((i) => i.id), [institutions]);

  const deleteCourseEvent = useDeleteCourseEvent();
  const refetchKey = useDataTableRefreshOnInvalidate(queryKeys.courses.lists());

  // This table runs in fetchDataFn mode (see the file banner above), so it
  // registers no ['courses','list'] query for useDataTableRefreshOnInvalidate
  // to see an invalidate event on — that bridge alone cannot guarantee a
  // refresh here. `tick` forces one deterministically on every successful
  // delete regardless of cache contents.
  const [tick, setTick] = useState(0);

  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  const handleDelete = useCallback(
    (id: string) => deleteCourseEvent.mutate(id, { onSuccess: () => setTick((t) => t + 1) }),
    [deleteCourseEvent]
  );
  const deletingId = deleteCourseEvent.isPending ? (deleteCourseEvent.variables ?? null) : null;

  const columns = useMemo(
    () => getColumns({ onDelete: handleDelete, deletingId }),
    [handleDelete, deletingId]
  );

  const fetchData = useCallback(
    async (params: {
      page: number;
      limit: number;
      search: string;
      sort_by: string;
      sort_order: string;
    }) => {
      // No institution to scope to yet (still loading, or genuinely none) —
      // CourseEventService.list throws without one by design; return empty
      // rather than fire it. institutionIds changing identity re-triggers
      // DataTable's fetch effect once institutions actually load.
      if (institutionIds.length === 0) {
        return {
          success: true,
          data: [],
          pagination: { page: 1, limit: params.limit, total_pages: 1, total_items: 0 },
        };
      }

      const { data, metadata } = await CourseEventService.list({
        institution_ids: institutionIds,
        status: statusFilter !== ALL ? (statusFilter as CourseEventStatus) : undefined,
        search: params.search,
        page: params.page,
        limit: params.limit,
        sortBy: params.sort_by,
        sortDirection: params.sort_order === 'asc' ? 'asc' : 'desc',
      });

      return {
        success: true,
        data,
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total,
        },
      };
    },
    [institutionIds, statusFilter]
  );

  const renderToolbar = () => (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="h-8 w-[160px]">
        <SelectValue placeholder="All statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All statuses</SelectItem>
        {COURSE_EVENT_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="capitalize">
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  // Why the casts below: DataTable constrains TData to ExportableData, a FLAT
  // record of primitives (components/data-table/utils/export-utils.ts).
  // CourseEvent carries `institution: {id,name}|null` and `created_by_profile:
  // {id,full_name}|null`, so it cannot satisfy that constraint — same wall the
  // events table hits (see events-data-table.tsx). Cast at this one boundary
  // rather than loosen the shared DataTable's generic.
  return (
    <ContentLayout title="Courses">
      <PageBreadcrumb items={[{ label: 'Home', href: '/' }, { label: 'Courses' }]} />

      <PermissionGuard module="courses" action="view">
        <div className="space-y-4 mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold py-1">Courses</h1>
              <p className="text-sm text-muted-foreground">
                Short courses, workshops and certificate programmes run outside the
                regular academic calendar.
              </p>
            </div>
            <PermissionGuard module="courses" action="create">
              <Button asChild>
                <Link href="/courses/new" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Create a Course
                </Link>
              </Button>
            </PermissionGuard>
          </div>

          {institutionsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DataTable
              fetchDataFn={fetchData as never}
              getColumns={() => columns as never}
              idField="id"
              exportConfig={{
                entityName: 'courses',
                columnMapping: {
                  title: 'Course',
                  code: 'Code',
                  institution: 'Institution',
                  status: 'Status',
                  mode: 'Mode',
                  start_date: 'Start',
                  end_date: 'End',
                  total_seats: 'Seats',
                },
                columnWidths: [
                  { wch: 32 },
                  { wch: 16 },
                  { wch: 24 },
                  { wch: 14 },
                  { wch: 12 },
                  { wch: 14 },
                  { wch: 14 },
                  { wch: 10 },
                ],
                headers: [
                  'title', 'code', 'institution', 'status', 'mode', 'start_date', 'end_date',
                  'total_seats',
                ],
                // row.institution is a nested {id,name} object — a {...row} spread would
                // drag it (and created_by_profile) into the sheet instead of a flat value,
                // same wall events-data-table.tsx hits. Flatten explicitly.
                transformFunction: ((row: CourseEvent) => ({
                  title: row.title,
                  code: row.code ?? '',
                  institution: row.institution?.name ?? '',
                  status: row.status,
                  mode: row.mode,
                  start_date: row.start_date ?? '',
                  end_date: row.end_date ?? '',
                  total_seats: row.total_seats ?? '',
                })) as never,
              }}
              config={{
                enableUrlState: true,
                enableDateFilter: false,
                enableExport: true,
                enableRowSelection: false,
                enableSearch: true,
                enableColumnFilters: false,
                enableColumnVisibility: true,
                enableColumnResizing: true,
                columnResizingTableId: 'courses-table',
              }}
              renderToolbarContent={renderToolbar}
              refetchKey={refetchKey + tick}
            />
          )}
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
