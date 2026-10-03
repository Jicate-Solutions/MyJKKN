'use client';

import { useState } from 'react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAnalytics, useInstaSolverAccess } from '@/hooks/instasolver/use-instasolver';
import {
  CategoryChart,
  InstitutionChart,
  SeverityChart,
  StatusMixChart,
  TimelineChart
} from './analytics-charts';

const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' }
];

const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${v}%`);

/** Hours as returned by the RPC, shown as hours below two days and days above. */
function duration(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—';
  if (hours < 48) return `${hours} h`;
  return `${Math.round((hours / 24) * 10) / 10} days`;
}

function Metric({ label, value, hint, loading }: { label: string; value: string; hint?: string; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-2 h-8 w-20" /> : <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>}
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export function AnalyticsClient() {
  const [days, setDays] = useState(30);
  const { data: access } = useInstaSolverAccess();
  const { data, isLoading, error } = useAnalytics(days);
  const principalOnly = !!access?.is_principal && !access.is_manager;
  const issues = data?.issues;
  const reqs = data?.requirements;

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        items={[{ label: 'InstaSolver', href: '/instasolver/dashboard' }, { label: 'Analytics', isCurrent: true }]}
      />
      <PageHeader
        title="Analytics"
        description={principalOnly ? 'Showing your institution only.' : 'How faults and requests are being handled across institutions'}
        actions={
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-[180px]" aria-label="Time window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.days} value={String(w.days)}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {error && (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            The figures could not be loaded. Refresh the page to try again.
          </CardContent>
        </Card>
      )}

      <section className="space-y-3" aria-label="Issue figures">
        <h2 className="text-base font-semibold">Issues</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <Metric label="Reported" value={String(issues?.total ?? '—')} loading={isLoading} />
          <Metric
            label="Resolution rate"
            value={pct(issues?.resolution_rate)}
            hint="Completed, of those that were worked"
            loading={isLoading}
          />
          <Metric label="Reopen rate" value={pct(issues?.reopen_rate)} hint="Came back after completion" loading={isLoading} />
          <Metric label="Average time to resolve" value={duration(issues?.avg_resolution_hours)} loading={isLoading} />
          <Metric label="Fix disputed" value={String(issues?.disputed ?? '—')} loading={isLoading} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Requirement figures">
        <h2 className="text-base font-semibold">Requirements</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Requested" value={String(reqs?.total ?? '—')} loading={isLoading} />
          <Metric label="Awaiting review" value={String(reqs?.pending ?? '—')} loading={isLoading} />
          <Metric label="Fulfilled" value={String(reqs?.fulfilled ?? '—')} loading={isLoading} />
          <Metric
            label="Fulfilment rate"
            value={pct(reqs?.fulfilment_rate)}
            hint="Fulfilled, of those approved"
            loading={isLoading}
          />
        </div>
      </section>

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      ) : (
        <>
          <TimelineChart data={data.timeline} />
          <div className="grid gap-4 lg:grid-cols-2">
            <StatusMixChart data={data.by_status} />
            <SeverityChart data={data.by_severity} />
            <CategoryChart data={data.by_category} />
            <InstitutionChart data={data.by_institution} />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Recurring locations</CardTitle>
              <p className="text-sm text-muted-foreground">
                The same kind of fault reported again and again at one place. These are worth fixing at the root.
              </p>
            </CardHeader>
            <CardContent>
              {data.recurring.length === 0 ? (
                <p className="text-sm text-muted-foreground">No location has had repeated reports in this period.</p>
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Location</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Reports</TableHead>
                          <TableHead className="text-right">Reopened</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recurring.map((r) => (
                          <TableRow key={`${r.location}-${r.category}`}>
                            <TableCell className="font-medium">{r.location}</TableCell>
                            <TableCell>{r.category}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.occurrences}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.reopens}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="space-y-2 md:hidden">
                    {data.recurring.map((r) => (
                      <li key={`${r.location}-${r.category}`} className="rounded-md border p-3 text-sm">
                        <p className="font-medium">{r.location}</p>
                        <p className="text-muted-foreground">{r.category}</p>
                        <p className="mt-1">
                          {r.occurrences} reports, {r.reopens} reopened
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
