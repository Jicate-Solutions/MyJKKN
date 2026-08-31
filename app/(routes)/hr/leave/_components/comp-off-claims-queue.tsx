'use client';

/**
 * Comp-off claim approval queue.
 *
 * Without this screen the ledger could earn but never confirm: a claim raised
 * from the Compensatory Off tab sat at status='pending' with no way to approve
 * it outside SQL.
 *
 * NOT date-filtered. A claim queue must show everything awaiting a decision —
 * the same reason the leave approval queue defaults to all time. A worked day
 * claimed late would otherwise be invisible.
 *
 * Self-approval is blocked by the hcoc_update RLS policy, not here. The button
 * is hidden for your own claims so the failure is explained up front rather
 * than arriving as a policy denial after the click.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Check, Clock, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import { RequestTable, RequestRow } from './request-table';
import { formatDays } from './format';
import { usePendingCompOffClaims, useDecideCompOffClaim } from '@/hooks/hr/use-comp-off';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { getErrorMessage, cn } from '@/lib/utils';

const fmtDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';

export function CompOffClaimsQueue() {
  const ctx = useTimeOffContext();
  const { data, isLoading, error } = usePendingCompOffClaims();
  const decide = useDecideCompOffClaim();

  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const claims = useMemo(() => data ?? [], [data]);

  // A claim can lapse before anyone decides it: expiry runs 90 days from the
  // day WORKED, not from approval. Approving one mints a credit that the
  // balance's `expires_on >= CURRENT_DATE` filter can never see — it shows in
  // the claimant's ledger and buys them nothing, which is exactly how the COO
  // ended up with credits on screen and "0 available" on Apply.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const lapsedCount = useMemo(
    () => claims.filter((c) => c.expires_on < today).length,
    [claims, today]
  );

  const onApprove = async (id: string) => {
    setActionError(null);
    try {
      await decide.mutateAsync({ creditId: id, decision: 'approved' });
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  const onReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    setActionError(null);
    try {
      await decide.mutateAsync({
        creditId: rejectId,
        decision: 'rejected',
        rejectionReason: rejectReason,
      });
      setRejectId(null);
      setRejectReason('');
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  return (
    <div className="space-y-4">
      <Alert>
        <Clock className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Approving a claim creates a credit worth <strong>1 day</strong>, usable for{' '}
          <strong>90 days</strong> from the date worked. The team member can then book
          compensatory off against it.
        </AlertDescription>
      </Alert>

      {lapsedCount > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>{lapsedCount}</strong> claim(s) below have already passed their
            90-day expiry. Approving one creates a credit the team member cannot
            book — reject it with a reason instead, so they know where it went.
          </AlertDescription>
        </Alert>
      )}

      {(error || actionError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{actionError ?? getErrorMessage(error)}</AlertDescription>
        </Alert>
      )}

      <RequestTable
        columns={[
          { key: 'who', label: 'Team Member' },
          { key: 'worked', label: 'Worked Date' },
          { key: 'expiry', label: 'Would Expire' },
          { key: 'days', label: 'Days', align: 'right' },
          { key: 'notes', label: 'Notes' },
          { key: 'actions', label: 'Actions', align: 'right' },
        ]}
        isLoading={isLoading}
        isEmpty={claims.length === 0}
        emptyMessage="No compensatory off claims awaiting your decision."
      >
        {claims.map((c) => {
          // Compares against the ONE staff record the context resolves. An
          // approver mapped to several staff records could still see the
          // buttons on a non-primary claim of their own — hcoc_update's
          // WITH CHECK (employee_id NOT IN fn_my_staff_ids()) rejects the
          // click and the error surfaces in the alert above, so this is a
          // cosmetic gap, not a self-approval hole. Closing it properly means
          // exposing the full staff-id set through the context.
          const isOwn = c.employee_id === ctx.employeeId;
          const lapsed = c.expires_on < today;
          return (
            <RequestRow key={c.id} status="pending">
              <TableCell className="pl-4">
                <span className="font-medium">{c.employee_name}</span>
                {c.employee_code && (
                  <span className="block text-xs text-muted-foreground">
                    {c.employee_code}
                  </span>
                )}
              </TableCell>
              <TableCell>{fmtDate(c.worked_date)}</TableCell>
              <TableCell className={cn(lapsed ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                {fmtDate(c.expires_on)}
                {lapsed && (
                  <span className="block text-xs font-medium">
                    Already expired — a credit here is unusable
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatDays(c.credit_days)}
              </TableCell>
              <TableCell className="max-w-[220px] truncate text-muted-foreground" title={c.notes ?? ''}>
                {c.notes || '—'}
              </TableCell>
              <TableCell className="text-right">
                {isOwn ? (
                  <span className="text-xs text-muted-foreground">
                    Your own claim — another approver must decide
                  </span>
                ) : (
                  <div className="flex justify-end gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => onApprove(c.id)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() => { setRejectId(c.id); setRejectReason(''); }}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                )}
              </TableCell>
            </RequestRow>
          );
        })}
      </RequestTable>

      <Dialog open={!!rejectId} onOpenChange={(v) => { if (!v) setRejectId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject compensatory off claim</DialogTitle>
            <DialogDescription>
              A reason is required and is shown to the team member. No credit is created.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="coRejectReason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="coRejectReason"
              className={cn('mt-1')}
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this claim being rejected?"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || decide.isPending}
              onClick={onReject}
            >
              {decide.isPending ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
