'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useClinicalStats } from '@/hooks/hr/use-clinical-duty';
import { getErrorMessage } from '@/lib/utils';

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'warn' | 'good' | 'bad';
}) {
  const color =
    tone === 'warn' ? 'text-amber-600'
    : tone === 'good' ? 'text-green-600'
    : tone === 'bad' ? 'text-red-600'
    : '';
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const SCOPE_LABEL = { staff: 'Individual', department: 'Department', institution: 'Whole institution' } as const;

export function ClinicalStats({ institutionId }: { institutionId?: string }) {
  const { data, isLoading, error } = useClinicalStats(institutionId);

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="rounded-md border p-3 text-sm text-red-500">
        Analytics could not be loaded: {getErrorMessage(error)}
      </p>
    );
  }

  const { requests: r, punches: p, sites, by_month, by_institution, by_scope } = data;
  const peak = Math.max(1, ...by_month.map((m) => m.requests));
  const decided = r.approved + r.rejected + r.revoked;
  const approvalRate = decided > 0 ? Math.round(((r.approved + r.revoked) / decided) * 100) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Pending" value={r.pending} tone={r.pending > 0 ? 'warn' : undefined}
          hint={r.pending > 0 ? `oldest ${r.oldest_pending_days} day(s)` : 'nothing waiting'} />
        <Stat label="Eligible today" value={r.active_now} tone="good"
          hint={r.expiring_30d > 0 ? `${r.expiring_30d} expiring in 30 days` : undefined} />
        <Stat label="Rejected" value={r.rejected} />
        <Stat label="Revoked" value={r.revoked} />
        <Stat label="Approval rate" value={approvalRate === null ? '—' : `${approvalRate}%`}
          hint={`${r.total} request(s) in total`} />
        <Stat label="Avg decision time"
          value={r.avg_decision_hours === null ? '—' : r.avg_decision_hours < 48
            ? `${r.avg_decision_hours} h` : `${Math.round(r.avg_decision_hours / 24)} d`}
          hint={`${r.direct_grants} granted directly`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Punched IN today" value={p.today_in} />
        <Stat label="Punched OUT today" value={p.today_out} />
        <Stat label="On duty now" value={p.on_duty_now} tone={p.on_duty_now > 0 ? 'good' : undefined} />
        <Stat label="Clinical days this month" value={p.month_days} hint={`${p.month_staff} staff`} />
        <Stat label="Missing OUT this month" value={p.month_missing_out}
          tone={p.month_missing_out > 0 ? 'bad' : undefined} hint="marked absent" />
        <Stat label="Duty sites" value={sites.active}
          hint={sites.inactive > 0 ? `${sites.inactive} inactive` : 'all active'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Requests per month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {by_month.map((m) => (
              <div key={m.month} className="flex items-center gap-2 text-xs">
                <span className="w-14 shrink-0 text-muted-foreground">{m.label}</span>
                <div className="h-3 flex-1 rounded bg-muted">
                  <div
                    className="h-3 rounded bg-primary"
                    style={{ width: `${(m.requests / peak) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right tabular-nums">{m.requests}</span>
              </div>
            ))}
            {Object.keys(by_scope).length > 0 && (
              <p className="pt-2 text-xs text-muted-foreground">
                Active grants by scope:{' '}
                {(Object.entries(by_scope) as Array<[keyof typeof SCOPE_LABEL, number]>)
                  .map(([k, n]) => `${SCOPE_LABEL[k]} ${n}`)
                  .join(' · ')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">By institution</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {by_institution.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">No requests yet.</p>
            ) : (
              <div className="max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Institution</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                      <TableHead className="text-right">Rejected</TableHead>
                      <TableHead className="text-right">Revoked</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {by_institution.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="font-medium">{i.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.pending}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.approved}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.rejected}</TableCell>
                        <TableCell className="text-right tabular-nums">{i.revoked}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
