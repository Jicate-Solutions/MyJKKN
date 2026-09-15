'use client';

/**
 * /cdc/drives/[id]/notifications — per-learner notification audit for one
 * drive, plus a "why didn't X get it?" lookup by register number.
 */

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Bell, Loader2, Search, Stethoscope } from 'lucide-react';
import { useCdcDrive, useCdcDriveNotifications, diagnoseCdcDriveNotification } from '@/hooks/cdc/use-cdc-drives';
import type { LearnerNotifyDiagnosis } from '@/lib/services/cdc/drive-notifications';
import { DriveStatusBadge } from '../../_components/drive-status-badge';

const PUSH_LABEL: Record<string, string> = {
  delivered: 'Push delivered',
  failed: 'Push failed',
  stale_removed: 'Stale device removed',
  no_subscription: 'No push device (bell only)',
  opted_out: 'Push opted out (bell only)',
  skipped: 'Push not configured',
};
const PUSH_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  delivered: 'default',
  failed: 'destructive',
  stale_removed: 'destructive',
  no_subscription: 'outline',
  opted_out: 'outline',
  skipped: 'secondary',
};
const VERDICT_TONE: Record<LearnerNotifyDiagnosis['verdict'], 'ok' | 'warn' | 'bad'> = {
  sent_push_delivered: 'ok',
  sent_no_subscription: 'warn',
  sent_push_skipped: 'warn',
  sent_push_failed: 'bad',
  no_profile: 'bad',
  not_triggered: 'warn',
  not_eligible_institution: 'warn',
  not_eligible_semester: 'warn',
  not_active: 'warn',
  not_found: 'bad',
};

export default function CdcDriveNotificationsPage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.drives" action="view">
      <Content {...props} />
    </PermissionGuard>
  );
}

function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: detail } = useCdcDrive(id);
  const [status, setStatus] = useState<'all' | 'sent' | 'no_profile'>('all');
  const { data, isLoading, error } = useCdcDriveNotifications(id, status === 'all' ? undefined : status);
  const [search, setSearch] = useState('');
  const [reg, setReg] = useState('');
  const [diag, setDiag] = useState<LearnerNotifyDiagnosis | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.learner_name, r.register_number, r.institution_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, search]);

  async function runDiagnosis(e: React.FormEvent) {
    e.preventDefault();
    if (!reg.trim()) return;
    setDiagLoading(true);
    setDiagError(null);
    setDiag(null);
    try {
      setDiag(await diagnoseCdcDriveNotification(id, reg.trim()));
    } catch (err) {
      setDiagError(err instanceof Error ? err.message : 'Diagnosis failed');
    } finally {
      setDiagLoading(false);
    }
  }

  const drive = detail?.data;
  const s = data?.summary;

  return (
    <ContentLayout title="Notification log">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/cdc/drives">Drives</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink asChild><Link href={`/cdc/drives/${id}`}>{drive?.title ?? 'Drive'}</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Notifications</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5 text-muted-foreground" />
            {drive?.title ?? 'Drive'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
            {drive ? <DriveStatusBadge status={drive.status} /> : null}
            <span>Deep link sent to learners: <code className="text-xs">/cdc/drives/{id}/willingness</code></span>
          </p>
        </div>

        {s ? (
          <div className="grid gap-2 grid-cols-2 md:grid-cols-5">
            {[
              ['Notified', s.sent],
              ['Push delivered', s.push_delivered],
              ['Bell only', s.no_subscription],
              ['Push failed', s.push_failed],
              ['No login', s.no_profile],
            ].map(([label, n]) => (
              <div key={String(label)} className="rounded-md border p-3">
                <p className="text-2xl font-semibold leading-none">{n}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
        ) : null}

        {/* Diagnosis */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4 text-muted-foreground" />
              Why didn&apos;t a learner get it?
            </CardTitle>
            <CardDescription>Enter a register number to trace eligibility, login, bell row and push delivery for this drive.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={runDiagnosis} className="flex gap-2 max-w-md">
              <Input value={reg} onChange={(e) => setReg(e.target.value)} placeholder="Register number" />
              <Button type="submit" disabled={diagLoading || !reg.trim()}>
                {diagLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check'}
              </Button>
            </form>
            {diagError ? <p className="text-xs text-destructive">{diagError}</p> : null}
            {diag ? (
              <Alert variant={VERDICT_TONE[diag.verdict] === 'bad' ? 'destructive' : 'default'}>
                <AlertTitle className="flex flex-wrap items-center gap-2">
                  {diag.learner ? `${diag.learner.name} (${diag.learner.register_number ?? '—'})` : 'Learner not found'}
                  <Badge variant={VERDICT_TONE[diag.verdict] === 'ok' ? 'default' : 'outline'}>{diag.verdict.replace(/_/g, ' ')}</Badge>
                </AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>{diag.explanation}</p>
                  {diag.learner ? (
                    <p className="text-xs text-muted-foreground">
                      Semester {diag.learner.semester_order ?? '—'} · lifecycle {diag.learner.lifecycle_status ?? '—'} · login {diag.learner.user_id ? 'linked' : 'missing'}
                      {diag.willingness_status ? ` · willingness: ${diag.willingness_status}` : ' · no willingness response yet'}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">Deep link: <code>{diag.deep_link}</code></p>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        {/* Log table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Per-learner log</CardTitle>
              <div className="flex gap-2">
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="sent">Notified</SelectItem>
                    <SelectItem value="no_profile">No login</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8 w-56" placeholder="Search name / register no" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading…</p>
            ) : error ? (
              <p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {(data?.total ?? 0) === 0 ? 'No notification has been sent for this drive yet.' : 'No rows match.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Learner</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead>Sem</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Push</TableHead>
                      <TableHead>Sent at</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.learner_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.register_number ?? ''}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.institution_name ?? '—'}</TableCell>
                        <TableCell>{r.target_semester_order ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'sent' ? 'default' : 'destructive'}>
                            {r.status === 'sent' ? 'Notified' : 'No login'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {r.push_status ? (
                            <Badge variant={PUSH_VARIANT[r.push_status] ?? 'outline'} title={r.push_error ?? undefined}>
                              {PUSH_LABEL[r.push_status] ?? r.push_status}
                            </Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.sent_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
