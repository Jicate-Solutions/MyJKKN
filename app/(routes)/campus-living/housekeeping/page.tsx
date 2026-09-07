'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DataTable,
  type DataFetchParams,
  type DataFetchResult,
} from '@/components/data-table/data-table';
import { Brush, CalendarClock, ShieldAlert, Sparkles } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAllReachableBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useBookingStatusCounts } from '@/hooks/campus-living/use-housekeeping-bookings';
import { HousekeepingBookingService } from '@/lib/services/campus-living/housekeeping-booking-service';
import { BookingCard } from './_components/booking-card';
import { getBookingColumns } from './_components/booking-columns';
import { todayLocal } from './_components/booking-status';
import { BookingDetailDialog } from './_components/booking-detail-dialog';
import { AssignCleanerDialog } from './_components/assign-cleaner-dialog';
import { WaiveHoldDialog } from './_components/waive-hold-dialog';
import type { BookingBoardRow } from '@/types/campus-living/housekeeping';

const HK_KEYS = [
  'campus_living.housekeeping.view',
  'campus_living.housekeeping.assign',
  'campus_living.housekeeping.execute',
  'campus_living.housekeeping.waive',
];

export default function HousekeepingBookingsPage() {
  // Defaults are deliberately WIDE: every institution, every date. This page
  // answers "show me the bookings", and RLS already limits the rows to what the
  // caller may see, so 'all' means "all I can reach", never "all that exist".
  const [institutionId, setInstitutionId] = useState<string>('all');
  const [blockId, setBlockId] = useState<string>('all');
  const [viewTarget, setViewTarget] = useState<BookingBoardRow | null>(null);
  const [assignTarget, setAssignTarget] = useState<BookingBoardRow | null>(null);
  const [waiveTarget, setWaiveTarget] = useState<BookingBoardRow | null>(null);
  // Bumped after a mutation to make the table refetch — it owns its own paging
  // state, so invalidating a React Query key would not reach it.
  const [refetchKey, setRefetchKey] = useState(0);

  const { permissions, isSuperAdmin, isLoading: permsLoading } = usePermissions(HK_KEYS);
  // Default OPEN while loading: isSuperAdmin reads false mid-load, and gating on
  // it before permissions resolve would false-negative super admins out.
  const gate = (key: string) => permsLoading || isSuperAdmin || !!permissions[key];
  const canAssign = gate('campus_living.housekeeping.assign');
  const canExecute = gate('campus_living.housekeeping.execute');
  const canWaive = gate('campus_living.housekeeping.waive');

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const { data: blocksResult } = useAllReachableBlocks();
  const blocks = ((blocksResult as any)?.data ?? []) as Array<{ id: string; name: string }>;

  // Pass the selection straight through — never branch on isSuperAdmin to decide
  // WHICH institution's rows to fetch; RLS already filters them.
  const scopedInstitution = institutionId === 'all' ? undefined : institutionId;
  const scopedBlock = blockId === 'all' ? undefined : blockId;

  const filters = useMemo(
    () => ({ institutionId: scopedInstitution, blockId: scopedBlock }),
    [scopedInstitution, scopedBlock],
  );

  const { data: counts } = useBookingStatusCounts(filters);

  const fetchBookings = useCallback(
    async (params: DataFetchParams): Promise<DataFetchResult<BookingBoardRow>> => {
      const { rows, total } = await HousekeepingBookingService.listBookings({
        page: params.page,
        limit: params.limit,
        search: params.search,
        // The table's date filter is optional; empty strings mean "no bound",
        // and passing '' through as a date would be a 22007 rather than a no-op.
        dateFrom: params.from_date || undefined,
        dateTo: params.to_date || undefined,
        institutionId: scopedInstitution,
        blockId: scopedBlock,
        sortBy: params.sort_by || undefined,
        sortOrder: params.sort_order === 'asc' ? 'asc' : 'desc',
      });

      return {
        success: true,
        data: rows,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.max(1, Math.ceil(total / params.limit)),
          total_items: total,
        },
      };
    },
    [scopedInstitution, scopedBlock],
  );

  const bumpRefetch = () => setRefetchKey((k) => k + 1);

  const columns = useMemo(
    () =>
      getBookingColumns({
        canAssign,
        canExecute,
        canWaive,
        onView: setViewTarget,
        onAssign: setAssignTarget,
        onWaive: setWaiveTarget,
        onUploaded: bumpRefetch,
      }),
    [canAssign, canExecute, canWaive],
  );

  return (
    <ContentLayout title='Housekeeping'>
      <PageBreadcrumb
        items={[
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping' },
        ]}
      />

      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>Housekeeping</h1>
            <p className='text-sm text-muted-foreground'>
              Every cleaning booked, across all institutions. Filter or search to narrow it.
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button asChild variant='outline' size='sm'>
              <Link href='/campus-living/housekeeping/holds'>
                <ShieldAlert className='mr-1.5 h-4 w-4' /> Attendance holds
              </Link>
            </Button>
            <Button asChild variant='outline' size='sm'>
              <Link href='/campus-living/housekeeping/types'>
                <Sparkles className='mr-1.5 h-4 w-4' /> Cleaning types
              </Link>
            </Button>
            <Button asChild variant='outline' size='sm'>
              <Link href='/campus-living/housekeeping/cleaners'>
                <Brush className='mr-1.5 h-4 w-4' /> Cleaners
              </Link>
            </Button>
            {/* Availability was the one setup page nothing linked to, and it is
                the one that decides whether ANY slot exists. Without a window
                every learner is told "No cleaning is scheduled for that day". */}
            <Button asChild variant='outline' size='sm'>
              <Link href='/campus-living/housekeeping/availability'>
                <CalendarClock className='mr-1.5 h-4 w-4' /> Availability
              </Link>
            </Button>
          </div>
        </div>

        {/* Scope filters. The table owns search, date range and paging; these two
            are the axes it has no column-level filter for. */}
        <Card>
          <CardContent className='flex flex-wrap items-end gap-3 p-4'>
            <Select
              value={institutionId}
              onValueChange={setInstitutionId}
              disabled={institutionsLoading}
            >
              <SelectTrigger className='w-[15rem]'>
                <SelectValue placeholder='All institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All institutions</SelectItem>
                {institutions.map((inst: any) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Blocks are NOT institution-scoped — hostel_blocks has no
                institution_id and 4 of 6 blocks house several colleges — so this
                lists every reachable block regardless of the institution above. */}
            <Select value={blockId} onValueChange={setBlockId}>
              <SelectTrigger className='w-[15rem]'>
                <SelectValue placeholder='All blocks' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All blocks</SelectItem>
                {blocks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Totals for the WHOLE filtered set, not the visible page — counted by
            the database, so they stay true on page 7 of 40. */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <SummaryTile
            label='Unassigned'
            value={counts?.booked ?? 0}
            tone={(counts?.booked ?? 0) > 0 ? 'destructive' : 'default'}
          />
          <SummaryTile
            label='In progress'
            value={(counts?.assigned ?? 0) + (counts?.in_progress ?? 0)}
          />
          <SummaryTile label='Awaiting feedback' value={counts?.awaiting_feedback ?? 0} />
          <SummaryTile label='Completed' value={counts?.completed ?? 0} />
        </div>

        <DataTable<BookingBoardRow, unknown>
          key={`${scopedInstitution ?? 'all'}-${scopedBlock ?? 'all'}`}
          getColumns={() => columns}
          fetchDataFn={fetchBookings}
          refetchKey={refetchKey}
          idField='id'
          pageSizeOptions={[10, 25, 50, 100]}
          // The card keeps the camera capture inputs, which is the one action
          // that is always done on a phone standing in the room.
          renderMobileRow={(b) => (
            <BookingCard
              key={b.id}
              booking={b}
              canAssign={canAssign}
              canExecute={canExecute}
              canWaive={canWaive}
              isOverdue={b.booking_date < todayLocal()}
              onAssign={setAssignTarget}
              onWaive={setWaiveTarget}
              onUploaded={bumpRefetch}
            />
          )}
          exportConfig={{
            entityName: 'housekeeping-bookings',
            columnMapping: {
              booking_date: 'Date',
              slot_start: 'From',
              slot_end: 'To',
              room_number: 'Room',
              block_name: 'Block',
              type_name: 'Cleaning',
              duration_minutes: 'Minutes',
              status: 'Status',
              cleaner_name: 'Cleaner',
              expected_cost_inr: 'Expected cost',
              average_rating: 'Rating',
            },
            columnWidths: [
              { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 18 },
              { wch: 18 }, { wch: 9 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 8 },
            ],
            headers: [
              'booking_date', 'slot_start', 'slot_end', 'room_number', 'block_name',
              'type_name', 'duration_minutes', 'status', 'cleaner_name',
              'expected_cost_inr', 'average_rating',
            ],
          }}
          config={{
            enableRowSelection: false,
            enableUrlState: false,
            enableDateFilter: true,
            enableExport: true,
            enableSearch: true,
          }}
        />
      </div>

      {/* Read-only, so it needs no refetch on close. Keyed like the others so a
          different booking mounts a fresh dialog rather than reusing stale state. */}
      <BookingDetailDialog
        key={`view-${viewTarget?.id ?? 'none'}`}
        booking={viewTarget}
        open={viewTarget !== null}
        onOpenChange={(o) => !o && setViewTarget(null)}
      />

      {/* Keyed on the booking id so opening a different booking MOUNTS a fresh
          dialog with clean local state, instead of an effect resetting it (which
          would cascade a render on every open). */}
      <AssignCleanerDialog
        key={`assign-${assignTarget?.id ?? 'none'}`}
        booking={assignTarget}
        open={assignTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAssignTarget(null);
            bumpRefetch();
          }
        }}
      />
      <WaiveHoldDialog
        key={`waive-${waiveTarget?.id ?? 'none'}`}
        booking={waiveTarget}
        open={waiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setWaiveTarget(null);
            bumpRefetch();
          }
        }}
      />
    </ContentLayout>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'destructive';
}) {
  return (
    <Card className={tone === 'destructive' ? 'border-destructive' : undefined}>
      <CardContent className='p-4'>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p
          className={`text-2xl font-semibold ${tone === 'destructive' ? 'text-destructive' : ''}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
