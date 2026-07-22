'use client';

/**
 * Approvals tab.
 *
 * SECURITY: the page this replaces (/hr/leave/approve) had NO client-side
 * guard at all — any authenticated user could open the approval inbox. It only
 * appeared harmless because hla_select/hla_update filtered the rows. This page
 * gates on hr_can_approve_leave(), which mirrors the hla_update policy, so the
 * tab, the page and the database agree on who may act.
 *
 * hr.leave.approve resolves to five roles (CEO, COO, HR Administrator,
 * HR Head, HR Manager) plus super admins. Note the permission blob stores
 * revocation as `false` rather than removing the key, so 63 roles CONTAIN the
 * key while only 5 have it true — never gate on `permissions ? 'key'`.
 */

import { useMemo, useState } from 'react';
import { AlertCircle, Check, ShieldAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

import { TimeOffShell } from '../_components/time-off-shell';
import { PeriodFilter, defaultPeriod, type PeriodRange } from '../_components/period-filter';
import { RequestTable, RequestRow, StatusBadge } from '../_components/request-table';
import { useApplicationsByStatus, useDecideApplication } from '@/hooks/hr/use-leave';
import { useCanApproveLeave } from '@/hooks/hr/use-hr-leave-types';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { getErrorMessage } from '@/lib/utils';
import { LEAVE_DURATION_LABELS } from '@/types/hr';
import type { HRLeaveApplicationWithType } from '@/types/hr';

const fmtDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';

export default function LeaveApprovalsPage() {
  const { data: canApprove, isLoading: gateLoading } = useCanApproveLeave();
  const ctx = useTimeOffContext();
  const [period, setPeriod] = useState<PeriodRange>(defaultPeriod());
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useApplicationsByStatus(
    ctx.hrOrgId || undefined,
    ['pending', 'escalated']
  );
  const decide = useDecideApplication();

  const rows = useMemo(() => {
    const all = (data?.data ?? []) as HRLeaveApplicationWithType[];
    return all.filter((a) => a.start_date <= period.to && a.end_date >= period.from);
  }, [data, period.from, period.to]);

  const onApprove = async (id: string) => {
    setError(null);
    try {
      await decide.mutateAsync({ applicationId: id, decision: 'approve' });
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const onReject = async () => {
    if (!rejectId || !rejectReason.trim()) return;
    setError(null);
    try {
      await decide.mutateAsync({
        applicationId: rejectId,
        decision: 'reject',
        rejection_reason: rejectReason,
      });
      setRejectId(null);
      setRejectReason('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (gateLoading) {
    return (
      <TimeOffShell title="Approvals">
        <Skeleton className="h-64" />
      </TimeOffShell>
    );
  }

  if (!canApprove) {
    return (
      <TimeOffShell title="Approvals">
        <EmptyState
          icon={<ShieldAlert className="h-10 w-10 text-muted-foreground" />}
          title="You cannot approve leave"
          description="Approving leave requires the HR leave approval permission at an organization you belong to. Contact HR if you believe this is an error."
        />
      </TimeOffShell>
    );
  }

  return (
    <TimeOffShell title="Approvals">
      <div className="space-y-4">
        <PeriodFilter
          value={period}
          onChange={setPeriod}
          onRefresh={() => refetch()}
          isRefreshing={isFetching}
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <RequestTable
          columns={[
            { key: 'leave', label: 'Leave' },
            { key: 'start', label: 'Start Date' },
            { key: 'end', label: 'End Date' },
            { key: 'days', label: 'Total Days', align: 'right' },
            { key: 'duration', label: 'Duration' },
            { key: 'status', label: 'Status' },
            { key: 'actions', label: 'Actions', align: 'right' },
          ]}
          isLoading={isLoading || ctx.isLoading}
          isEmpty={rows.length === 0}
          emptyMessage="Nothing awaiting your decision in this period."
        >
          {rows.map((a) => (
            <RequestRow key={a.id} status={a.status}>
              <TableCell className="pl-4 font-medium">
                {a.hr_leave_types?.leave_type_name ?? '—'}
              </TableCell>
              <TableCell>{fmtDate(a.start_date)}</TableCell>
              <TableCell>{fmtDate(a.end_date)}</TableCell>
              <TableCell className="text-right tabular-nums">{a.total_days}</TableCell>
              <TableCell className="text-muted-foreground">
                {LEAVE_DURATION_LABELS[a.duration_type] ?? a.duration_type}
              </TableCell>
              <TableCell><StatusBadge status={a.status} /></TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => onApprove(a.id)}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={decide.isPending}
                    onClick={() => { setRejectId(a.id); setRejectReason(''); }}
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Reject
                  </Button>
                </div>
              </TableCell>
            </RequestRow>
          ))}
        </RequestTable>
      </div>

      <Dialog open={!!rejectId} onOpenChange={(v) => { if (!v) setRejectId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject leave request</DialogTitle>
            <DialogDescription>
              A reason is required and is shown to the requester.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="rejectReason">Reason <span className="text-destructive">*</span></Label>
            <Textarea
              id="rejectReason"
              className="mt-1"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this request is being rejected"
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
    </TimeOffShell>
  );
}
