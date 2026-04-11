'use client';

import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Plus,
  Pencil,
  Trash2,
  Shuffle,
  Eraser,
  MapPin,
  Users,
  Loader2,
} from 'lucide-react';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { MarathonAccessDenied } from '../../_components/marathon-access-denied';
import {
  useMarathonStalls,
  useCreateStall,
  useUpdateStall,
  useDeleteStall,
  useAutoAssignStalls,
  useClearStallAssignments,
} from '@/hooks/events/marathon/use-marathon-stalls';
import { useOpsStats } from '@/hooks/events/marathon/use-marathon-ops';
import type { EventStall, CreateEventStallDto, UpdateEventStallDto } from '@/types/events-marathon';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface StallFormData {
  stall_name: string;
  stall_code: string;
  capacity: string;
  location_note: string;
  sort_order: string;
}

const EMPTY_FORM: StallFormData = {
  stall_name: '',
  stall_code: '',
  capacity: '',
  location_note: '',
  sort_order: '0',
};

// ============================================================================
// Stats Cards
// ============================================================================

function StatsCards({ eventId }: { eventId: string }) {
  const { data: stats, isLoading } = useOpsStats(eventId);

  if (isLoading || !stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-16 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const totalAssigned = stats.stall_breakdown.reduce((sum, s) => sum + s.assigned, 0);
  const unassigned = stats.total - totalAssigned;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <Card>
        <CardContent className="pt-4 pb-3 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-blue-500" />
            Total Participants
          </div>
          <div className="text-2xl font-bold">{stats.total.toLocaleString('en-IN')}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-green-500" />
            Assigned to Stalls
          </div>
          <div className="text-2xl font-bold">{totalAssigned.toLocaleString('en-IN')}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 pb-3 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-amber-500" />
            Unassigned
          </div>
          <div className="text-2xl font-bold text-amber-600">{unassigned.toLocaleString('en-IN')}</div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Fill Badge
// ============================================================================

function FillBadge({ assigned, capacity }: { assigned: number; capacity: number }) {
  const pct = capacity > 0 ? Math.round((assigned / capacity) * 100) : 0;

  const variant = pct > 95 ? 'destructive' : pct >= 80 ? 'outline' : 'secondary';
  const colorClass =
    pct > 95
      ? ''
      : pct >= 80
        ? 'border-amber-500 text-amber-600 dark:text-amber-400'
        : 'text-green-600 dark:text-green-400';

  return (
    <Badge variant={variant} className={cn('text-xs', colorClass)}>
      {pct}%
    </Badge>
  );
}

// ============================================================================
// Stall Form Dialog
// ============================================================================

function StallFormDialog({
  open,
  onOpenChange,
  editStall,
  eventId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editStall: EventStall | null;
  eventId: string;
}) {
  const createMutation = useCreateStall();
  const updateMutation = useUpdateStall();
  const isEditing = !!editStall;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const [form, setForm] = useState<StallFormData>(EMPTY_FORM);

  // Reset form when dialog opens
  const handleOpenChange = useCallback(
    (val: boolean) => {
      if (val && editStall) {
        setForm({
          stall_name: editStall.stall_name,
          stall_code: editStall.stall_code,
          capacity: String(editStall.capacity),
          location_note: editStall.location_note || '',
          sort_order: String(editStall.sort_order),
        });
      } else if (val) {
        setForm(EMPTY_FORM);
      }
      onOpenChange(val);
    },
    [editStall, onOpenChange],
  );

  // Sync form when editStall changes while dialog is open
  useState(() => {
    if (open && editStall) {
      setForm({
        stall_name: editStall.stall_name,
        stall_code: editStall.stall_code,
        capacity: String(editStall.capacity),
        location_note: editStall.location_note || '',
        sort_order: String(editStall.sort_order),
      });
    }
  });

  const handleSubmit = () => {
    if (!form.stall_name.trim() || !form.stall_code.trim() || !form.capacity) {
      toast.error('Please fill in all required fields');
      return;
    }

    const capacity = parseInt(form.capacity, 10);
    if (isNaN(capacity) || capacity < 1) {
      toast.error('Capacity must be at least 1');
      return;
    }

    if (isEditing && editStall) {
      const dto: UpdateEventStallDto = {
        stall_name: form.stall_name.trim(),
        stall_code: form.stall_code.trim().toUpperCase(),
        capacity,
        location_note: form.location_note.trim() || undefined,
        sort_order: parseInt(form.sort_order, 10) || 0,
      };
      updateMutation.mutate(
        { id: editStall.id, dto, eventId },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      const dto: CreateEventStallDto = {
        event_id: eventId,
        stall_name: form.stall_name.trim(),
        stall_code: form.stall_code.trim().toUpperCase(),
        capacity,
        location_note: form.location_note.trim() || undefined,
        sort_order: parseInt(form.sort_order, 10) || 0,
      };
      createMutation.mutate(dto, { onSuccess: () => onOpenChange(false) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Stall' : 'Add Stall'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="stall_name">
              Stall Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="stall_name"
              placeholder="e.g., Stall A"
              value={form.stall_name}
              onChange={(e) => setForm((f) => ({ ...f, stall_name: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stall_code">
                Stall Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="stall_code"
                placeholder="e.g., A, B, C1"
                value={form.stall_code}
                onChange={(e) =>
                  setForm((f) => ({ ...f, stall_code: e.target.value.toUpperCase() }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capacity">
                Capacity <span className="text-destructive">*</span>
              </Label>
              <Input
                id="capacity"
                type="number"
                min={1}
                placeholder="e.g., 100"
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location_note">Location Note</Label>
            <Input
              id="location_note"
              placeholder="e.g., Near Gate 2"
              value={form.location_note}
              onChange={(e) => setForm((f) => ({ ...f, location_note: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sort_order">Sort Order</Label>
            <Input
              id="sort_order"
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function StallsManagementPage() {
  const params = useParams();
  const eventId = params.id as string;
  const access = useMarathonAccess();

  // Data
  const { data: stalls, isLoading: stallsLoading } = useMarathonStalls(eventId);
  const { data: stats } = useOpsStats(eventId);

  const { data: event } = useQuery({
    queryKey: ['marathon-event-name', eventId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data } = await (supabase as any)
        .from('events')
        .select('name')
        .eq('id', eventId)
        .single();
      return data;
    },
    enabled: !!eventId,
  });
  const eventName = event?.name ?? 'Marathon';

  // Mutations
  const deleteMutation = useDeleteStall();
  const autoAssignMutation = useAutoAssignStalls();
  const clearMutation = useClearStallAssignments();

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EventStall | null>(null);

  // Confirmation dialogs
  const [deleteTarget, setDeleteTarget] = useState<EventStall | null>(null);
  const [showAutoAssign, setShowAutoAssign] = useState(false);
  const [showClear, setShowClear] = useState(false);

  // Build stall breakdown lookup from stats
  const breakdownMap = useMemo(() => {
    const map = new Map<string, { assigned: number; checked_in: number }>();
    if (stats?.stall_breakdown) {
      for (const s of stats.stall_breakdown) {
        map.set(s.stall_id, { assigned: s.assigned, checked_in: s.checked_in });
      }
    }
    return map;
  }, [stats]);

  const handleEdit = (stall: EventStall) => {
    setEditTarget(stall);
    setFormOpen(true);
  };

  const handleAddNew = () => {
    setEditTarget(null);
    setFormOpen(true);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id, eventId },
      { onSuccess: () => setDeleteTarget(null) },
    );
  };

  const handleAutoAssign = () => {
    autoAssignMutation.mutate(eventId, {
      onSuccess: () => setShowAutoAssign(false),
    });
  };

  const handleClear = () => {
    clearMutation.mutate(eventId, {
      onSuccess: () => setShowClear(false),
    });
  };

  const sortedStalls = useMemo(() => {
    if (!stalls) return [];
    return [...stalls].sort((a, b) => a.sort_order - b.sort_order);
  }, [stalls]);

  // Block non-admin users
  if (!access.isLoading && !access.canManage) {
    return <MarathonAccessDenied title="Stall Management" eventId={eventId} />;
  }

  return (
    <ContentLayout title={`${eventName} - Stall Management`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: eventName, href: `/events/marathon/${eventId}/dashboard` },
          { label: 'Stalls' },
        ]}
      />

      <div className="space-y-4 mt-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Stall Management</h2>
          <p className="text-sm text-muted-foreground">
            Configure stalls and assign participants for event-day operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAutoAssign(true)}
            disabled={autoAssignMutation.isPending || !stalls?.length}
          >
            {autoAssignMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shuffle className="mr-2 h-4 w-4" />
            )}
            Auto Assign
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowClear(true)}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Eraser className="mr-2 h-4 w-4" />
            )}
            Clear Assignments
          </Button>
        </div>
      </div>

      {/* Stats */}
      <StatsCards eventId={eventId} />

      {/* Stalls Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Stalls</h3>
          <Button size="sm" onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add Stall
          </Button>
        </div>

        {stallsLoading ? (
          <Card>
            <CardContent className="py-10">
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading stalls...
              </div>
            </CardContent>
          </Card>
        ) : !sortedStalls.length ? (
          <Card>
            <CardContent className="py-10">
              <div className="text-center space-y-2">
                <MapPin className="mx-auto h-10 w-10 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No stalls created yet. Add your first stall to get started.
                </p>
                <Button size="sm" variant="outline" onClick={handleAddNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Stall
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Order</TableHead>
                  <TableHead>Stall Name</TableHead>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead className="w-24 text-right">Capacity</TableHead>
                  <TableHead className="w-24 text-right">Assigned</TableHead>
                  <TableHead className="w-28 text-right">Checked In</TableHead>
                  <TableHead className="w-20 text-right">Fill %</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStalls.map((stall) => {
                  const bd = breakdownMap.get(stall.id);
                  const assigned = bd?.assigned ?? 0;
                  const checkedIn = bd?.checked_in ?? 0;

                  return (
                    <TableRow key={stall.id}>
                      <TableCell className="text-muted-foreground">{stall.sort_order}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{stall.stall_name}</span>
                          {stall.location_note && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({stall.location_note})
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{stall.stall_code}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{stall.capacity}</TableCell>
                      <TableCell className="text-right">{assigned}</TableCell>
                      <TableCell className="text-right">{checkedIn}</TableCell>
                      <TableCell className="text-right">
                        <FillBadge assigned={assigned} capacity={stall.capacity} />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(stall)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(stall)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <StallFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editStall={editTarget}
        eventId={eventId}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Stall</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This will remove stall assignments for participants assigned to{' '}
              <strong>{deleteTarget?.stall_name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto Assign Confirmation */}
      <AlertDialog open={showAutoAssign} onOpenChange={setShowAutoAssign}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Auto Assign Participants</AlertDialogTitle>
            <AlertDialogDescription>
              This will reassign ALL participants to stalls based on BIB number order and stall
              capacity. Existing assignments will be overwritten. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={autoAssignMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAutoAssign} disabled={autoAssignMutation.isPending}>
              {autoAssignMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Assign All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Assignments Confirmation */}
      <AlertDialog open={showClear} onOpenChange={setShowClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear All Stall Assignments</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all stall assignments for every participant. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              disabled={clearMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </ContentLayout>
  );
}
