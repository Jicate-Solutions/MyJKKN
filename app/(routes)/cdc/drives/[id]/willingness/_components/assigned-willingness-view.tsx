'use client';

/**
 * Staff branch of /cdc/drives/[id]/willingness — every learner the drive's
 * institution + semester audience targets, with their willingness answer,
 * profile details and notification delivery state. Pending learners stay in
 * the list so CDC can chase them.
 *
 * Data: GET /api/cdc/drives/[id]/assigned (filters + Excel on the same route).
 * Gate: cdc.drives.willingness.view (page.tsx wraps this in PermissionGuard).
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Bell, Download, Eye, Pencil, Search, Users } from 'lucide-react';
import {
  useCdcDrive,
  useCdcDriveAssigned,
  cdcDriveAssignedExportUrl,
  type UseCdcDriveAssignedParams,
} from '@/hooks/cdc/use-cdc-drives';
import { formatArrearsForExport } from '@/lib/services/cdc/academic-standing';
import type {
  CdcAssignedNotificationState,
  CdcAssignedWillingnessBucket,
  CdcDriveAssignedRow,
  CdcWillingnessStatus,
} from '@/types/cdc';
import {
  CDC_ASSIGNED_BUCKET_LABEL as ASSIGNED_BUCKET_LABEL,
  CDC_ASSIGNED_NOTIFICATION_LABEL as ASSIGNED_NOTIFICATION_LABEL,
} from '@/types/cdc';
import { DriveStatusBadge } from '../../../_components/drive-status-badge';

const RAW_STATUS_LABEL: Record<CdcWillingnessStatus, string> = {
  willing: 'Willing',
  confirmed: 'Confirmed',
  withdrawn: 'Declined',
  no_show: 'No show',
};
const BUCKET_VARIANT: Record<CdcAssignedWillingnessBucket, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  willing: 'default',
  not_willing: 'destructive',
  pending: 'secondary',
};
const NOTIF_VARIANT: Record<CdcAssignedNotificationState, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  sent: 'default',
  failed: 'destructive',
  not_sent: 'secondary',
  no_push_token: 'outline',
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function AssignedWillingnessView({ id }: { id: string }) {
  const { data: detail } = useCdcDrive(id);
  const [institution, setInstitution] = useState('all');
  const [semester, setSemester] = useState('all');
  const [status, setStatus] = useState('all');
  const [responded, setResponded] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CdcDriveAssignedRow | null>(null);

  const params: UseCdcDriveAssignedParams = {
    institution_id: institution === 'all' ? undefined : institution,
    semester_order: semester === 'all' ? undefined : parseInt(semester, 10),
    status: status === 'all' ? undefined : (status as CdcAssignedWillingnessBucket),
    responded: responded === 'all' ? undefined : (responded as 'yes' | 'no'),
    q: search.trim() || undefined,
  };
  // One server round-trip for the whole audience; search + filters run in the
  // browser (the dataset is a few hundred rows). The Excel URL still carries
  // the filters so the download matches what is on screen.
  const { data, isLoading, error, isFetching } = useCdcDriveAssigned(id);

  const drive = detail?.data;
  const semesterOptions = useMemo(() => {
    const set = new Set<number>();
    (drive?.institution_semesters ?? []).forEach((t) => t.semester_orders.forEach((o) => set.add(o)));
    return Array.from(set).sort((a, b) => a - b);
  }, [drive]);

  const rows = useMemo(() => {
    const all = data?.data ?? [];
    const q = (params.q ?? '').toLowerCase();
    return all.filter((r) => {
      if (params.institution_id && r.institution_id !== params.institution_id) return false;
      if (params.semester_order != null && r.semester_order !== params.semester_order) return false;
      if (params.status && r.bucket !== params.status) return false;
      if (params.responded && r.responded !== (params.responded === 'yes')) return false;
      if (q) {
        const hay = [r.learner_name, r.register_number, r.roll_number, r.email, r.mobile, r.additional_mobile, r.learner_id]
          .filter(Boolean)
          .map((v) => String(v).toLowerCase());
        if (!hay.some((v) => v.includes(q))) return false;
      }
      return true;
    });
  }, [data, params.q, params.institution_id, params.semester_order, params.status, params.responded]);
  const summary = data?.summary;
  const filtersActive = institution !== 'all' || semester !== 'all' || status !== 'all' || responded !== 'all' || !!search.trim();
  const exportUrl = cdcDriveAssignedExportUrl(id, params);
  const exportAllUrl = cdcDriveAssignedExportUrl(id);

  function resetFilters() {
    setInstitution('all');
    setSemester('all');
    setStatus('all');
    setResponded('all');
    setSearch('');
  }

  const emptyState = (() => {
    if ((summary?.assigned ?? 0) === 0) {
      return {
        title: 'No learners assigned to this drive.',
        hint: 'Learners appear here based on the selected institutions and semesters.',
      };
    }
    if (filtersActive) {
      return { title: 'No learners found.', hint: 'Try changing your search or filters.' };
    }
    return { title: 'No willingness responses yet.', hint: 'Learners who respond to this drive will appear here.' };
  })();

  return (
    <ContentLayout title="Willingness">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/cdc/drives">Drives</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/cdc/drives/${id}`}>{drive?.title ?? 'Drive'}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Willingness</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-4 space-y-4">
        {/* Header */}
        <div className="space-y-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={`/cdc/drives/${id}`}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Drive
            </Link>
          </Button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{detail?.recruiter?.name ?? ''}</p>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                {drive?.title ?? 'Drive'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {detail?.drive_type?.display_name ?? 'Campus recruitment drive'} · Willingness ·{' '}
                <span className="font-medium text-foreground">
                  {summary?.responded ?? 0} Responses / {summary?.assigned ?? 0} Assigned
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <PermissionGuard module="cdc.drives" action="edit" fallback={null}>
                {drive && drive.status !== 'closed' && drive.status !== 'cancelled' ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/cdc/drives/${id}/edit`}>
                      <Pencil className="h-4 w-4 mr-1" /> Edit Drive
                    </Link>
                  </Button>
                ) : null}
              </PermissionGuard>
              {rows.length > 0 ? (
                <Button asChild size="sm">
                  <a href={exportUrl}>
                    <Download className="h-4 w-4 mr-1" /> Download Excel{filtersActive ? ' (filtered)' : ''}
                  </a>
                </Button>
              ) : (
                <Button size="sm" disabled title="Nothing to export">
                  <Download className="h-4 w-4 mr-1" /> Download Excel
                </Button>
              )}
              {filtersActive && (summary?.assigned ?? 0) > 0 ? (
                <Button asChild variant="outline" size="sm">
                  <a href={exportAllUrl}>All assigned</a>
                </Button>
              ) : null}
            </div>
          </div>
          {drive ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">Willingness deadline:</span>{' '}
                {drive.willingness_window_close_at ? fmtDateTime(drive.willingness_window_close_at) : 'Not set'}
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-foreground">Status:</span> <DriveStatusBadge status={drive.status} />
              </span>
              <span>
                <span className="font-medium text-foreground">Institutions:</span> {drive.institutions.length}
              </span>
              <span>
                <span className="font-medium text-foreground">Semesters:</span>{' '}
                {semesterOptions.length ? semesterOptions.join(', ') : 'All'}
              </span>
            </div>
          ) : null}
        </div>

        {/* Summary cards */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          {(
            [
              ['Assigned', summary?.assigned, 'all', 'all'],
              ['Responded', summary?.responded, 'all', 'yes'],
              ['Willing', summary?.willing, 'willing', 'all'],
              ['Not willing', summary?.not_willing, 'not_willing', 'all'],
              ['Pending', summary?.pending, 'pending', 'all'],
            ] as const
          ).map(([label, value, bucket, resp]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setStatus(bucket);
                setResponded(resp);
              }}
              className="rounded-lg border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold leading-tight">{value ?? '—'}</p>
            </button>
          ))}
        </div>

        {/* Search + filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Search &amp; filters</CardTitle>
            <CardDescription>
              The Excel download uses the same search and filters.
              {data && !data.contact_released
                ? ' Profile contact is hidden for your role; only contact a learner shared at submission is shown.'
                : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search by name, roll number, register number, email, mobile or MyJKKN ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Select value={institution} onValueChange={setInstitution}>
                <SelectTrigger>
                  <SelectValue placeholder="Institution" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All institutions</SelectItem>
                  {(drive?.institutions ?? []).map((instId) => (
                    <SelectItem key={instId} value={instId}>
                      {detail?.institution_names[instId] ?? instId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={semester} onValueChange={setSemester}>
                <SelectTrigger>
                  <SelectValue placeholder="Semester" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All semesters</SelectItem>
                  {semesterOptions.map((o) => (
                    <SelectItem key={o} value={String(o)}>
                      Semester {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Willingness" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All willingness</SelectItem>
                  {(Object.keys(ASSIGNED_BUCKET_LABEL) as CdcAssignedWillingnessBucket[]).map((b) => (
                    <SelectItem key={b} value={b}>
                      {ASSIGNED_BUCKET_LABEL[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={responded} onValueChange={setResponded}>
                <SelectTrigger>
                  <SelectValue placeholder="Response" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Responded + not responded</SelectItem>
                  <SelectItem value="yes">Responded</SelectItem>
                  <SelectItem value="no">Not responded</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={resetFilters} disabled={!filtersActive}>
                Clear filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading assigned learners…</p>
            ) : error ? (
              <p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">{emptyState.title}</p>
                <p className="text-xs text-muted-foreground">{emptyState.hint}</p>
              </div>
            ) : (
              <div className={`overflow-x-auto ${isFetching ? 'opacity-70' : ''}`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Learner</TableHead>
                      <TableHead>Institution</TableHead>
                      <TableHead className="text-right">Sem</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead className="text-right">CGPA</TableHead>
                      <TableHead className="text-right">Arrears</TableHead>
                      <TableHead>Willingness</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Notification</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.learner_id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.learner_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.roll_number ?? r.register_number ?? ''}
                            {r.outside_audience ? ' · outside current audience' : ''}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{r.institution_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.department_name ?? ''}</div>
                        </TableCell>
                        <TableCell className="text-right">{r.semester_order ?? '—'}</TableCell>
                        <TableCell className="text-sm">{r.email ?? <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{r.mobile ?? '—'}</TableCell>
                        <TableCell className="text-right">{r.cgpa != null ? r.cgpa.toFixed(2) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {r.arrears_count == null ? (
                            '—'
                          ) : (
                            <span title={formatArrearsForExport(r.arrears_details) || undefined}>{r.arrears_count}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={BUCKET_VARIANT[r.bucket]}>
                            {r.willingness_status ? RAW_STATUS_LABEL[r.willingness_status] : ASSIGNED_BUCKET_LABEL.pending}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.declared_at)}</TableCell>
                        <TableCell>
                          <Badge variant={NOTIF_VARIANT[r.notification_state]} title={r.notification_detail ?? undefined}>
                            {ASSIGNED_NOTIFICATION_LABEL[r.notification_state]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
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

      <LearnerDetailsSheet row={selected} onClose={() => setSelected(null)} />
    </ContentLayout>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value ?? '—'}</span>
    </div>
  );
}

function LearnerDetailsSheet({ row, onClose }: { row: CdcDriveAssignedRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!row} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {row ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14">
                  {row.photo_url ? <AvatarImage src={row.photo_url} alt={row.learner_name ?? ''} /> : null}
                  <AvatarFallback>{initials(row.learner_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{row.learner_name ?? 'Learner'}</SheetTitle>
                  <SheetDescription>{row.institution_name ?? ''}</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Learner profile</h3>
                <DetailRow label="Roll number" value={row.roll_number} />
                <DetailRow label="Register number" value={row.register_number} />
                <DetailRow label="MyJKKN ID" value={<code className="text-xs">{row.learner_id}</code>} />
                <DetailRow label="Institution" value={row.institution_name} />
                <DetailRow label="Department" value={row.department_name} />
                <DetailRow label="Semester" value={row.semester_label} />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Contact information</h3>
                {row.contact_source === 'hidden' ? (
                  <p className="text-xs text-muted-foreground">
                    Hidden — your role cannot view learner profiles and this learner has not shared contact details for this drive.
                  </p>
                ) : (
                  <>
                    <DetailRow label="Email" value={row.email} />
                    <DetailRow label="Mobile number" value={row.mobile} />
                    {row.additional_mobile ? <DetailRow label="Additional mobile" value={row.additional_mobile} /> : null}
                  </>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Academic information</h3>
                {row.data_consent_at ? (
                  <>
                    <DetailRow label="CGPA" value={row.cgpa != null ? row.cgpa.toFixed(2) : '—'} />
                    <DetailRow label="Arrears" value={row.arrears_count ?? '—'} />
                    <DetailRow label="Arrear details" value={formatArrearsForExport(row.arrears_details) || '—'} />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {row.responded
                      ? 'The learner did not permit sharing academic figures for this drive.'
                      : 'Captured when the learner submits their willingness.'}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Willingness</h3>
                <DetailRow
                  label="Status"
                  value={
                    <Badge variant={BUCKET_VARIANT[row.bucket]}>
                      {row.willingness_status ? RAW_STATUS_LABEL[row.willingness_status] : ASSIGNED_BUCKET_LABEL.pending}
                    </Badge>
                  }
                />
                <DetailRow label="Submitted" value={fmtDateTime(row.declared_at)} />
                {row.outside_audience ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    This learner responded but no longer matches the drive&apos;s institution / semester audience.
                  </p>
                ) : null}
              </section>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-1">
                  <Bell className="h-4 w-4 text-muted-foreground" /> Notification
                </h3>
                <DetailRow
                  label="Status"
                  value={
                    <Badge variant={NOTIF_VARIANT[row.notification_state]}>
                      {ASSIGNED_NOTIFICATION_LABEL[row.notification_state]}
                    </Badge>
                  }
                />
                <DetailRow label="Sent at" value={fmtDateTime(row.notification_sent_at)} />
                {row.notification_detail ? <DetailRow label="Detail" value={row.notification_detail} /> : null}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
