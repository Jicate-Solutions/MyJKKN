'use client';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sparkles,
  Plus,
  Search,
  Loader2,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Pencil,
  Trash2,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCleaningSchedules,
  useCreateCleaningSchedule,
  useUpdateCleaningSchedule,
  useDeleteCleaningSchedule,
} from '@/hooks/campus-living/use-hostel-housekeeping';
import type { HostelCleaningSchedule } from '@/lib/services/campus-living/housekeeping-service';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { BlockSelector } from '@/components/campus-living/block-selector';


/**
 * navMeta — documents that this page is invoked via a button/row-click on
 * the parent page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 * Added 2026-04-24 in the matchPaths-only sweep (PR follow-up to #408).
 */
export const navMeta = {
  invokedFrom: '/campus-living',
} as const;

// Real prod schema enum values (verified via Supabase Management API):
// hostel_cleaning_schedules.cleaning_type → cleaning_type_enum
const CLEANING_TYPES = [
  { value: 'daily_sweep', label: 'Daily Sweep' },
  { value: 'daily_mop', label: 'Daily Mop' },
  { value: 'toilet_cleaning', label: 'Toilet Cleaning' },
  { value: 'common_area', label: 'Common Area' },
  { value: 'deep_cleaning', label: 'Deep Cleaning' },
  { value: 'window_cleaning', label: 'Window Cleaning' },
  { value: 'water_tank', label: 'Water Tank' },
  { value: 'disinfection', label: 'Disinfection' },
  { value: 'other', label: 'Other' },
];

// hostel_cleaning_schedules.frequency → pm_frequency_enum
const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
];

/** 'HH:MM:SS' (postgres time) → '6:00 AM'. */
function formatTime12h(t: unknown): string {
  const raw = String(t ?? '');
  const [hStr, mStr] = raw.split(':');
  const h = Number(hStr);
  if (!Number.isFinite(h)) return '—';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr ?? '00'} ${suffix}`;
}

export default function HousekeepingPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<HostelCleaningSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HostelCleaningSchedule | null>(null);

  const deleteMut = useDeleteCleaningSchedule();
  const deactivateMut = useUpdateCleaningSchedule();

  // Mirrors the hostel_cleaning_schedules INSERT/UPDATE/DELETE policies, which
  // gate on campus_living.housekeeping.schedule. Default OPEN while
  // permissions load — isSuperAdmin reads false mid-load.
  const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();
  const canSchedule =
    permsLoading || isSuperAdmin || can('campus_living.housekeeping.schedule');

  const filters = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = {};
    if (blockFilter !== 'all') f.block_id = blockFilter;
    if (activeFilter === 'active') f.is_active = true;
    if (activeFilter === 'inactive') f.is_active = false;
    return Object.keys(f).length ? f : undefined;
  }, [blockFilter, activeFilter]);

  const { data, isLoading } = useCleaningSchedules(institutionId, filters);
  const schedules = useMemo(() => data?.data ?? [], [data?.data]);

  const filteredSchedules = schedules.filter((s) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    // Match against real prod columns (cleaning_type / frequency / assigned_staff)
    // plus legacy aliases (area / cadence / assigned_to) so the search still works
    // in either schema state.
    return (
      String(s.cleaning_type ?? s.area ?? '').toLowerCase().includes(q) ||
      String(s.frequency ?? s.cadence ?? '').toLowerCase().includes(q) ||
      String(s.assigned_staff ?? s.assigned_to ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(
    () => ({
      total: schedules.length,
      active: schedules.filter((s) => s.is_active).length,
      inactive: schedules.filter((s) => !s.is_active).length,
    }),
    [schedules]
  );

  return (
    <ContentLayout title="Housekeeping">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              Housekeeping Schedules
            </h1>
            <p className="text-muted-foreground">
              Recurring cleaning plans across blocks and common areas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/housekeeping/my-work">
                <ClipboardCheck className="mr-2 h-4 w-4" />
                My Work
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/campus-living/housekeeping/bookings">
                <CalendarClock className="mr-2 h-4 w-4" />
                Bookings
              </Link>
            </Button>
            {/* Not gated on profile.institution_id — super admins / multi-
                institution users have none; the dialog asks for one instead. */}
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Schedules</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Inactive</p>
              <p className="text-2xl font-bold text-muted-foreground">{stats.inactive}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search schedules…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <BlockSelector
                institutionId={institutionId}
                value={blockFilter}
                onValueChange={setBlockFilter}
              />
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredSchedules.length === 0 ? (
              <div className="py-16 text-center">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No cleaning schedules yet</h3>
                <p className="text-sm text-muted-foreground">
                  Create a schedule to set up recurring cleaning tasks.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Scheduled Time</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Assigned Staff</TableHead>
                    <TableHead>Status</TableHead>
                    {canSchedule && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium capitalize">
                        {String(s.cleaning_type ?? s.area ?? '—').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="capitalize">
                        {String(s.frequency ?? s.cadence ?? '—').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell>
                        {s.scheduled_time ? (
                          <span className="flex items-center gap-1 text-sm whitespace-nowrap">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" />
                            {formatTime12h(s.scheduled_time)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>{s.floor_number ?? 'Whole block'}</TableCell>
                      <TableCell>
                        {String(s.assigned_staff ?? s.assigned_to ?? '—')}
                      </TableCell>
                      <TableCell>
                        {s.is_active ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <XCircle className="mr-1 h-3 w-3" />
                            Inactive
                          </Badge>
                        )}
                      </TableCell>
                      {canSchedule && (
                        <TableCell className="text-right whitespace-nowrap">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditTarget(s)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-700 hover:text-red-800"
                            onClick={() => setDeleteTarget(s)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateScheduleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        institutionId={institutionId}
      />

      {/* key remounts the form per schedule so its state seeds from props */}
      {editTarget && (
        <EditScheduleDialog
          key={editTarget.id}
          schedule={editTarget}
          onClose={() => setEditTarget(null)}
        />
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this cleaning schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `${String(deleteTarget.cleaning_type ?? '').replace(/_/g, ' ')} · ${String(
                    deleteTarget.frequency ?? ''
                  ).replace(/_/g, ' ')} · ${formatTime12h(deleteTarget.scheduled_time)}`
                : ''}
              . A schedule that has already generated cleaning tasks cannot be
              deleted — deactivating it stops new tasks while keeping the
              history intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={deactivateMut.isPending || deleteMut.isPending}
              onClick={() => {
                if (!deleteTarget) return;
                deactivateMut.mutate(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  { id: deleteTarget.id, payload: { is_active: false } as any },
                  { onSettled: () => setDeleteTarget(null) }
                );
              }}
            >
              {deactivateMut.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Deactivate instead
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <AlertDialogCancel className="mt-0" disabled={deleteMut.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteMut.isPending}
                onClick={(e) => {
                  e.preventDefault();
                  if (!deleteTarget) return;
                  deleteMut.mutate(deleteTarget.id, {
                    onSettled: () => setDeleteTarget(null),
                  });
                }}
              >
                {deleteMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete schedule
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}

interface EditScheduleDialogProps {
  schedule: HostelCleaningSchedule;
  onClose: () => void;
}

/**
 * Edit an existing schedule. Cleaning type is single-select here (unlike
 * create, which can fan out across several types) — an existing row is one
 * type by definition.
 */
function EditScheduleDialog({ schedule, onClose }: EditScheduleDialogProps) {
  const updateMut = useUpdateCleaningSchedule();

  const [blockId, setBlockId] = useState<string>(
    (schedule.block_id as string) ?? 'all'
  );
  const [floorNumber, setFloorNumber] = useState<string>(
    schedule.floor_number != null ? String(schedule.floor_number) : ''
  );
  const [cleaningType, setCleaningType] = useState<string>(
    String(schedule.cleaning_type ?? 'daily_sweep')
  );
  const [frequency, setFrequency] = useState<string>(
    String(schedule.frequency ?? 'daily')
  );
  const [scheduledTime, setScheduledTime] = useState<string>(
    schedule.scheduled_time ? String(schedule.scheduled_time).slice(0, 5) : ''
  );
  const [assignedStaff, setAssignedStaff] = useState<string>(
    String(schedule.assigned_staff ?? '')
  );
  const [isActive, setIsActive] = useState<boolean>(schedule.is_active !== false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMut.mutate(
      {
        id: schedule.id,
        payload: {
          block_id: blockId !== 'all' ? blockId : null,
          floor_number: floorNumber.trim() === '' ? null : Number(floorNumber),
          cleaning_type: cleaningType,
          frequency,
          scheduled_time: scheduledTime || null,
          assigned_staff: assignedStaff || null,
          is_active: isActive,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* Responsive shell: the base DialogContent is vertically centred with a
          -50% translate but sets no max-height and no overflow, so a form this
          tall runs off both edges of a phone/short laptop screen with no way
          to scroll to the Save button. Cap the height, give the body its own
          scroll area, and keep header + footer pinned. */}
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-md flex-col gap-0 rounded-lg p-0">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b p-4 sm:p-6">
            <DialogTitle>Edit Cleaning Schedule</DialogTitle>
            <DialogDescription>
              Changes apply to tasks generated from now on; tasks already
              created keep their original details.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            <div className="space-y-2">
              <Label htmlFor="edit-block">Block (optional)</Label>
              <BlockSelector
                institutionId={(schedule.institution_id as string) ?? ''}
                value={blockId}
                onValueChange={setBlockId}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-floor">Floor (optional)</Label>
              <Input
                id="edit-floor"
                type="number"
                placeholder="Leave blank for the whole block"
                value={floorNumber}
                onChange={(e) => setFloorNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-type">Cleaning type</Label>
              <Select value={cleaningType} onValueChange={setCleaningType}>
                <SelectTrigger id="edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CLEANING_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-frequency">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="edit-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-time">Scheduled time</Label>
              <Input
                id="edit-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
              {scheduledTime && (
                <p className="text-xs text-muted-foreground">
                  Runs at {formatTime12h(scheduledTime)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-staff">Assigned staff (optional)</Label>
              <Input
                id="edit-staff"
                placeholder="e.g. Rajesh K."
                value={assignedStaff}
                onChange={(e) => setAssignedStaff(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-active"
                checked={isActive}
                onCheckedChange={(v) => setIsActive(v === true)}
              />
              <Label htmlFor="edit-active" className="font-normal">
                Active — generate tasks from this schedule
              </Label>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t p-4 sm:p-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateMut.isPending}
              className="w-full sm:w-auto"
            >
              {updateMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CreateScheduleDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  institutionId: string;
}

function CreateScheduleDialog({ open, onOpenChange, institutionId }: CreateScheduleDialogProps) {
  const createMut = useCreateCleaningSchedule();
  // ROOT-CAUSE FIX: profile.institution_id is NULL for super admins and
  // multi-institution users, which used to dead-end creation entirely (the
  // page button was disabled and handleSubmit early-returned). When the
  // profile carries no institution, ask for one here — hostel_cleaning_
  // schedules.institution_id is NOT NULL, so a real id is always required.
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();
  const [pickedInstitution, setPickedInstitution] = useState<string>('');
  const effectiveInstitutionId =
    institutionId || pickedInstitution || (institutions.length === 1 ? institutions[0].id : '');

  const [blockId, setBlockId] = useState<string>('all');
  const [floorNumber, setFloorNumber] = useState<string>('');
  // Multi-select: one schedule row is created per checked cleaning type, all
  // sharing the same block/floor/frequency/time/staff — so a warden can set up
  // the whole day's cleaning in one pass instead of nine separate dialogs.
  const [cleaningTypes, setCleaningTypes] = useState<string[]>(['daily_sweep']);
  const [frequency, setFrequency] = useState<string>('daily');
  const [scheduledTime, setScheduledTime] = useState<string>('06:00');
  const [assignedStaff, setAssignedStaff] = useState<string>('');

  function toggleType(value: string) {
    setCleaningTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
    );
  }

  const resetForm = () => {
    setPickedInstitution('');
    setBlockId('all');
    setFloorNumber('');
    setCleaningTypes(['daily_sweep']);
    setFrequency('daily');
    setScheduledTime('06:00');
    setAssignedStaff('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveInstitutionId || cleaningTypes.length === 0) return;
    // Payload uses real prod column names. Service DTO has index signature so
    // extra/unknown keys flow through to the insert untouched.
    const base = {
      institution_id: effectiveInstitutionId,
      block_id: blockId !== 'all' ? blockId : null,
      // Copied onto every generated task by fn_housekeeping_generate_tasks —
      // left unset, the work list's Floor column is permanently blank.
      floor_number: floorNumber.trim() === '' ? null : Number(floorNumber),
      frequency,
      scheduled_time: scheduledTime || null,
      assigned_staff: assignedStaff || null,
      is_active: true,
    };

    // Sequential, not Promise.all: mutateAsync rejects on the first RLS
    // denial, and awaiting one at a time means a partial failure leaves a
    // clear picture rather than a race of half-applied inserts.
    for (const type of cleaningTypes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await createMut.mutateAsync({ ...base, cleaning_type: type } as any);
    }
    onOpenChange(false);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Same responsive shell as the edit dialog — this form is the taller of
          the two (institution + block + floor + 9 type checkboxes + frequency
          + time + staff), so an unscrollable modal hides the submit button
          outright on a phone. */}
      <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-md flex-col gap-0 rounded-lg p-0">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <DialogHeader className="shrink-0 border-b p-4 sm:p-6">
            <DialogTitle>New Cleaning Schedule</DialogTitle>
            <DialogDescription>
              Set up a recurring cleaning plan for a block or common area.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            {!institutionId && (
              <div className="space-y-2">
                <Label htmlFor="institution">Institution</Label>
                <Select
                  value={pickedInstitution || (institutions.length === 1 ? institutions[0].id : '')}
                  onValueChange={setPickedInstitution}
                >
                  <SelectTrigger id="institution">
                    <SelectValue
                      placeholder={institutionsLoading ? 'Loading institutions…' : 'Select institution'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="block">Block (optional)</Label>
              <BlockSelector
                institutionId={effectiveInstitutionId}
                value={blockId}
                onValueChange={setBlockId}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="floor-number">Floor (optional)</Label>
              <Input
                id="floor-number"
                type="number"
                placeholder="Leave blank for the whole block"
                value={floorNumber}
                onChange={(e) => setFloorNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cleaning types</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto py-0.5 text-xs"
                    onClick={() => setCleaningTypes(CLEANING_TYPES.map((t) => t.value))}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto py-0.5 text-xs"
                    onClick={() => setCleaningTypes([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 rounded-md border p-3 xs:grid-cols-2">
                {CLEANING_TYPES.map((t) => (
                  <div key={t.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`type-${t.value}`}
                      checked={cleaningTypes.includes(t.value)}
                      onCheckedChange={() => toggleType(t.value)}
                    />
                    <Label htmlFor={`type-${t.value}`} className="text-sm font-normal">
                      {t.label}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {cleaningTypes.length === 0
                  ? 'Pick at least one cleaning type.'
                  : `Creates ${cleaningTypes.length} schedule${
                      cleaningTypes.length === 1 ? '' : 's'
                    }, all at the same time and frequency.`}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map((f) => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="scheduled-time">Scheduled time</Label>
              <Input
                id="scheduled-time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
              {scheduledTime && (
                <p className="text-xs text-muted-foreground">
                  Runs at {formatTime12h(scheduledTime)}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="assigned-staff">Assigned staff (optional)</Label>
              <Input
                id="assigned-staff"
                placeholder="e.g. Rajesh K."
                value={assignedStaff}
                onChange={(e) => setAssignedStaff(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t p-4 sm:p-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={
                createMut.isPending ||
                !effectiveInstitutionId ||
                cleaningTypes.length === 0
              }
            >
              {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {cleaningTypes.length > 1
                ? `Create ${cleaningTypes.length} schedules`
                : 'Create schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
