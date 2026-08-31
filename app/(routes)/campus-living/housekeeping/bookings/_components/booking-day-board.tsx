'use client';

// ============================================================================
// Housekeeping booking day board (staff surface)
// ----------------------------------------------------------------------------
// Shows every slot booking for one institution + one day via
// fn_housekeeping_booking_board (useBookingBoard). Staff mark bookings
// completed / no-show through fn_housekeeping_mark_booking (useMarkBooking) —
// the RPC enforces campus_living.housekeeping permissions server-side, same
// as the rest of the module (existing housekeeping pages carry no page-level
// PermissionGuard; layout's CampusLivingResidentGuard + RLS/RPC gates apply).
// Spec: specs/housekeeping-slot-booking-spec-2026-06-10.md §"Agent D".
// ============================================================================

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldAlert,
  Sparkles,
  UserCog,
  UserX,
  XCircle,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { AssignBookingDialog } from './assign-booking-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BlockSelector } from '@/components/campus-living/block-selector';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBookingBoard,
  useMarkBooking,
} from '@/hooks/campus-living/use-housekeeping-bookings';
import {
  useCleaningTasks,
  useUpdateCleaningTaskStatus,
} from '@/hooks/campus-living/use-hostel-housekeeping';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { CleaningTaskStatus } from '@/lib/services/campus-living/housekeeping-service';
import type {
  BookingBoardRow,
  MarkableBookingStatus,
} from '@/lib/services/campus-living/housekeeping-booking-service';

/** cleaning_task_status_enum — the only values the column accepts. */
const TASK_STATUSES: CleaningTaskStatus[] = [
  'scheduled',
  'in_progress',
  'completed',
  'missed',
  'rescheduled',
];

// ── Local date helpers (board navigates whole days, local time) ────────────
function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y, m - 1, d + delta);
  return toLocalDateString(next);
}

/** 'HH:MM:SS' (postgres time) → 'HH:MM'. */
function fmtTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : '—';
}

function statusBadge(status: string) {
  switch (status) {
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
    case 'completed':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Completed
        </Badge>
      );
    case 'no_show':
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          <UserX className="mr-1 h-3 w-3" />
          No-show
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          <XCircle className="mr-1 h-3 w-3" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

interface PendingMark {
  booking: BookingBoardRow;
  status: MarkableBookingStatus;
}

export function BookingDayBoard() {
  // 'all' (default) shows every booking, actionable rows first; 'day'
  // narrows to one date (the old behavior).
  const [mode, setMode] = useState<'all' | 'day'>('all');
  const [date, setDate] = useState<string>(() => toLocalDateString(new Date()));
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [pendingMark, setPendingMark] = useState<PendingMark | null>(null);
  const [assignTarget, setAssignTarget] = useState<BookingBoardRow | null>(null);

  // Institution scope. Defaults to ALL accessible institutions: the board used
  // to be hard-pinned to profiles.institution_id, which showed a super admin
  // "Total 0" while every booking sat in another college. Never branch on
  // isSuperAdmin for scope — pass the selection and let the RPC gate rows.
  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const selectedInstitutionId =
    institutionFilter === 'all' ? undefined : institutionFilter;

  const board = useBookingBoard(
    selectedInstitutionId,
    mode === 'day' ? { date } : {}
  );
  const markMut = useMarkBooking();
  const taskStatusMut = useUpdateCleaningTaskStatus();

  // Mirror the server gates (mark → '.mark_done', assign → '.schedule') so
  // non-holders don't see dead buttons. While permissions are still LOADING,
  // default OPEN: isSuperAdmin reads false during the load (the known
  // super-admin scope race), and hiding the buttons then would lock super
  // admins out of a control the RPC would happily allow. The RPC stays the
  // real gate either way.
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canMark =
    permsLoading || isSuperAdmin || can('campus_living.housekeeping.mark_done');
  const canSchedule =
    permsLoading || isSuperAdmin || can('campus_living.housekeeping.schedule');
  // hostel_cleaning_tasks UPDATE policy accepts either key.
  const canUpdateTasks = canMark || canSchedule;

  // The day's scheduled-cleaning tasks (generated from recurring schedules by
  // fn_housekeeping_generate_tasks) — shown alongside resident bookings so the
  // board is the complete picture of the day's cleaning work. In "all
  // bookings" mode this section pins to today.
  const tasksDate = mode === 'day' ? date : toLocalDateString(new Date());
  const tasksQuery = useCleaningTasks(selectedInstitutionId, {
    date_from: tasksDate,
    date_to: tasksDate,
  });
  const { data: blocksData } = useHostelBlocks(selectedInstitutionId ?? '');
  const blockNames = useMemo(() => {
    const m = new Map<string, string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((blocksData as any)?.data ?? []).forEach((b: any) => m.set(b.id, b.name));
    return m;
  }, [blocksData]);
  const dayTasks = useMemo(() => {
    const all = tasksQuery.data?.data ?? [];
    return blockFilter === 'all' ? all : all.filter((t) => t.block_id === blockFilter);
  }, [tasksQuery.data?.data, blockFilter]);

  const rows = useMemo(() => {
    const all = board.data ?? [];
    const filtered =
      blockFilter === 'all' ? all : all.filter((r) => r.block_id === blockFilter);
    // Actionable first (matches the RPC's ordering; re-applied here because
    // the block filter rebuilds the array): live statuses, then date, slot.
    const liveRank = (s: unknown) => (s === 'booked' || s === 'assigned' ? 0 : 1);
    return [...filtered].sort(
      (a, b) =>
        liveRank(a.status) - liveRank(b.status) ||
        String(a.booking_date).localeCompare(String(b.booking_date)) ||
        a.slot_start.localeCompare(b.slot_start) ||
        String(a.block_name ?? '').localeCompare(String(b.block_name ?? ''))
    );
  }, [board.data, blockFilter]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      booked: rows.filter((r) => r.status === 'booked').length,
      assigned: rows.filter((r) => r.status === 'assigned').length,
      completed: rows.filter((r) => r.status === 'completed').length,
      noShow: rows.filter((r) => r.status === 'no_show').length,
    }),
    [rows]
  );

  const isToday = date === toLocalDateString(new Date());

  function confirmMark() {
    if (!pendingMark) return;
    markMut.mutate(
      { bookingId: pendingMark.booking.id, status: pendingMark.status },
      { onSettled: () => setPendingMark(null) }
    );
  }

  return (
    <div className="space-y-6">
      {/* Date navigation + block filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={mode === 'all' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setMode('all')}
              >
                All bookings
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous day"
                onClick={() => {
                  setMode('day');
                  setDate((d) => addDays(d, -1));
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) {
                    setMode('day');
                    setDate(e.target.value);
                  }
                }}
                className={`w-[160px] ${mode === 'all' ? 'opacity-60' : ''}`}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Next day"
                onClick={() => {
                  setMode('day');
                  setDate((d) => addDays(d, 1));
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant={mode === 'day' && isToday ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => {
                  setMode('day');
                  setDate(toLocalDateString(new Date()));
                }}
                disabled={mode === 'day' && isToday}
              >
                Today
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={institutionFilter}
                onValueChange={(v) => {
                  setInstitutionFilter(v);
                  setBlockFilter('all');
                }}
              >
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue
                    placeholder={
                      institutionsLoading ? 'Loading institutions…' : 'Institution'
                    }
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
              <BlockSelector
                institutionId={selectedInstitutionId ?? ''}
                value={blockFilter}
                onValueChange={setBlockFilter}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Day stats */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Booked</p>
            <p className="text-2xl font-bold text-blue-600">{stats.booked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Assigned</p>
            <p className="text-2xl font-bold text-purple-600">{stats.assigned}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground">No-shows</p>
            <p className="text-2xl font-bold text-amber-600">{stats.noShow}</p>
          </CardContent>
        </Card>
      </div>

      {/* Scheduled cleaning for the day (from recurring schedules) */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="font-medium flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              Scheduled cleaning · {dayTasks.length}
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/housekeeping/tasks">Manage on Tasks page</Link>
            </Button>
          </div>
          {tasksQuery.isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-8 w-full" />
            </div>
          ) : dayTasks.length === 0 ? (
            <p className="px-4 pb-4 pt-2 text-sm text-muted-foreground">
              No scheduled cleaning due on {tasksDate}. Recurring plans created on the{' '}
              <Link href="/campus-living/housekeeping" className="underline">
                Housekeeping page
              </Link>{' '}
              appear here on their due days.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cleaning Type</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Assigned Staff</TableHead>
                  <TableHead>Status</TableHead>
                  {canUpdateTasks && <TableHead className="text-right">Update</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dayTasks.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium capitalize">
                      {String(t.cleaning_type ?? '—').replace(/_/g, ' ')}
                    </TableCell>
                    <TableCell>
                      {t.block_id ? blockNames.get(t.block_id) ?? '—' : 'Common area'}
                    </TableCell>
                    <TableCell>{t.floor_number ?? '—'}</TableCell>
                    <TableCell>{t.assigned_staff ?? '—'}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          t.status === 'completed'
                            ? 'border-green-400 text-green-700'
                            : t.status === 'missed'
                              ? 'border-red-400 text-red-700'
                              : ''
                        }
                      >
                        {String(t.status ?? '—').replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    {canUpdateTasks && (
                      <TableCell className="text-right">
                        <Select
                          value={String(t.status)}
                          onValueChange={(v) =>
                            taskStatusMut.mutate({
                              id: t.id,
                              status: v as CleaningTaskStatus,
                            })
                          }
                          disabled={taskStatusMut.isPending}
                        >
                          <SelectTrigger className="ml-auto w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TASK_STATUSES.map((s) => (
                              <SelectItem key={s} value={s} className="capitalize">
                                {s.replace(/_/g, ' ')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resident slot bookings table */}
      <Card>
        <CardContent className="p-0">
          {board.isLoading ? (
            <div className="space-y-2 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : board.error ? (
            <div className="p-6">
              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Could not load the booking board</AlertTitle>
                <AlertDescription>
                  {(board.error as Error).message}
                </AlertDescription>
              </Alert>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <CalendarClock className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium">
                {mode === 'all' ? 'No bookings yet.' : 'No bookings for this day yet.'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {mode === 'all'
                  ? 'Resident slot bookings will appear here.'
                  : `Resident slot bookings for ${date} will appear here.`}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Slot</TableHead>
                  <TableHead>Block</TableHead>
                  <TableHead>Floor</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead>Assigned to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const live = row.status === 'booked' || row.status === 'assigned';
                  const learnerMeta = [row.roll_number, row.program_name]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {String(row.booking_date)}
                      </TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">
                        {fmtTime(row.slot_start)}–{fmtTime(row.slot_end)}
                      </TableCell>
                      <TableCell>
                        {row.block_name ?? '—'}
                        {institutionFilter === 'all' && row.institution_name && (
                          <p className="text-xs text-muted-foreground">
                            {row.institution_name}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{row.floor ?? '—'}</TableCell>
                      <TableCell>{row.room_number ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarImage src={row.photo_url ?? undefined} alt="" />
                            <AvatarFallback className="text-xs">
                              {(row.learner_name ?? '—')
                                .split(/\s+/)
                                .map((p) => p[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <span>{row.learner_name ?? '—'}</span>
                            {learnerMeta && (
                              <p className="text-xs text-muted-foreground">{learnerMeta}</p>
                            )}
                            {row.phone && (
                              <p className="text-xs text-muted-foreground">{row.phone}</p>
                            )}
                            {row.notes && (
                              <p className="text-xs text-muted-foreground max-w-[260px] truncate">
                                {row.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.assigned_staff_name ?? (
                          <span className="text-xs text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(String(row.status))}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {!live ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : !canMark && !canSchedule ? (
                          <span className="text-xs text-muted-foreground">View only</span>
                        ) : (
                          <>
                            {canSchedule && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-purple-700 hover:text-purple-800"
                                disabled={markMut.isPending}
                                onClick={() => setAssignTarget(row)}
                              >
                                <UserCog className="mr-1 h-3.5 w-3.5" />
                                {row.status === 'assigned' ? 'Re-assign' : 'Assign'}
                              </Button>
                            )}
                            {canMark && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-700 hover:text-green-800"
                                  disabled={markMut.isPending}
                                  onClick={() =>
                                    setPendingMark({ booking: row, status: 'completed' })
                                  }
                                >
                                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                  Complete
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-amber-700 hover:text-amber-800"
                                  disabled={markMut.isPending}
                                  onClick={() =>
                                    setPendingMark({ booking: row, status: 'no_show' })
                                  }
                                >
                                  <UserX className="mr-1 h-3.5 w-3.5" />
                                  No-show
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Assign / re-assign dialog */}
      <AssignBookingDialog
        booking={assignTarget}
        onOpenChange={(open) => {
          if (!open) setAssignTarget(null);
        }}
      />

      {/* Confirm mark dialog (toast feedback comes from useMarkBooking) */}
      <AlertDialog
        open={pendingMark !== null}
        onOpenChange={(open) => {
          if (!open) setPendingMark(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMark?.status === 'completed'
                ? 'Mark this cleaning as completed?'
                : 'Mark this booking as a no-show?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMark
                ? `${fmtTime(pendingMark.booking.slot_start)}–${fmtTime(
                    pendingMark.booking.slot_end
                  )} · ${pendingMark.booking.block_name ?? 'Block —'} · Room ${
                    pendingMark.booking.room_number ?? '—'
                  } · ${pendingMark.booking.learner_name ?? 'Resident —'}`
                : ''}
              {pendingMark?.status === 'no_show' &&
                ' The slot stays counted against the resident’s weekly quota.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open while the mutation runs; onSettled closes it.
                e.preventDefault();
                confirmMark();
              }}
              disabled={markMut.isPending}
            >
              {markMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {pendingMark?.status === 'completed' ? 'Mark complete' : 'Mark no-show'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
