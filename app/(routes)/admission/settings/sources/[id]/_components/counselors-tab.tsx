'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pause, Play, Pencil, Trash2, Users, Calendar, Gauge } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  CounselorSourceService,
  type CounselorSourceAssignment,
} from '@/lib/services/admission/counselor-source-service';
import { usePermissions } from '@/hooks/use-permissions';
import { CounselorPickerDialog } from './counselor-picker-dialog';
import { CounselorConfigDialog } from './counselor-config-dialog';

const ROLE_LABEL: Record<string, string> = {
  admission_counselor: 'Admission',
  expo_counselor: 'Expo',
  learner_counselor: 'Learner',
  staff_counselor: 'Staff',
};

const ROLE_BADGE: Record<string, string> = {
  admission_counselor: 'bg-blue-100 text-blue-700 border-blue-200',
  expo_counselor: 'bg-purple-100 text-purple-700 border-purple-200',
  learner_counselor: 'bg-amber-100 text-amber-700 border-amber-200',
  staff_counselor: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

interface CounselorsTabProps {
  sourceId: string;
  institutionId?: string | null;
}

export function CounselorsTab({ sourceId, institutionId }: CounselorsTabProps) {
  const queryClient = useQueryClient();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManage =
    isSuperAdmin || canAccess('admission.settings.sources', 'manage');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<CounselorSourceAssignment | null>(null);
  const [removing, setRemoving] = useState<CounselorSourceAssignment | null>(null);

  const {
    data: assignments,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['counselor-source-assignments', sourceId],
    queryFn: () => CounselorSourceService.listForSource(sourceId),
  });

  const excludeIds = useMemo(
    () => (assignments ?? []).map((a) => a.counselor_id),
    [assignments]
  );

  const detachMutation = useMutation({
    mutationFn: async (id: string) => CounselorSourceService.detach(id),
    onSuccess: () => {
      toast.success('Counselor removed from source');
      queryClient.invalidateQueries({
        queryKey: ['counselor-source-assignments', sourceId],
      });
      queryClient.invalidateQueries({ queryKey: ['admission-sources-master'] });
      setRemoving(null);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to remove'),
  });

  const togglePauseMutation = useMutation({
    mutationFn: async ({ id, paused }: { id: string; paused: boolean }) =>
      CounselorSourceService.setPaused(id, paused),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['counselor-source-assignments', sourceId],
      });
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to toggle pause'),
  });

  const formatWindow = (a: CounselorSourceAssignment): string => {
    const f = a.effective_from ? format(new Date(a.effective_from), 'MMM d, yyyy') : null;
    const t = a.effective_to ? format(new Date(a.effective_to), 'MMM d, yyyy') : null;
    if (!f && !t) return 'Always';
    if (f && !t) return `From ${f}`;
    if (!f && t) return `Until ${t}`;
    return `${f} → ${t}`;
  };

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Counselors assigned ({assignments?.length ?? 0})
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Counselors here receive auto-assigned leads from this source. You can
              tune the daily cap, date window, weight, and pause per counselor.
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Assign counselor
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Failed to load assignments. {(error as Error).message}
          </div>
        )}

        {!isLoading && (assignments?.length ?? 0) === 0 && (
          <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
            <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
            No counselors assigned yet.
            {canManage && (
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Assign your first counselor
                </Button>
              </div>
            )}
          </div>
        )}

        {!isLoading && (assignments?.length ?? 0) > 0 && (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Counselor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">
                    <Calendar className="inline h-3.5 w-3.5 mr-1" />
                    Window
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    <Gauge className="inline h-3.5 w-3.5 mr-1" />
                    Daily cap
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Weight</TableHead>
                  <TableHead className="hidden lg:table-cell">Load</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(assignments ?? []).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {a.counselor?.name ?? 'Unknown'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.counselor?.designation ? `${a.counselor.designation} · ` : ''}
                          {a.counselor?.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {a.role_key && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${ROLE_BADGE[a.role_key] ?? ''}`}
                        >
                          {ROLE_LABEL[a.role_key] ?? a.role_key}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {formatWindow(a)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell tabular-nums text-sm">
                      {a.max_leads_per_day ?? '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell tabular-nums text-sm">
                      {Number(a.priority_weight).toFixed(1)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell tabular-nums text-sm">
                      <span>
                        {a.counselor?.current_leads ?? 0}
                        {a.counselor?.max_leads ? ` / ${a.counselor.max_leads}` : ''}
                      </span>
                    </TableCell>
                    <TableCell>
                      {a.is_paused ? (
                        <Badge variant="outline" className="text-orange-700 border-orange-200">
                          Paused
                        </Badge>
                      ) : (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={!canManage}
                          title={a.is_paused ? 'Resume' : 'Pause'}
                          onClick={() =>
                            togglePauseMutation.mutate({
                              id: a.id,
                              paused: !a.is_paused,
                            })
                          }
                        >
                          {a.is_paused ? (
                            <Play className="h-3.5 w-3.5" />
                          ) : (
                            <Pause className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={!canManage}
                          title="Edit"
                          onClick={() => setEditing(a)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          disabled={!canManage}
                          title="Remove"
                          onClick={() => setRemoving(a)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <CounselorPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        sourceId={sourceId}
        institutionId={institutionId}
        excludeCounselorIds={excludeIds}
      />

      <CounselorConfigDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        sourceId={sourceId}
        assignment={editing}
      />

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing?.counselor?.name ?? 'this counselor'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They will stop receiving auto-assigned leads from this source.
              Existing leads they own keep their current assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removing && detachMutation.mutate(removing.id)}
              disabled={detachMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {detachMutation.isPending ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
