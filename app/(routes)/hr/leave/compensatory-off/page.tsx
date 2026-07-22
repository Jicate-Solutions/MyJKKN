'use client';

/**
 * Compensatory Off tab — Request | Balance.
 *
 * PHASE 1: requests work; the balance is honest about being empty. Comp off is
 * an earned credit (worked a holiday -> credit with an expiry date), and no
 * code path credits it yet. hr_leave_balances cannot express per-credit expiry
 * anyway — that is hr_comp_off_credits in Phase 2. The Balance view says so
 * rather than rendering a 0 that looks like a bug.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Info, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TableCell } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { TimeOffShell } from '../_components/time-off-shell';
import { PeriodFilter, defaultPeriod, type PeriodRange } from '../_components/period-filter';
import { RequestTable, RequestRow, StatusBadge } from '../_components/request-table';
import { ApplyCompOffDrawer, WORKED_ON_PREFIX } from '../_components/apply-comp-off-drawer';
import { useMyApplications } from '@/hooks/hr/use-leave';
import { useTimeOffContext } from '@/hooks/hr/use-time-off-context';
import type { HRLeaveApplicationWithType } from '@/types/hr';

const SUB_TABS = [
  { label: 'Compensatory Off Request', href: '/hr/leave/compensatory-off' },
  { label: 'Compensatory Off Balance', href: '/hr/leave/compensatory-off?tab=balance' },
];

const fmtDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB') : '—';

/**
 * Phase 1 stores the worked date as a fixed prefix in `reason`, because there
 * is no column for it yet. Pull it back out for display; Phase 2 replaces this
 * with hr_comp_off_credits.worked_date.
 */
function extractWorkedDate(reason: string): string | null {
  const m = new RegExp(`^${WORKED_ON_PREFIX} (\\d{4}-\\d{2}-\\d{2})\\.`).exec(reason);
  return m ? m[1] : null;
}

export default function CompensatoryOffPage() {
  const params = useSearchParams();
  const view = params.get('tab') === 'balance' ? 'balance' : 'requests';

  const ctx = useTimeOffContext();
  const [period, setPeriod] = useState<PeriodRange>(defaultPeriod());
  const [applyOpen, setApplyOpen] = useState(false);

  const { data, isLoading, refetch, isFetching } = useMyApplications(
    ctx.employeeId || undefined
  );

  const rows = useMemo(() => {
    const all = (data?.data ?? []) as HRLeaveApplicationWithType[];
    return all.filter(
      (a) =>
        a.hr_leave_types?.request_category === 'compensatory_off' &&
        a.start_date <= period.to &&
        a.end_date >= period.from
    );
  }, [data, period.from, period.to]);

  const compBalances = ctx.balancesFor('compensatory_off');

  return (
    <TimeOffShell title="Compensatory Off" subTabs={SUB_TABS}>
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
          <CardContent className="space-y-4 pt-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Compensatory off is <strong>earned</strong> by working a holiday or week-off,
                not granted annually. Automatic crediting from approved attendance is not
                enabled yet, so no credits exist and the totals below read zero. Requests
                still work and reach your approver with the worked date recorded.
              </AlertDescription>
            </Alert>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Earned', value: 0 },
                { label: 'Available', value: 0 },
                { label: 'Expired', value: 0 },
              ].map((s) => (
                <div key={s.label} className="rounded-md border px-4 py-3">
                  <p className="text-xs text-muted-foreground">{s.label} Balance</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
                </div>
              ))}
            </div>

            {compBalances.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {compBalances.length} compensatory off type configured, currently carrying no
                entitlement.
              </p>
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
              { key: 'worked', label: 'Worked Date' },
              { key: 'compoff', label: 'Comp Off Date' },
              { key: 'days', label: 'Total Days', align: 'right' },
              { key: 'status', label: 'Status' },
            ]}
            isLoading={isLoading || ctx.isLoading}
            isEmpty={rows.length === 0}
            emptyMessage="No compensatory off requests in this period. Use Apply to submit one."
          >
            {rows.map((a) => {
              const worked = extractWorkedDate(a.reason);
              return (
                <RequestRow key={a.id} status={a.status}>
                  <TableCell className="pl-4 font-medium">
                    {worked ? fmtDate(worked) : '—'}
                  </TableCell>
                  <TableCell>{fmtDate(a.start_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{a.total_days}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                </RequestRow>
              );
            })}
          </RequestTable>
        </div>
      )}

      <ApplyCompOffDrawer open={applyOpen} onOpenChange={setApplyOpen} />
    </TimeOffShell>
  );
}
