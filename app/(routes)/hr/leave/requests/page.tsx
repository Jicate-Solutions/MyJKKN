'use client';

/**
 * Leave tab — Requests | Balance.
 *
 * Lists only applications whose type is request_category='leave'. Permission
 * (hourly) and Compensatory Off appear on their own tabs.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

import { TimeOffShell } from '../_components/time-off-shell';
import { PeriodFilter, allTimePeriod, type PeriodRange } from '../_components/period-filter';
import { RequestTable, RequestRow, StatusBadge } from '../_components/request-table';
import { ApplyLeaveDrawer } from '../_components/apply-leave-drawer';
import { useMyApplications } from '@/hooks/hr/use-leave';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import { LEAVE_DURATION_LABELS } from '@/types/hr';
import type { HRLeaveApplicationWithType } from '@/types/hr';

const SUB_TABS = [
  { label: 'Leave Request', href: '/hr/leave/requests' },
  { label: 'Leave Balance', href: '/hr/leave/requests?tab=balance' },
];

const fmtDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';

export default function LeaveRequestsPage() {
  const params = useSearchParams();
  const view = params.get('tab') === 'balance' ? 'balance' : 'requests';

  const ctx = useTimeOffContext();
  const [period, setPeriod] = useState<PeriodRange>(allTimePeriod());
  const [applyOpen, setApplyOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useMyApplications(
    ctx.employeeId || undefined
  );

  // Filter by category and period client-side: an employee's own list is a
  // handful of rows, and filtering the embed server-side would need an !inner
  // join, which drops rows whose type is unreadable under RLS.
  const rows = useMemo(() => {
    const all = (data?.data ?? []) as HRLeaveApplicationWithType[];
    if (period.preset === 'all') {
      return all.filter(
        (a) => (a.hr_leave_types?.request_category ?? 'leave') === 'leave'
      );
    }
    return all.filter(
      (a) =>
        // A null embed means the type is unreadable under RLS. Treat it as
        // 'leave' rather than excluding it: matching no category would make
        // the row vanish from EVERY tab — the silent hiding the service's
        // LEFT join exists to prevent.
        (a.hr_leave_types?.request_category ?? 'leave') === 'leave' &&
        a.start_date <= period.to &&
        a.end_date >= period.from
    );
  }, [data, period]);

  const leaveBalances = ctx.balancesFor('leave');

  return (
    <TimeOffShell title="Leave" subTabs={SUB_TABS}>
      {!ctx.isLoading && !ctx.hasEmployeeRecord ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Time Off is available to team members with an HR employee record. Please contact HR if
            you believe this is an error.
          </AlertDescription>
        </Alert>
      ) : view === 'balance' ? (
        <Card>
          <CardContent className="pt-6">
            {leaveBalances.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No leave balance is configured for you this academic year.
              </p>
            ) : (
              <div className="space-y-4">
                {leaveBalances.map((b) => {
                  const total = b.entitled + b.carried_forward;
                  const avail = total - b.used;
                  const pct = total > 0 ? Math.round((b.used / total) * 100) : 0;
                  return (
                    <div key={b.leave_type_id}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm font-medium">{b.leave_type_name}</span>
                        <span className="text-sm tabular-nums">
                          <strong>{avail.toFixed(1)}</strong>
                          <span className="text-muted-foreground"> / {total.toFixed(1)}</span>
                        </span>
                      </div>
                      <Progress value={pct} className="mt-1.5 h-1.5" />
                      <p className="mt-1 text-xs text-muted-foreground">
                        Entitled {b.entitled} · used {b.used} · carried {b.carried_forward}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <PeriodFilter
            value={period}
            onChange={setPeriod}
            onRefresh={() => refetch()}
            isRefreshing={isFetching}
            action={
              <Button onClick={() => setApplyOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Apply
              </Button>
            }
          />

          <RequestTable
            columns={[
              { key: 'leave', label: 'Leave' },
              { key: 'start', label: 'Start Date' },
              { key: 'end', label: 'End Date' },
              { key: 'days', label: 'Total Days', align: 'right' },
              { key: 'duration', label: 'Duration' },
              { key: 'status', label: 'Status' },
            ]}
            isLoading={isLoading || ctx.isLoading}
            isEmpty={rows.length === 0}
            emptyMessage="No leave requests yet. Use Apply to submit one."
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
              </RequestRow>
            ))}
          </RequestTable>
        </div>
      )}

      <ApplyLeaveDrawer open={applyOpen} onOpenChange={setApplyOpen} />
    </TimeOffShell>
  );
}
