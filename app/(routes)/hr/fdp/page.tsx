// ============================================================================
// HR — FDP (Staff-facing) — T5.4
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.4
// Created: 2026-06-22
//
// Faculty surface. Shows:
//   1. My FDP Applications — applications + outcomes
//   2. Browse FDP Catalog — published entries the faculty can apply to
// ============================================================================

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight, GraduationCap } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  FdpService,
  type FdpCatalogEntry,
  type FdpApplicationStatus,
} from '@/lib/services/hr/fdp-service';
import type { HRTrainingEnrollment } from '@/lib/services/hr/training-service';

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

export default function StaffFdpPage() {
  const [staffId, setStaffId] = useState<string | null>(null);
  const [myApplications, setMyApplications] = useState<HRTrainingEnrollment[]>(
    [],
  );
  const [catalog, setCatalog] = useState<FdpCatalogEntry[]>([]);
  const [entryById, setEntryById] = useState<Record<string, FdpCatalogEntry>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const uid = userData?.user?.id ?? null;

        let resolved: string | null = null;
        if (uid) {
          const { data: staffRow } = await supabase
            .from('staff')
            .select('id')
            .eq('profile_id', uid)
            .maybeSingle();
          resolved = (staffRow as { id?: string } | null)?.id ?? null;
        }

        const cat = await FdpService.getCatalog(supabase);
        const lookup: Record<string, FdpCatalogEntry> = {};
        for (const c of cat) lookup[c.id] = c;

        let apps: HRTrainingEnrollment[] = [];
        if (resolved) {
          apps = await FdpService.listApplications(supabase, {
            staff_id: resolved,
          });
          // Hydrate any FDP entries referenced by applications but not in the
          // public catalog (e.g. drafts).
          const missing = apps
            .map((a) => a.session_id)
            .filter((sid) => !lookup[sid]);
          if (missing.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fromAny = supabase.from as any;
            const { data: progRows } = await fromAny.call(
              supabase,
              'hr_training_sessions',
            )
              .select('*')
              .in('id', missing);
            for (const p of (progRows ?? []) as FdpCatalogEntry[]) {
              lookup[p.id] = {
                ...p,
                fdp_application_metadata:
                  (p.fdp_application_metadata ?? {}) as Record<string, unknown>,
              };
            }
          }
        }

        if (!cancelled) {
          setStaffId(resolved);
          setMyApplications(apps);
          setCatalog(cat);
          setEntryById(lookup);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const appliedSessionIds = new Set(myApplications.map((a) => a.session_id));
  const browsable = catalog.filter((c) => !appliedSessionIds.has(c.id));

  return (
    <ContentLayout title="Faculty Development Programme">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>FDP</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Faculty Development Programme</h1>
          <p className="text-sm text-muted-foreground">
            Apply for FDPs sponsored by UGC, AICTE or internal funds. Each
            application requires HoD then Director approval.
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
        )}

        {!loading && !staffId && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Your staff record could not be resolved from your login. Please
              ask HR to link your profile to your staff record before applying
              for FDPs.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4" /> My Applications (
              {myApplications.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!loading && myApplications.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You haven&apos;t applied to any FDPs yet. Browse the catalog
                below.
              </p>
            )}
            {myApplications.length > 0 && (
              <div className="space-y-2">
                {myApplications.map((a) => {
                  const e = entryById[a.session_id];
                  const s = a.status as FdpApplicationStatus;
                  return (
                    <div
                      key={a.id}
                      className="border rounded-md p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {e?.title ?? a.session_id}
                          </span>
                          {e?.sponsoring_body && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              {e.sponsoring_body}
                            </Badge>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded ${STATUS_COLOR[s]}`}
                          >
                            {STATUS_LABEL[s] ?? s}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {e && `${e.start_date} → ${e.end_date}`}
                          {e?.location ? ` · ${e.location}` : ''}
                          {a.certificate_url && (
                            <>
                              {' · '}
                              <a
                                href={a.certificate_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline"
                              >
                                View certificate
                              </a>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              FDP Catalog ({browsable.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!loading && browsable.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No FDPs open for applications right now.
              </p>
            )}
            {browsable.length > 0 && (
              <div className="space-y-2">
                {browsable.map((e) => (
                  <Link
                    key={e.id}
                    href={`/hr/fdp/${e.id}/apply`}
                    className="border rounded-md p-3 hover:bg-muted/40 flex items-center justify-between gap-3 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{e.title}</span>
                        {e.sponsoring_body && (
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            {e.sponsoring_body}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {e.start_date} → {e.end_date}
                        {e.location ? ` · ${e.location}` : ''}
                        {e.external_faculty_name
                          ? ` · ${e.external_faculty_name}`
                          : ''}
                        {e.external_faculty_org
                          ? ` (${e.external_faculty_org})`
                          : ''}
                      </div>
                      {e.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {e.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline">
                        Apply
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
