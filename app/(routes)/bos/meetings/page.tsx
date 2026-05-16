import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { MeetingDataTable } from './_components/meeting-data-table';
import { MeetingStatusTabs } from './_components/meeting-status-tabs';
import { MeetingFiltersClient } from './_components/meeting-filters-client';
import {
  meetingSearchParamsSchema,
  type MeetingSearchParams,
} from './_components/data-table-schema';

interface MeetingsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MeetingsPage({ searchParams }: MeetingsPageProps) {
  const raw = await searchParams;
  const search = meetingSearchParamsSchema.parse({
    page: raw.page,
    pageSize: raw.pageSize,
    search: raw.search,
    sortBy: raw.sortBy,
    sortOrder: raw.sortOrder,
    status: raw.status,
    board_id: raw.board_id,
    academic_year: raw.academic_year,
    meeting_type: raw.meeting_type,
    institutionsId: raw.institutionsId,
  }) satisfies MeetingSearchParams;

  return (
    <PermissionGuard module='academic.bos-meetings' action='view'>
      <div className='space-y-4'>
        <PageHeader
          title='Meetings'
          description='Schedule and manage Board of Studies meetings.'
        />

        {/* Status filter tabs */}
        <MeetingStatusTabs currentStatus={search.status} />

        {/* Additional filters */}
        <MeetingFiltersClient searchParams={search} />

        {/* Data table */}
        <Suspense
          fallback={
            <div className='space-y-3'>
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          }
        >
          <MeetingDataTable search={search} />
        </Suspense>
      </div>
    </PermissionGuard>
  );
}
