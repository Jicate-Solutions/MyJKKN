'use client';

/**
 * Delete one or several salary registers — super admin only, irreversible,
 * typed confirmation.
 *
 * The dialog states what is being removed in the figures HR reads (institution,
 * month, payable lines, net total — per register and in total) and arms the
 * button only once DELETE is typed, the same shape as the recruitment purge.
 * It is rendered only when the page has confirmed profile.is_super_admin; the
 * route and the DELETE policies refuse everyone else regardless, so a 403 here
 * is the server's answer.
 *
 * A SELECTION IS DELETED ONE REGISTER AT A TIME through the single-run route,
 * not a bulk endpoint: every delete then goes through the one server gate and
 * the one activity-log line per register, and a failure on the third does not
 * roll back the first two — it is reported as "2 of 3 deleted" with the reason,
 * which is what actually happened.
 *
 * A predecessor a run had superseded STAYS superseded — the copy says so,
 * because "the month has no register in force now" is the one consequence a
 * super admin might not expect.
 */

import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/utils';
import { useDeleteSalaryRegisterRun } from '@/hooks/hr/payroll/use-salary-register';
import type { HRSalaryRegisterRun } from '@/types/hr-payroll';
import { MONTHS, inr } from './run-columns';

interface Props {
  /** The runs to delete; an empty list closes the dialog. */
  runs: HRSalaryRegisterRun[];
  orgNameById: Map<string, string>;
  onClose: () => void;
  /** Fired once at least one register was actually removed. */
  onDeleted?: () => void;
}

const monthOf = (r: HRSalaryRegisterRun) => `${MONTHS[r.period_month - 1]} ${r.period_year}`;

export function DeleteRunDialog({ runs, orgNameById, onClose, onDeleted }: Props) {
  const remove = useDeleteSalaryRegisterRun();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const armed = confirm.trim().toUpperCase() === 'DELETE';

  const nameOf = (r: HRSalaryRegisterRun) =>
    orgNameById.get(r.hr_organization_id) ?? r.hr_organization_id;

  const close = () => {
    setConfirm('');
    onClose();
  };

  const many = runs.length > 1;
  const liveCount = runs.filter((r) => r.superseded_at === null).length;
  const totalNet = runs.reduce((t, r) => t + r.total_net, 0);
  const totalLines = runs.reduce((t, r) => t + r.included_count, 0);

  const handleDelete = async () => {
    if (runs.length === 0 || !armed || busy) return;
    setBusy(true);
    const failures: string[] = [];
    let done = 0;
    try {
      for (const run of runs) {
        try {
          await remove.mutateAsync({ runId: run.id });
          done += 1;
        } catch (err) {
          failures.push(`${nameOf(run)} · ${monthOf(run)}: ${getErrorMessage(err)}`);
        }
      }
    } finally {
      setBusy(false);
    }

    if (done > 0) onDeleted?.();

    if (failures.length === 0) {
      toast.success(
        many
          ? `Deleted ${done} registers`
          : `Deleted the ${monthOf(runs[0])} register for ${nameOf(runs[0])}`,
        { description: `${totalLines} payable lines, net ${inr(totalNet)} removed.` },
      );
      close();
      return;
    }

    toast.error(
      done > 0 ? `Deleted ${done} of ${runs.length} registers` : 'Could not delete the register',
      { description: failures.join('\n') },
    );
    if (done > 0) close();
  };

  const single = runs.length === 1 ? runs[0] : null;

  return (
    <Dialog open={runs.length > 0} onOpenChange={(open) => { if (!open && !busy) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" />
            {single
              ? `Delete the ${monthOf(single)} register permanently`
              : `Delete ${runs.length} registers permanently`}
          </DialogTitle>
          <DialogDescription>
            {single ? `${nameOf(single)}. ` : ''}
            This removes {many ? 'each register' : 'the register'} and every line on it. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {single ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border bg-muted/30 p-3 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd><StatusBadge live={single.superseded_at === null} /></dd>
            <dt className="text-muted-foreground">Payable lines</dt>
            <dd className="tabular-nums">{single.included_count} of {single.staff_total}</dd>
            <dt className="text-muted-foreground">Net pay</dt>
            <dd className="font-medium tabular-nums">{inr(single.total_net)}</dd>
            <dt className="text-muted-foreground">Generated</dt>
            <dd>{stamp(single.generated_at)}</dd>
          </dl>
        ) : (
          <div className="rounded-md border bg-muted/30 text-sm">
            <ul className="max-h-56 divide-y overflow-y-auto">
              {runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{nameOf(r)}</p>
                    <p className="text-xs text-muted-foreground">
                      {monthOf(r)} · {r.included_count} lines · generated {stamp(r.generated_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusBadge live={r.superseded_at === null} />
                    <span className="tabular-nums">{inr(r.total_net)}</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t px-3 py-2 font-medium">
              <span>{runs.length} registers · {totalLines} payable lines</span>
              <span className="tabular-nums">{inr(totalNet)}</span>
            </div>
          </div>
        )}

        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {liveCount > 0
              ? `${many ? `${liveCount} of these ${liveCount === 1 ? 'is' : 'are'} the register` : 'This is the register'} in force for ${liveCount === 1 ? 'its month' : 'their months'}. After deletion ${liveCount === 1 ? 'that month has' : 'those months have'} no register until one is generated again; an earlier register it replaced stays superseded and does not come back.`
              : many
                ? 'Every register here was already superseded, so deleting them changes nothing about any month in force — only the history of what was issued.'
                : 'This register was already superseded, so deleting it changes nothing about the month in force — only the history of what was issued.'}
          </AlertDescription>
        </Alert>

        <div className="space-y-1.5">
          <Label htmlFor="delete-run-confirm">
            Type <span className="font-mono font-semibold">DELETE</span> to confirm
          </Label>
          <Input
            id="delete-run-confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={busy}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={!armed || busy} onClick={handleDelete}>
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {many ? `Delete ${runs.length} permanently` : 'Delete permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ live }: { live: boolean }) {
  return live ? (
    <Badge variant="secondary" className="font-normal">In force</Badge>
  ) : (
    <Badge variant="outline" className="font-normal text-muted-foreground">Superseded</Badge>
  );
}

function stamp(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
}
