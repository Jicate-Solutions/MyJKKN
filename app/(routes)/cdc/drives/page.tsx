'use client';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useCdcDrives, useCdcLookups } from '@/hooks/cdc/use-cdc-drives';
import { useMyCdcDrives } from '@/hooks/cdc/use-my-cdc-drives';
import { useAuth } from '@/hooks/use-auth';
import type { CdcDriveStatus } from '@/types/cdc';
import { CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';

const STATUS_FILTER_OPTIONS: Array<{ value: CdcDriveStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'announced', label: 'Announced' },
  { value: 'willingness_open', label: 'Willingness Open' },
  { value: 'eligibility_locked', label: 'Eligibility Locked' },
  { value: 'attendance_day', label: 'Attendance Day' },
  { value: 'results_announced', label: 'Results Announced' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE_VARIANT: Record<CdcDriveStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  announced: 'secondary',
  willingness_open: 'default',
  eligibility_locked: 'default',
  attendance_day: 'default',
  results_announced: 'default',
  closed: 'secondary',
  cancelled: 'destructive',
};

export default function CdcDrivesListPage() {
  // Learners see ONLY the drives whose audience includes them (2026-09-16).
  // The coordinator list below is the staff surface behind cdc.drives.view.
  const { profile, isLoading } = useAuth();
  const isLearner = !!profile?.learner_id && profile.role === 'student';
  if (isLoading) {
    return (
      <ContentLayout title="Campus Drives">
        <p className="text-sm text-muted-foreground p-6">Loading drives…</p>
      </ContentLayout>
    );
  }
  if (isLearner) return <LearnerDrivesList />;
  return <CoordinatorDrivesList />;
}

const MY_STATUS_LABEL: Record<string, string> = {
  willing: 'You are in',
  confirmed: 'Confirmed',
  withdrawn: 'Declined',
  no_show: 'No show',
};

function LearnerDrivesList() {
  const { data, isLoading, error } = useMyCdcDrives();
  const drives = data ?? [];
  const pending = drives.filter((d) => d.is_open && !d.willingness_status).length;
  return (
    <ContentLayout title="Campus Drives">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Campus Drives</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">My Campus Drives</h1>
          <p className="text-sm text-muted-foreground">
            Drives assigned to your institution and semester.
            {pending > 0 ? ` ${pending} still need${pending === 1 ? 's' : ''} your response.` : ''}
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            {error ? (
              <div className="text-sm text-destructive">
                Failed to load drives: {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            ) : isLoading ? (
              <div className="text-sm text-muted-foreground">Loading drives…</div>
            ) : drives.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <p className="mb-2">No drives are assigned to you right now.</p>
                <p className="text-xs">You will be notified when a drive opens for your semester.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {drives.map((drive) => (
                  <Link
                    key={drive.id}
                    href={`/cdc/drives/${drive.id}/willingness`}
                    className="block border rounded-md p-3 hover:bg-muted/40 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{drive.title}</span>
                          <Badge variant={STATUS_BADGE_VARIANT[drive.status]}>
                            {CDC_DRIVE_STATUS_LABELS[drive.status]}
                          </Badge>
                          {drive.willingness_status ? (
                            <Badge variant="outline">{MY_STATUS_LABEL[drive.willingness_status] ?? drive.willingness_status}</Badge>
                          ) : drive.is_open ? (
                            <Badge variant="destructive">Response needed</Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 space-x-3">
                          <span>{drive.recruiter_name ?? '—'}</span>
                          <span>·</span>
                          <span>{drive.drive_type_name ?? '—'}</span>
                          {drive.job_role_title ? (
                            <>
                              <span>·</span>
                              <span>{drive.job_role_title}</span>
                            </>
                          ) : null}
                          {drive.drive_date ? (
                            <>
                              <span>·</span>
                              <span>{drive.drive_date}</span>
                            </>
                          ) : null}
                          {drive.willingness_window_close_at ? (
                            <>
                              <span>·</span>
                              <span>Respond by {new Date(drive.willingness_window_close_at).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function CoordinatorDrivesList() {
  const [statusFilter, setStatusFilter] = useState<CdcDriveStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  // The query key follows the DEBOUNCED text, so typing "foxconn" is one request, not seven.
  const debouncedSearch = useDebounceValue(search, 350);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const { data: lookups } = useCdcLookups();
  const recruiterById = useMemo(() => {
    const m = new Map<string, string>();
    (lookups?.recruiters ?? []).forEach((r) => m.set(r.id, r.name));
    return m;
  }, [lookups]);
  const driveTypeById = useMemo(() => {
    const m = new Map<string, string>();
    (lookups?.drive_types ?? []).forEach((d) => m.set(d.id, d.display_name));
    return m;
  }, [lookups]);

  const { data, isLoading, error } = useCdcDrives({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: debouncedSearch.trim() || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  const totalPages = data?.metadata.totalPages ?? 1;

  return (
    <PermissionGuard module="cdc.drives" action="view">
    <ContentLayout title="Career Development Centre — Drives">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/cdc">CDC</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Drives</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Campus Drives</h1>
            <p className="text-sm text-muted-foreground">
              Recruiter-led placement and internship drives across all institutions.
            </p>
          </div>
          <PermissionGuard module="cdc.drives" action="create" fallback={null}>
            <Button asChild>
              <Link href="/cdc/drives/new">
                <Plus className="h-4 w-4 mr-2" />
                New Drive
              </Link>
            </Button>
          </PermissionGuard>
        </div>

        {/* Filter chips + search */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  variant={statusFilter === opt.value ? 'default' : 'outline'}
                  onClick={() => {
                    setStatusFilter(opt.value);
                    setPage(1);
                  }}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search drives by title…"
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${data?.metadata.total ?? 0} drives`}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error ? (
              <div className="text-sm text-destructive">
                Failed to load drives: {error instanceof Error ? error.message : 'Unknown error'}
              </div>
            ) : isLoading ? (
              <div className="text-sm text-muted-foreground">Loading drives…</div>
            ) : !data?.data || data.data.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <p className="mb-2">No drives match these filters yet.</p>
                <p className="text-xs">
                  Create the first one via the <strong>New Drive</strong> button above.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.data.map((drive) => (
                  <Link
                    key={drive.id}
                    href={`/cdc/drives/${drive.id}`}
                    className="block border rounded-md p-3 hover:bg-muted/40 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{drive.title}</span>
                          <Badge variant={STATUS_BADGE_VARIANT[drive.status]}>
                            {CDC_DRIVE_STATUS_LABELS[drive.status]}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 space-x-3">
                          <span>{recruiterById.get(drive.recruiter_id) ?? '—'}</span>
                          <span>·</span>
                          <span>{driveTypeById.get(drive.drive_type_id) ?? '—'}</span>
                          <span>·</span>
                          <span>{drive.institutions.length} institution(s)</span>
                          {drive.drive_date ? (
                            <>
                              <span>·</span>
                              <span>{drive.drive_date}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
            {data && data.metadata.total > PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                <span className="text-muted-foreground">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.metadata.total)} of {data.metadata.total}
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1 || isLoading} onClick={() => setPage(page - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-muted-foreground">Page {page} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages || isLoading} onClick={() => setPage(page + 1)} aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
    </PermissionGuard>
  );
}
