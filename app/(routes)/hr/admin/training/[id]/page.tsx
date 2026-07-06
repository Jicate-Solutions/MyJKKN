// ============================================================================
// HR — Training Program Detail (Admin) — T5.3
// Spec: specs/hr-module-decomposition-2026-05-09.md §T5.3
// Created: 2026-06-19
//
// Shows program summary + enrollment list. Officer/super_admin can:
//   - Change program status (draft → open → in_progress → completed/cancelled)
//   - Mark enrollments attended / completed / dropped
//   - Issue certificate URL on completion
// ============================================================================

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  TrainingService,
  type HRTrainingSession,
  type HRTrainingEnrollment,
  type TrainingStatus,
  type EnrollmentStatus,
  type TrainingCategory,
} from '@/lib/services/hr/training-service';
import { TrainingPollHostDialog, type TrainingPollHostAdapter } from '@/components/live-poll/training-poll-host-dialog';
import { HrPollService } from '@/lib/services/live-poll/hr-poll-service';

const STATUS_LABELS: Record<TrainingStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

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

export default function AdminTrainingDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [program, setProgram] = useState<HRTrainingSession | null>(null);
  const [enrollments, setEnrollments] = useState<
    Array<HRTrainingEnrollment & { staff_name: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Live poll (Phase C) — HR trainer/admin host over the shared engine, keyed by session.
  const pollHostAdapter: TrainingPollHostAdapter = useMemo(() => ({
    getPoll: () => HrPollService.getPoll(id ?? ''),
    upsertPoll: (qs) => HrPollService.upsertPoll(id ?? '', qs),
    openPoll: (pid) => HrPollService.openPoll(pid),
    closePoll: (pid) => HrPollService.closePoll(pid),
    getTotals: (pid) => HrPollService.getTotals(pid),
    setCurrentQuestion: (pid, qid) => HrPollService.setCurrentQuestion(pid, qid),
    getResponders: async (pid) => (await HrPollService.getResponders(pid)).map((r) => ({
      id: r.staff_id, code: r.staff_code, name: r.staff_name,
      questions_answered: r.questions_answered, answered_at: r.answered_at,
    })),
  }), [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = createClientSupabaseClient();
      const [p, e] = await Promise.all([
        TrainingService.getSession(supabase, id),
        TrainingService.listEnrollmentsWithStaff(supabase, id),
      ]);
      setProgram(p);
      setEnrollments(e);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeProgramStatus(newStatus: TrainingStatus) {
    if (!program) return;
    setStatusUpdating(true);
    try {
      const supabase = createClientSupabaseClient();
      const updated = await TrainingService.updateSession(supabase, program.id, {
        status: newStatus,
      });
      setProgram(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusUpdating(false);
    }
  }

  async function changeEnrollmentStatus(
    enrollmentId: string,
    action: 'attended' | 'completed' | 'dropped',
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let url: string | null = null;
      if (action === 'completed') {
        const input = window.prompt('Certificate URL (optional):', '');
        url = input && input.trim() ? input.trim() : null;
        await TrainingService.completeEnrollment(supabase, enrollmentId, {
          certificate_url: url,
        });
      } else if (action === 'attended') {
        await TrainingService.markAttended(supabase, enrollmentId);
      } else {
        await TrainingService.dropEnrollment(supabase, enrollmentId);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <SuperAdminOnly>
    <ContentLayout title={program?.title ?? 'Training Program'}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin">HR</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/hr/admin/training">Training</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {program?.title ?? (loading ? 'Loading…' : 'Not found')}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            Error: {error}
          </p>
        )}

        {!loading && !program && !error && (
          <p className="text-sm text-muted-foreground">Program not found.</p>
        )}

        {program && (
          <>
            <div className="flex justify-end">
              <TrainingPollHostDialog adapter={pollHostAdapter} title={program.title} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Program Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Title</div>
                    <div className="font-medium">{program.title}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Category</div>
                    <Badge variant="outline">
                      {CATEGORY_LABELS[program.category]}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Start</div>
                    <div>{program.start_date}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">End</div>
                    <div>{program.end_date}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Location</div>
                    <div>{program.location ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Capacity</div>
                    <div>{program.capacity ?? 'Unlimited'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Facilitator
                    </div>
                    <div>{program.facilitator_name ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <Select
                      value={program.status}
                      onValueChange={(v) =>
                        changeProgramStatus(v as TrainingStatus)
                      }
                      disabled={statusUpdating}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          Object.keys(STATUS_LABELS) as TrainingStatus[]
                        ).map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {program.description && (
                  <div>
                    <div className="text-xs text-muted-foreground">Description</div>
                    <p className="text-sm whitespace-pre-line">
                      {program.description}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Enrollments ({enrollments.length}
                  {program.capacity ? ` / ${program.capacity}` : ''})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {enrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No enrollments yet. When this program is{' '}
                    <strong>Open</strong>, staff can self-enroll from{' '}
                    <code>/hr/training</code>.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {enrollments.map((en) => (
                      <div
                        key={en.id}
                        className="border rounded-md p-3 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {en.staff_name ?? en.staff_id}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded ${ENROLLMENT_COLOR[en.status]}`}
                            >
                              {ENROLLMENT_STATUS_LABELS[en.status]}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Enrolled {new Date(en.enrolled_at).toLocaleDateString()}
                            {en.completed_at &&
                              ` · Completed ${new Date(en.completed_at).toLocaleDateString()}`}
                            {en.certificate_url && (
                              <>
                                {' · '}
                                <a
                                  href={en.certificate_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary underline"
                                >
                                  Certificate
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          {en.status === 'registered' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                changeEnrollmentStatus(en.id, 'attended')
                              }
                            >
                              Mark Attended
                            </Button>
                          )}
                          {(en.status === 'registered' ||
                            en.status === 'attended') && (
                            <>
                              <Button
                                size="sm"
                                onClick={() =>
                                  changeEnrollmentStatus(en.id, 'completed')
                                }
                              >
                                Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  changeEnrollmentStatus(en.id, 'dropped')
                                }
                              >
                                Drop
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
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
