// ============================================================================
// HR — Training (Staff-facing) — T5.3
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.3
// Created: 2026-06-19
//
// Staff surface. Shows two sections:
//   1. My Enrollments — programs the logged-in staff member is enrolled in
//   2. Browse Open Programs — open + in_progress programs available to enroll
// ============================================================================

'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { AddToLinkedInButton } from '@/components/linkedin/add-to-linkedin-button';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TrainingService,
  type HRTrainingSession,
  type HRTrainingEnrollment,
  type TrainingCategory,
  type EnrollmentStatus,
} from '@/lib/services/hr/training-service';
import { TrainingPollAnswerCard, type TrainingAnswerAdapter } from '@/components/live-poll/training-poll-answer-card';
import { HrPollService } from '@/lib/services/live-poll/hr-poll-service';

const CATEGORY_LABELS: Record<TrainingCategory, string> = {
  induction: 'Induction',
  internal: 'Internal',
  specialised: 'Specialised',
  fdp: 'FDP',
};

const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  registered: 'Registered',
  attended: 'Attended',
  completed: 'Completed',
  dropped: 'Dropped',
};

const ENROLLMENT_COLOR: Record<EnrollmentStatus, string> = {
  registered:
    'bg-blue-100 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200',
  attended:
    'bg-amber-100 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200',
  completed:
    'bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200',
  dropped: 'bg-gray-100 text-gray-900 dark:bg-gray-900/20 dark:text-gray-200',
};

export default function StaffTrainingPage() {
  const [staffId, setStaffId] = useState<string | null>(null);
  const [myEnrollments, setMyEnrollments] = useState<HRTrainingEnrollment[]>(
    [],
  );
  const [programsById, setProgramsById] = useState<
    Record<string, HRTrainingSession>
  >({});
  const [openPrograms, setOpenPrograms] = useState<HRTrainingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Staff trainee live-poll answer surface (Phase C) — discovers open HR polls for
  // sessions this staff member is enrolled in; renders nothing otherwise.
  const pollAnswerAdapter: TrainingAnswerAdapter = useMemo(() => ({
    getMyOpenPolls: async () => (await HrPollService.getMyOpenPolls()).map((p) => ({
      poll_id: p.poll_id, title: p.session_title, already_answered: p.already_answered,
    })),
    getForAnswering: (pid) => HrPollService.getForAnswering(pid),
    submit: (pid, ans) => HrPollService.submit(pid, ans),
    getQuestionTotals: (pid) => HrPollService.getStaffQuestionTotals(pid),
  }), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClientSupabaseClient();
        // Resolve staff_id from auth profile
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        const uid = userData?.user?.id;
        let resolvedStaffId: string | null = null;
        if (uid) {
          const { data: staffRow } = await supabase
            .from('staff')
            .select('id')
            .eq('profile_id', uid)
            .maybeSingle();
          resolvedStaffId = (staffRow as { id?: string } | null)?.id ?? null;
        }

        const open = await TrainingService.listOpenSessions(supabase);
        let enrollments: HRTrainingEnrollment[] = [];
        const programsLookup: Record<string, HRTrainingSession> = {};
        for (const p of open) programsLookup[p.id] = p;

        if (resolvedStaffId) {
          enrollments = await TrainingService.listEnrollments(supabase, {
            staff_id: resolvedStaffId,
          });
          // Hydrate any sessions not in the open-list
          const missing = enrollments
            .map((e) => e.session_id)
            .filter((pid) => !programsLookup[pid]);
          if (missing.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fromAny = supabase.from as any;
            const { data: progRows } = await fromAny.call(supabase, 'hr_training_sessions')
              .select('*')
              .in('id', missing);
            for (const p of (progRows ?? []) as HRTrainingSession[]) {
              programsLookup[p.id] = p;
            }
          }
        }

        if (!cancelled) {
          setStaffId(resolvedStaffId);
          setMyEnrollments(enrollments);
          setOpenPrograms(open);
          setProgramsById(programsLookup);
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

  const enrolledSessionIds = new Set(myEnrollments.map((e) => e.session_id));
  const browsable = openPrograms.filter((p) => !enrolledSessionIds.has(p.id));

  return (
    <ContentLayout title="HR Training">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Training</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Training</h1>
          <p className="text-sm text-muted-foreground">
            Your enrolled programs + open programs you can join. Completion
            certificates appear here.
          </p>
        </div>

        {/* Live training poll — appears only when the trainer opens a poll for a
            session this staff member is enrolled in (Phase C). */}
        <TrainingPollAnswerCard adapter={pollAnswerAdapter} />

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
        )}

        {!loading && !staffId && (
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground">
              Your staff record could not be resolved from your login. Please
              ask HR to link your profile to your staff record before
              enrolling in training programs.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-4 w-4" /> My Enrollments (
              {myEnrollments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!loading && myEnrollments.length === 0 && (
              <p className="text-sm text-muted-foreground">
                You aren&apos;t enrolled in any training programs yet. Browse
                open programs below.
              </p>
            )}
            {myEnrollments.length > 0 && (
              <div className="space-y-2">
                {myEnrollments.map((en) => {
                  const p = programsById[en.session_id];
                  return (
                    <div
                      key={en.id}
                      className="border rounded-md p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">
                            {p?.title ?? en.session_id}
                          </span>
                          {p && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-normal"
                            >
                              {CATEGORY_LABELS[p.category]}
                            </Badge>
                          )}
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded ${ENROLLMENT_COLOR[en.status]}`}
                          >
                            {ENROLLMENT_STATUS_LABELS[en.status]}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {p && `${p.start_date} → ${p.end_date}`}
                          {p?.location ? ` · ${p.location}` : ''}
                          {en.certificate_url && (
                            <>
                              {' · '}
                              <a
                                href={en.certificate_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline"
                              >
                                View certificate
                              </a>
                            </>
                          )}
                        </div>
                        {/* Staff can add a completed training to their LinkedIn.
                            HR training certs are EXTERNAL URLs (FDP/NPTEL PDFs an
                            admin pastes on completion) — not JKKN /verify creds —
                            so certUrl points at the stored external certificate. */}
                        {en.status === 'completed' && en.certificate_url && (
                          <div className="mt-2">
                            <AddToLinkedInButton
                              cert={{
                                name: p?.title || 'Training Programme',
                                certUrl: en.certificate_url,
                              }}
                            />
                          </div>
                        )}
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
              Open Programs ({browsable.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!loading && browsable.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No open programs available right now.
              </p>
            )}
            {browsable.length > 0 && (
              <div className="space-y-2">
                {browsable.map((p) => (
                  <Link
                    key={p.id}
                    href={`/hr/training/${p.id}/enroll`}
                    className="border rounded-md p-3 hover:bg-muted/40 flex items-center justify-between gap-3 transition"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{p.title}</span>
                        <Badge
                          variant="outline"
                          className="text-[10px] font-normal"
                        >
                          {CATEGORY_LABELS[p.category]}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {p.start_date} → {p.end_date}
                        {p.location ? ` · ${p.location}` : ''}
                        {p.capacity ? ` · capacity ${p.capacity}` : ''}
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline">
                        Enroll
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
