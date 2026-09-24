'use client';

/**
 * /cdc/drives/[id]/responses — willingness responses for one drive, with the
 * Excel download. Staff-only (cdc.drives.view); the data comes from
 * GET /api/cdc/drives/[id]/responses, which only releases contact + academic
 * figures the learner permitted at submission.
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChevronLeft, ChevronRight, Download, Search, Users } from 'lucide-react';
import { useCdcDrive, useCdcDriveResponses, cdcDriveResponsesExportUrl } from '@/hooks/cdc/use-cdc-drives';
import { formatArrearsForExport } from '@/lib/services/cdc/academic-standing';
import type { CdcWillingnessStatus } from '@/types/cdc';
import { DriveStatusBadge } from '../../_components/drive-status-badge';
import { describeTargeting } from '../../_components/institution-semester-picker';

const PAGE_SIZES = [10, 20, 50, 100, 500] as const;

const STATUS_LABEL: Record<CdcWillingnessStatus, string> = {
  willing: 'Willing',
  confirmed: 'Confirmed',
  withdrawn: 'Declined',
  no_show: 'No show',
};
const STATUS_VARIANT: Record<CdcWillingnessStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  willing: 'default',
  confirmed: 'default',
  withdrawn: 'outline',
  no_show: 'destructive',
};

export default function CdcDriveResponsesPage(props: { params: Promise<{ id: string }> }) {
  return (
    <PermissionGuard module="cdc.drives" action="view">
      <ResponsesContent {...props} />
    </PermissionGuard>
  );
}

function ResponsesContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: detail } = useCdcDrive(id);
  const [institution, setInstitution] = useState<string>('all');
  const [semester, setSemester] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [search, setSearch] = useState('');

  const filters = {
    institution_id: institution === 'all' ? undefined : institution,
    semester_order: semester === 'all' ? undefined : parseInt(semester, 10),
    status: status === 'all' ? undefined : status,
  };
  const { data, isLoading, error } = useCdcDriveResponses(id, filters);

  const drive = detail?.data;
  const semesterOptions = useMemo(() => {
    const set = new Set<number>();
    (drive?.institution_semesters ?? []).forEach((t) => t.semester_orders.forEach((o) => set.add(o)));
    return Array.from(set).sort((a, b) => a - b);
  }, [drive]);

  const rows = useMemo(() => {
    const list = data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) =>
      [r.learner_name, r.register_number, r.email, r.mobile, r.department_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [data, search]);

  // Client-side paging: the API already returns the whole (filtered) list.
  const [pageSize, setPageSize] = useState<number | 'all'>(20);
  const [page, setPage] = useState(1);
  const pageCount = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageStart = pageSize === 'all' ? 0 : (safePage - 1) * pageSize;
  const pageRows = pageSize === 'all' ? rows : rows.slice(pageStart, pageStart + pageSize);

  const exportUrl = cdcDriveResponsesExportUrl(id, filters);
  const canExport = (data?.total ?? 0) > 0;

  return (
    <ContentLayout title="Willingness responses">
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
            <BreadcrumbPage>Responses</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              {drive?.title ?? 'Drive'}
            </h1>
            <div className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
              {drive ? <DriveStatusBadge status={drive.status} /> : null}
              {drive ? <span>{describeTargeting(drive.institution_semesters ?? [], drive.institutions.length)}</span> : null}
              <span>· {data?.total ?? 0} response{(data?.total ?? 0) === 1 ? '' : 's'}</span>
            </div>
          </div>
          {canExport ? (
            <Button asChild>
              <a href={exportUrl}>
                <Download className="h-4 w-4 mr-2" /> Download Excel
              </a>
            </Button>
          ) : (
            <Button disabled title="No submissions to export">
              <Download className="h-4 w-4 mr-2" /> Download Excel
            </Button>
          )}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
            <CardDescription>The Excel download uses the same institution, semester and status filters.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
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
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(STATUS_LABEL) as CdcWillingnessStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search name, register no, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-6 text-sm text-muted-foreground">Loading responses…</p>
            ) : error ? (
              <p className="p-6 text-sm text-destructive">{error instanceof Error ? error.message : 'Failed to load'}</p>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium">No willingness submissions yet</p>
                <p className="text-xs text-muted-foreground">
                  {(data?.total ?? 0) > 0
                    ? 'No rows match your search.'
                    : 'Responses appear here once learners confirm from their notification.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Learner</TableHead>
                      <TableHead>Institution / Dept</TableHead>
                      <TableHead>Semester</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead className="text-right">CGPA</TableHead>
                      <TableHead className="text-right">Arrears</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r, i) => (
                      <TableRow key={r.willingness_id}>
                        <TableCell className="text-muted-foreground">{pageStart + i + 1}</TableCell>
                        <TableCell>
                          <div className="font-medium">{r.learner_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.register_number ?? ''}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{r.institution_name ?? '—'}</div>
                          <div className="text-xs text-muted-foreground">{r.department_name ?? ''}</div>
                        </TableCell>
                        <TableCell>{r.semester_label ?? '—'}</TableCell>
                        <TableCell>
                          {r.data_consent_at ? (
                            <>
                              <div className="text-sm">{r.email ?? '—'}</div>
                              <div className="text-xs text-muted-foreground">
                                {r.mobile ?? '—'}
                                {r.additional_mobile ? ` · ${r.additional_mobile}` : ''}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not permitted</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">{r.cgpa != null ? r.cgpa.toFixed(2) : '—'}</TableCell>
                        <TableCell className="text-right">
                          {r.arrears_count == null ? (
                            '—'
                          ) : (
                            <span title={formatArrearsForExport(r.arrears_details) || undefined}>
                              {r.arrears_count}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.declared_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {rows.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Rows per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(v === 'all' ? 'all' : parseInt(v, 10));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n}
                        </SelectItem>
                      ))}
                      <SelectItem value="all">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {pageStart + 1}–{Math.min(pageStart + pageRows.length, rows.length)} of {rows.length}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-muted-foreground">
                    Page {safePage} / {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= pageCount}
                    onClick={() => setPage(safePage + 1)}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
