'use client';

import { useState } from 'react';
import { CheckCircle2, FileText, Hourglass, Package, PackageCheck, Percent, RotateCcw, ThumbsDown, Timer } from 'lucide-react';
import { StatCard } from '@/components/instasolver/stat-card';
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

/** Hours under two days, else days — as a number and its unit, for the card. */
function durationParts(hours: number | null | undefined): { value: number | null | undefined; suffix?: string } {
  if (hours === null || hours === undefined) return { value: hours };
  if (hours < 48) return { value: hours, suffix: " h" };
  return { value: Math.round((hours / 24) * 10) / 10, suffix: " days" };
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

      {/* Issue and requirement figures — the dashboard card style in Analytics'
          own colours (owner's request 2026-10-05). */}
      <section className="space-y-3" aria-label="Issue figures">
        <h2 className="text-base font-semibold">Issues</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Reported" value={issues?.total} icon={FileText} accent="teal" href="/instasolver/issues" isLoading={isLoading} />
          <StatCard
            label="Resolution rate"
            value={issues?.resolution_rate}
            suffix="%"
            hint="Completed, of those that were worked"
            icon={CheckCircle2}
            accent="lime"
            href="/instasolver/issues?status=completed"
            isLoading={isLoading}
          />
          <StatCard
            label="Reopen rate"
            value={issues?.reopen_rate}
            suffix="%"
            hint="Came back after completion"
            icon={RotateCcw}
            accent="orange"
            interactive
            isLoading={isLoading}
          />
          <StatCard
            label="Average time to resolve"
            {...durationParts(issues?.avg_resolution_hours)}
            icon={Timer}
            accent="cyan"
            href="/instasolver/issues?status=completed"
            isLoading={isLoading}
          />
          <StatCard label="Fix disputed" value={issues?.disputed} icon={ThumbsDown} accent="rose" href="/instasolver/issues?disputed=1" isLoading={isLoading} />
        </div>
      </section>

      <section className="space-y-3" aria-label="Requirement figures">
        <h2 className="text-base font-semibold">Requirements</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Requested" value={reqs?.total} icon={Package} accent="purple" href="/instasolver/requirements" isLoading={isLoading} />
          <StatCard label="Awaiting review" value={reqs?.pending} icon={Hourglass} accent="fuchsia" href="/instasolver/requirements?status=pending" isLoading={isLoading} />
          <StatCard label="Fulfilled" value={reqs?.fulfilled} icon={PackageCheck} accent="lime" href="/instasolver/requirements?status=fulfilled" isLoading={isLoading} />
          <StatCard
            label="Fulfilment rate"
            value={reqs?.fulfilment_rate}
            suffix="%"
            hint="Fulfilled, of those approved"
            icon={Percent}
            accent="teal"
            href="/instasolver/requirements?status=approved,fulfilled"
            isLoading={isLoading}
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
                  <div className="scrollbar-slim hidden overflow-x-auto md:block">
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
