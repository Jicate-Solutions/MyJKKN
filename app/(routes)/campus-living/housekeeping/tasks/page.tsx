'use client';

// ============================================================================
// Housekeeping — Cleaning Work (unified list)
// ----------------------------------------------------------------------------
// This page used to list ONLY hostel_cleaning_tasks, which is block-level
// recurring cleaning generated from schedules. That table has no learner, no
// room and no slot columns — it never could show "who booked / which time /
// which room", so asking for them here looked like missing data rather than a
// different entity. The learner-linked work lives in hostel_cleaning_bookings
// (resident slot bookings).
//
// So the page now merges BOTH sources into one work list:
//   · Room Cleaning  → a resident booking: learner, slot time, room, floor
//   · Block cleaning → a generated task: block + floor only (no learner/room,
//                      by design — nobody books it)
// Status updates route to the right writer per source: tasks through the
// hostel_cleaning_tasks UPDATE policy, bookings through
// fn_housekeeping_mark_booking. Both gates are mirrored client-side.
// ============================================================================

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ClipboardList,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  CalendarClock,
  UserCog,
  UserX,
  Search,
  RotateCcw,
  Sparkles,
  Brush,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCleaningTasks,
  useCleaningSchedules,
  useUpdateCleaningTaskStatus,
} from '@/hooks/campus-living/use-hostel-housekeeping';
import {
  useBookingBoard,
  useMarkBooking,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type {
  CleaningTaskStatus,
  TaskFilters,
} from '@/lib/services/campus-living/housekeeping-service';

/** cleaning_task_status_enum — the only values that column accepts. */
const TASK_STATUSES: CleaningTaskStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'missed',
  'rescheduled',
];

/** Every status either source can carry, for the filter dropdown. */
const ALL_STATUSES = [
  'booked',
  'assigned',
  'scheduled',
  'in_progress',
  'completed',
  'no_show',
  'missed',
  'cancelled',
  'rescheduled',
];

/** Statuses that still need someone to act. Sorted to the top. */
const ACTIONABLE = new Set(['booked', 'assigned', 'scheduled', 'in_progress']);

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

/**
 * Ordering bucket. Plain "actionable first, date ascending" was wrong here:
 * 94 of 98 generated tasks are stale (never marked done, dating back to June),
 * so they crowded out today's actual work and a resident booking landed ~95
 * rows down — it looked like learner rows weren't rendering at all.
 *   0 = today & upcoming, still open  → soonest first
 *   1 = overdue and still open        → most recent first
 *   2 = finished                      → most recent first
 */
function bucket(status: string, date: string, today: string): 0 | 1 | 2 {
  if (!ACTIONABLE.has(status)) return 2;
  return date >= today ? 0 : 1;
}

interface WorkRow {
  key: string;
  id: string;
  source: 'booking' | 'task';
  date: string;
  time: string | null;
  work: string;
  institutionName: string | null;
  blockId: string | null;
  blockName: string | null;
  floor: string | null;
  room: string | null;
  learnerName: string | null;
  learnerMeta: string | null;
  phone: string | null;
  staff: string | null;
  status: string;
}

function fmtTime(t: string | null | undefined): string | null {
  return t ? String(t).slice(0, 5) : null;
}

function titleCase(s: unknown): string {
  return String(s ?? '—').replace(/_/g, ' ');
}

function statusBadge(status: string) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      );
    case 'in_progress':
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          <Clock className="mr-1 h-3 w-3" />
          In Progress
        </Badge>
      );
    case 'scheduled':
      return (
        <Badge variant="outline">
          <CalendarClock className="mr-1 h-3 w-3" />
          Scheduled
        </Badge>
      );
    case 'booked':
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          <CalendarClock className="mr-1 h-3 w-3" />
          Booked
        </Badge>
      );
    case 'assigned':
      return (
        <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
          <UserCog className="mr-1 h-3 w-3" />
          Assigned
        </Badge>
      );
    case 'missed':
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          <AlertCircle className="mr-1 h-3 w-3" />
          Missed
        </Badge>
      );
    case 'no_show':
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          <UserX className="mr-1 h-3 w-3" />
          No-show
        </Badge>
      );
    case 'rescheduled':
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          <Clock className="mr-1 h-3 w-3" />
          Rescheduled
        </Badge>
      );
    default:
      return <Badge variant="outline">{titleCase(status)}</Badge>;
  }
}

export default function HousekeepingTasksPage() {
  // ── Filters ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [blockFilter, setBlockFilter] = useState('all');
  const [workFilter, setWorkFilter] = useState<'all' | 'booking' | 'task'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const selectedInstitutionId =
    institutionFilter === 'all' ? undefined : institutionFilter;

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canMark =
    permsLoading || isSuperAdmin || can('campus_living.housekeeping.mark_done');
  const canSchedule =
    permsLoading || isSuperAdmin || can('campus_living.housekeeping.schedule');
  const canUpdateTasks = canMark || canSchedule;

  // ── Data ───────────────────────────────────────────────────────────
  const taskFilters = useMemo<TaskFilters | undefined>(() => {
    const f: TaskFilters = {};
    if (blockFilter !== 'all') f.block_id = blockFilter;
    if (dateFrom) f.date_from = dateFrom;
    if (dateTo) f.date_to = dateTo;
    return Object.keys(f).length ? f : undefined;
  }, [blockFilter, dateFrom, dateTo]);

  // pageSize 500: the default 50 silently hid rows on a full work list.
  const tasksQuery = useCleaningTasks(selectedInstitutionId, taskFilters, 1, 500);
  const bookingsQuery = useBookingBoard(selectedInstitutionId, {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });
  const schedulesQuery = useCleaningSchedules(selectedInstitutionId);
  const { data: blocksData } = useHostelBlocks(selectedInstitutionId ?? '');

  // Memoized so its identity is stable — a bare `?? []` would be a new array
  // every render and re-run every hook that depends on it.
  const blocks = useMemo(
    () => (((blocksData as any)?.data ?? []) as any[]),
    [blocksData]
  );

  const blockNames = useMemo(() => {
    const m = new Map<string, string>();
    blocks.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [blocks]);

  // schedule_id → scheduled_time, so generated tasks can show their time.
  const scheduleTimes = useMemo(() => {
    const m = new Map<string, string>();
    (schedulesQuery.data?.data ?? []).forEach((s) => {
      if (s.scheduled_time) m.set(s.id, String(s.scheduled_time));
    });
    return m;
  }, [schedulesQuery.data?.data]);

  const isLoading = tasksQuery.isLoading || bookingsQuery.isLoading;

  // ── Unified rows ───────────────────────────────────────────────────
  const allRows: WorkRow[] = useMemo(() => {
    const bookingRows: WorkRow[] = (bookingsQuery.data ?? []).map((b) => ({
      key: `booking:${b.id}`,
      id: b.id,
      source: 'booking' as const,
      date: String(b.booking_date),
      time: `${fmtTime(b.slot_start)}–${fmtTime(b.slot_end)}`,
      work: 'Room Cleaning',
      institutionName: b.institution_name,
      blockId: b.block_id,
      blockName: b.block_name,
      floor: b.floor != null ? String(b.floor) : null,
      room: b.room_number,
      learnerName: b.learner_name,
      learnerMeta: [b.roll_number, b.program_name].filter(Boolean).join(' · ') || null,
      phone: b.phone,
      staff: b.assigned_staff_name,
      status: String(b.status),
    }));

    const taskRows: WorkRow[] = (tasksQuery.data?.data ?? []).map((t) => ({
      key: `task:${t.id}`,
      id: t.id,
      source: 'task' as const,
      date: String(t.date),
      time: fmtTime(t.schedule_id ? scheduleTimes.get(String(t.schedule_id)) : null),
      work: titleCase(t.cleaning_type),
      institutionName: null,
      blockId: t.block_id ?? null,
      blockName: t.block_id ? blockNames.get(String(t.block_id)) ?? null : 'Common area',
      floor: t.floor_number != null ? String(t.floor_number) : null,
      room: null,
      learnerName: null,
      learnerMeta: null,
      phone: null,
      staff: t.assigned_staff ?? null,
      status: String(t.status),
    }));

    return [...bookingRows, ...taskRows];
  }, [bookingsQuery.data, tasksQuery.data?.data, blockNames, scheduleTimes]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = allRows.filter((r) => {
      if (workFilter !== 'all' && r.source !== workFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (blockFilter !== 'all' && r.blockId !== blockFilter) return false;
      if (dateFrom && r.date < dateFrom) return false;
      if (dateTo && r.date > dateTo) return false;
      if (!q) return true;
      return [
        r.learnerName,
        r.learnerMeta,
        r.phone,
        r.room,
        r.blockName,
        r.staff,
        r.work,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });

    const today = todayLocal();
    return filtered.sort((a, b) => {
      const ba = bucket(a.status, a.date, today);
      const bb = bucket(b.status, b.date, today);
      if (ba !== bb) return ba - bb;
      // Upcoming reads forwards; overdue and finished read backwards.
      const byDate =
        ba === 0 ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      return byDate || String(a.time ?? '').localeCompare(String(b.time ?? ''));
    });
  }, [allRows, search, workFilter, statusFilter, blockFilter, dateFrom, dateTo]);

  const today = todayLocal();
  const openCount = rows.filter((r) => ACTIONABLE.has(r.status)).length;
  const bookingCount = rows.filter((r) => r.source === 'booking').length;
  const overdueCount = rows.filter(
    (r) => ACTIONABLE.has(r.status) && r.date < today
  ).length;
  const taskCount = tasksQuery.data?.count ?? 0;
  const taskShown = tasksQuery.data?.data?.length ?? 0;

  const statusMut = useUpdateCleaningTaskStatus();
  const markMut = useMarkBooking();

  function resetFilters() {
    setSearch('');
    setInstitutionFilter('all');
    setBlockFilter('all');
    setWorkFilter('all');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  }

  const filtersActive =
    !!search ||
    institutionFilter !== 'all' ||
    blockFilter !== 'all' ||
    workFilter !== 'all' ||
    statusFilter !== 'all' ||
    !!dateFrom ||
    !!dateTo;

  return (
    <ContentLayout title="Cleaning Work">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping', href: '/campus-living/housekeeping' },
          { label: 'Cleaning Work' },
        ]}
      />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            Cleaning Work
          </h1>
          <p className="text-muted-foreground">
            Resident room-cleaning bookings and scheduled block cleaning in one
            list. Learner, slot time and room apply to resident bookings; block
            cleaning covers a whole block or floor.
          </p>
        </div>

        {/* Advanced filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="work-search" className="text-xs">
                  Search
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="work-search"
                    className="pl-9"
                    placeholder="Learner, roll no, room, block, staff…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Institution</Label>
                <Select
                  value={institutionFilter}
                  onValueChange={(v) => {
                    setInstitutionFilter(v);
                    setBlockFilter('all');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={institutionsLoading ? 'Loading…' : 'Institution'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Institutions</SelectItem>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Block</Label>
                <Select value={blockFilter} onValueChange={setBlockFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Block" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Blocks</SelectItem>
                    {blocks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Work type</Label>
                <Select
                  value={workFilter}
                  onValueChange={(v) => setWorkFilter(v as 'all' | 'booking' | 'task')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All work</SelectItem>
                    <SelectItem value="booking">Room bookings (learners)</SelectItem>
                    <SelectItem value="task">Block cleaning (scheduled)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {ALL_STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {titleCase(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="date-from" className="text-xs">
                  From date
                </Label>
                <Input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="date-to" className="text-xs">
                  To date
                </Label>
                <Input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-sm text-muted-foreground">
                {rows.length} item{rows.length === 1 ? '' : 's'} · {openCount} open ·{' '}
                <button
                  type="button"
                  className="underline underline-offset-2 hover:text-foreground"
                  onClick={() => setWorkFilter('booking')}
                >
                  {bookingCount} room booking{bookingCount === 1 ? '' : 's'}
                </button>
                {overdueCount > 0 && (
                  <span className="text-amber-700"> · {overdueCount} overdue</span>
                )}
                {taskCount > taskShown && (
                  <span className="text-amber-700">
                    {' '}
                    · showing {taskShown} of {taskCount} scheduled tasks
                  </span>
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                disabled={!filtersActive}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset filters
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-2 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No cleaning work matches these filters</h3>
                <p className="text-sm text-muted-foreground">
                  {filtersActive
                    ? 'Try widening the date range or clearing the filters.'
                    : 'Resident bookings and generated tasks will appear here.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead>Work</TableHead>
                      <TableHead>Block</TableHead>
                      <TableHead>Floor</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead>Learner</TableHead>
                      <TableHead>Assigned Staff</TableHead>
                      <TableHead>Status</TableHead>
                      {canUpdateTasks && (
                        <TableHead className="text-right">Update</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {r.date}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-sm">
                          {r.time ?? '—'}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5 font-medium capitalize">
                            {r.source === 'booking' ? (
                              <Brush className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {r.work}
                          </span>
                        </TableCell>
                        <TableCell>
                          {r.blockName ?? '—'}
                          {r.institutionName && institutionFilter === 'all' && (
                            <p className="text-xs text-muted-foreground">
                              {r.institutionName}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>{r.floor ?? '—'}</TableCell>
                        <TableCell>{r.room ?? '—'}</TableCell>
                        <TableCell>
                          {r.learnerName ? (
                            <div className="min-w-0">
                              <span>{r.learnerName}</span>
                              {r.learnerMeta && (
                                <p className="text-xs text-muted-foreground">
                                  {r.learnerMeta}
                                </p>
                              )}
                              {r.phone && (
                                <p className="text-xs text-muted-foreground">
                                  {r.phone}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Block cleaning
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{r.staff ?? '—'}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        {canUpdateTasks && (
                          <TableCell className="text-right whitespace-nowrap">
                            {r.source === 'task' ? (
                              <Select
                                value={r.status}
                                onValueChange={(v) =>
                                  statusMut.mutate({
                                    id: r.id,
                                    status: v as CleaningTaskStatus,
                                  })
                                }
                                disabled={statusMut.isPending}
                              >
                                <SelectTrigger className="ml-auto w-[150px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TASK_STATUSES.map((s) => (
                                    <SelectItem
                                      key={s}
                                      value={s}
                                      className="capitalize"
                                    >
                                      {titleCase(s)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : ACTIONABLE.has(r.status) && canMark ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-700 hover:text-green-800"
                                  disabled={markMut.isPending}
                                  onClick={() =>
                                    markMut.mutate({
                                      bookingId: r.id,
                                      status: 'completed',
                                    })
                                  }
                                >
                                  {markMut.isPending ? (
                                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  )}
                                  Complete
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-amber-700 hover:text-amber-800"
                                  disabled={markMut.isPending}
                                  onClick={() =>
                                    markMut.mutate({
                                      bookingId: r.id,
                                      status: 'no_show',
                                    })
                                  }
                                >
                                  <UserX className="mr-1 h-3.5 w-3.5" />
                                  No-show
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
