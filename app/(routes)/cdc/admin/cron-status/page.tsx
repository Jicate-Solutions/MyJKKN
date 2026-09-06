'use client';

// ============================================================
// /cdc/admin/cron-status — CDC cron job status (read-only)
// ============================================================
// Shows last-run + status for the 2 CDC cron jobs:
//   - cdc-coordinator-escalation
//   - cdc-placement-snapshot
// Read-only. No actions exposed.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { RefreshCw, CheckCircle2, XCircle, Clock, ShieldAlert } from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useCdcAdmin } from '@/hooks/cdc/use-cdc-admin';
import type { CdcCronJobStatus } from '@/types/admin/cdc';

const JOB_LABELS: Record<string, { label: string; description: string }> = {
  'cdc-coordinator-escalation': {
    label: 'Coordinator escalation',
    description: 'Runs every hour. Checks for coordinators who have missed the willingness-lock deadline and notifies the CDC Head.',
  },
  'cdc-placement-snapshot': {
    label: 'Placement snapshot',
    description: 'Runs quarterly. Captures a point-in-time snapshot of placement statistics for accreditation and trend analysis.',
  },
};

export default function CdcCronStatusPage() {
  const { isCdcAdmin, isLoading: permsLoading } = useCdcAdmin();
  const [jobs, setJobs] = useState<CdcCronJobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cdc/cron-status');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load');
      setJobs(json.data ?? []);
      setNote(json.note ?? null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (permsLoading) {
    return (
      <ContentLayout title="CDC Cron Status">
        <Skeleton className="h-40 w-full" />
      </ContentLayout>
    );
  }

  if (!isCdcAdmin) {
    return (
      <ContentLayout title="CDC Cron Status">
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Access restricted</AlertTitle>
          <AlertDescription>Cron status view requires super-admin or CDC Head role.</AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="CDC Cron Status">
      <PageBreadcrumb
        items={[
          { label: 'CDC', href: '/cdc' },
          { label: 'Admin', href: '/cdc/admin' },
          { label: 'Cron Status', href: '/cdc/admin/cron-status' },
        ]}
      />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cron Status</h1>
          <p className="text-muted-foreground mt-1">
            Read-only view of CDC background jobs. Contact a developer to change schedules.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {note && (
        <Alert className="mb-4">
          <AlertTitle>Note</AlertTitle>
          <AlertDescription className="text-xs">{note}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Failed to load</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {loading
          ? Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-40 w-full" />
            ))
          : jobs.map((job) => {
              const meta = JOB_LABELS[job.jobname];
              const statusIcon =
                job.last_status === 'succeeded' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : job.last_status === 'failed' ? (
                  <XCircle className="h-5 w-5 text-destructive" />
                ) : (
                  <Clock className="h-5 w-5 text-muted-foreground" />
                );

              return (
                <Card key={job.jobname}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {statusIcon}
                      {meta?.label ?? job.jobname}
                    </CardTitle>
                    {meta && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {meta.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Schedule</span>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{job.schedule}</code>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last run</span>
                      <span>
                        {job.last_run
                          ? `${format(new Date(job.last_run), 'd MMM yyyy HH:mm')} (${formatDistanceToNow(new Date(job.last_run), { addSuffix: true })})`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Last status</span>
                      <Badge
                        variant={
                          job.last_status === 'succeeded'
                            ? 'default'
                            : job.last_status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {job.last_status ?? 'unknown'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
      </div>
    </ContentLayout>
  );
}
