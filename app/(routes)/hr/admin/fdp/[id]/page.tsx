// ============================================================================
// HR — FDP Catalog Detail + Approve Flow (Admin) — T5.4
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.4
// Created: 2026-06-22
//
// Officer / HoD / Director surface for a single FDP catalog entry. Shows:
//   - FDP details (sponsoring body, funding, external faculty)
//   - Applications list with current status + advance/reject buttons
//   - Application log (audit trail) per row, expandable
// ============================================================================

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { SuperAdminOnly } from '@/components/auth/admin-permission-guard';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  FdpService,
  type FdpCatalogEntry,
  type FdpApplicationStatus,
  type FdpApplicationLogEntry,
} from '@/lib/services/hr/fdp-service';
import type { HRTrainingEnrollment } from '@/lib/services/hr/training-service';

type AppRow = HRTrainingEnrollment & {
  staff_name: string | null;
  application_log?: FdpApplicationLogEntry[];
};

const STATUS_LABEL: Record<FdpApplicationStatus, string> = {
  applied: 'Applied',
  hod_approved: 'HoD Approved',
  director_approved: 'Director Approved',
  attended: 'Attended',
  completed: 'Completed',
  rejected: 'Rejected',
  dropped: 'Dropped',
};

const STATUS_COLOR: Record<FdpApplicationStatus, string> = {
  applied:
    'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  hod_approved:
    'bg-indigo-100 text-indigo-900 dark:bg-indigo-900/20 dark:text-indigo-200',
  director_approved:
    'bg-violet-100 text-violet-900 dark:bg-violet-900/20 dark:text-violet-200',
  attended:
    'bg-amber-100 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200',
  completed:
    'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  rejected: 'bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200',
  dropped: 'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
};

const NEXT_BUTTONS: Partial<
  Record<FdpApplicationStatus, Array<{ target: FdpApplicationStatus; label: string }>>
> = {
  applied: [
    { target: 'hod_approved', label: 'Approve (HoD)' },
    { target: 'rejected', label: 'Reject' },
  ],
  hod_approved: [
    { target: 'director_approved', label: 'Approve (Director)' },
    { target: 'rejected', label: 'Reject' },
  ],
  director_approved: [{ target: 'attended', label: 'Mark Attended' }],
  attended: [{ target: 'completed', label: 'Mark Completed' }],
};

export default function AdminFdpDetailPage() {
  const params = useParams<{ id: string }>();
  const fdpId = params.id;

  const [entry, setEntry] = useState<FdpCatalogEntry | null>(null);
  const [applications, setApplications] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actorId, setActorId] = useState<string | null>(null);
  const [openLogFor, setOpenLogFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      setActorId(uid);

      const e = await FdpService.getCatalogEntry(supabase, fdpId);
      setEntry(e);

      if (e) {
        const apps = (await FdpService.listApplicationsWithStaff(
          supabase,
          fdpId,
        )) as AppRow[];
        setApplications(apps);
      } else {
        setApplications([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fdpId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdvance(
    enrollment_id: string,
    target: FdpApplicationStatus,
  ) {
    if (busyId) return;
    setBusyId(enrollment_id);
    try {
      const supabase = createClientSupabaseClient();
      await FdpService.advanceApplication(supabase, {
        enrollment_id,
        target_status: target,
        actor_id: actorId,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SuperAdminOnly>
    <ContentLayout title="HR — FDP Detail">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin/fdp">FDP Catalog</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{entry?.title ?? fdpId}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
        )}

        {!loading && !entry && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              FDP entry not found.
            </CardContent>
          </Card>
        )}

        {entry && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{entry.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {entry.description && (
                  <p className="text-muted-foreground">{entry.description}</p>
                )}
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Dates</dt>
                    <dd>
                      {entry.start_date} → {entry.end_date}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Location</dt>
                    <dd>{entry.location || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      External faculty
                    </dt>
                    <dd>
                      {entry.external_faculty_name || '—'}
                      {entry.external_faculty_org
                        ? ` (${entry.external_faculty_org})`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Sponsoring body
                    </dt>
                    <dd>{entry.sponsoring_body || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Funding</dt>
                    <dd>
                      {entry.funding_amount
                        ? `₹${Number(entry.funding_amount).toLocaleString('en-IN')}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Status</dt>
                    <dd>{entry.status}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Applications ({applications.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading && (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                )}
                {!loading && applications.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No applications yet.
                  </p>
                )}
                {applications.length > 0 && (
                  <div className="space-y-2">
                    {applications.map((a) => {
                      const s = a.status as FdpApplicationStatus;
                      const buttons = NEXT_BUTTONS[s] ?? [];
                      const isOpen = openLogFor === a.id;
                      const log = Array.isArray(a.application_log)
                        ? a.application_log
                        : [];
                      return (
                        <div
                          key={a.id}
                          className="border rounded-md p-3 flex flex-col gap-2"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">
                                  {a.staff_name || a.staff_id}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded ${STATUS_COLOR[s]}`}
                                >
                                  {STATUS_LABEL[s] ?? s}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Applied {new Date(a.enrolled_at).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {buttons.map((b) => (
                                <Button
                                  key={b.target}
                                  size="sm"
                                  variant={
                                    b.target === 'rejected'
                                      ? 'destructive'
                                      : 'outline'
                                  }
                                  disabled={busyId !== null}
                                  onClick={() => handleAdvance(a.id, b.target)}
                                >
                                  {b.label}
                                </Button>
                              ))}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setOpenLogFor(isOpen ? null : a.id)
                                }
                              >
                                {isOpen ? 'Hide log' : `Log (${log.length})`}
                              </Button>
                            </div>
                          </div>

                          {isOpen && (
                            <div className="rounded-md bg-muted/40 p-2 mt-1 text-xs">
                              {log.length === 0 && (
                                <p className="text-muted-foreground">
                                  No log entries.
                                </p>
                              )}
                              {log.length > 0 && (
                                <ul className="space-y-1">
                                  {log.map((entry, idx) => (
                                    <li
                                      key={`${a.id}-log-${idx}`}
                                      className="flex items-center gap-2"
                                    >
                                      <span className="text-muted-foreground">
                                        {new Date(entry.ts).toLocaleString()}
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] font-normal"
                                      >
                                        {entry.from_status ?? '—'} →{' '}
                                        {entry.to_status}
                                      </Badge>
                                      {entry.note && (
                                        <span className="text-muted-foreground">
                                          · {entry.note}
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
    </SuperAdminOnly>
  );
}
