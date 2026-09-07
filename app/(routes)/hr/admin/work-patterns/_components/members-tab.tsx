'use client';

/**
 * Who is currently on this pattern, with a per-row removal flow.
 *
 * Removal is itself an assignment (patternId null) — it goes through the
 * same fn_hr_assign_work_pattern RPC and re-judges attendance the same way,
 * so it opens the same AssignResultDialog an "Assign staff" does.
 */

import { useState } from 'react';
import { Loader2, UserMinus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage } from '@/lib/utils';
import { todayISO } from '@/lib/services/hr/attendance-recompute-service';
import {
  useAssignWorkPattern,
  useWorkPatternMembers,
  type AssignWorkPatternOutcome,
} from '@/hooks/hr/use-work-patterns';
import type { WorkPatternMember, WorkPatternSummary } from '@/types/hr-work-patterns';

import { AssignStaffDialog } from './assign-staff-dialog';
import { AssignResultDialog } from './assign-result-dialog';

interface Props {
  pattern: WorkPatternSummary;
  institutionId: string;
}

/** 'YYYY-MM-DD' -> 'DD/MM/YYYY', done by string split so no viewer timezone
 * can shift the date — see feedback_all_day_utc_dates_render_local_off_by_one. */
function formatDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function MembersTab({ pattern, institutionId }: Props) {
  const { data: members = [], isLoading } = useWorkPatternMembers(pattern.id);
  const assign = useAssignWorkPattern();

  const [removeTarget, setRemoveTarget] = useState<WorkPatternMember | null>(null);
  const [removeEffectiveFrom, setRemoveEffectiveFrom] = useState(todayISO());
  const [assignOpen, setAssignOpen] = useState(false);
  const [outcome, setOutcome] = useState<AssignWorkPatternOutcome | null>(null);

  const weekMissing = pattern.working_days.length === 0;

  const openRemove = (m: WorkPatternMember) => {
    setRemoveTarget(m);
    setRemoveEffectiveFrom(todayISO());
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    try {
      const result = await assign.mutateAsync({
        staffIds: [removeTarget.staff_id],
        patternId: null,
        effectiveFrom: removeEffectiveFrom,
        institutionId,
      });
      setRemoveTarget(null);
      setOutcome(result);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {members.length} member{members.length === 1 ? '' : 's'}
        </p>
        <div className="text-right">
          <Button size="sm" onClick={() => setAssignOpen(true)} disabled={weekMissing}>
            <UserPlus className="mr-2 h-4 w-4" />
            Assign staff
          </Button>
          {weekMissing && (
            <p className="mt-1 text-xs text-muted-foreground">Save the pattern&apos;s week first</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody is on this pattern yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Since</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.assignment_id}>
                <TableCell className="font-medium">{m.staff_code ?? '—'}</TableCell>
                <TableCell>{m.name}</TableCell>
                <TableCell>{m.designation ?? '—'}</TableCell>
                <TableCell>{m.category_name ?? '—'}</TableCell>
                <TableCell>{formatDMY(m.effective_from)}</TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {m.notes ?? '—'}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => openRemove(m)}
                  >
                    <UserMinus className="mr-1 h-3.5 w-3.5" />
                    Remove
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={Boolean(removeTarget)} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removeTarget?.name} from {pattern.name}?</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="remove-effective-from">Effective from</Label>
            <Input
              id="remove-effective-from"
              type="date"
              className="mt-1"
              value={removeEffectiveFrom}
              onChange={(e) => setRemoveEffectiveFrom(e.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              From this date they follow the institution&apos;s general week,
              hours and leave figures instead. Attendance from this date to
              today is re-judged.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveTarget(null)} disabled={assign.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={assign.isPending}>
              {assign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AssignStaffDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        pattern={pattern}
        institutionId={institutionId}
        onAssigned={(result) => {
          setAssignOpen(false);
          setOutcome(result);
        }}
      />

      <AssignResultDialog
        open={Boolean(outcome)}
        onOpenChange={(o) => !o && setOutcome(null)}
        outcome={outcome}
      />
    </div>
  );
}
