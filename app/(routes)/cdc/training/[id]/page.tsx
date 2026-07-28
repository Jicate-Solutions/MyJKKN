'use client';

import { use, useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useCdcProgramme, useCdcEnrollments, useUpdateCdcEnrollment, useSyncTrainingAttendance } from '@/hooks/cdc/use-cdc-training';
import { useAuth } from '@/hooks/use-auth';
import { ArrowLeft, Calendar, BookOpen, Users, Building2, Plus, CheckCircle2, XCircle, Upload, RefreshCw, Loader2, Pencil } from 'lucide-react';
import Link from 'next/link';
import { AddEnrollmentDialog } from './_components/add-enrollment-dialog';
import { BulkEnrollDialog } from './_components/bulk-enroll-dialog';
import { SemesterScheduleCard } from './_components/semester-schedule-card';
import type { TrainingProgrammeStatus, EnrollmentStatus } from '@/types/cdc/training';
import { TrainingPollHostDialog, type TrainingPollHostAdapter } from '@/components/live-poll/training-poll-host-dialog';
import { TrainingPollAnswerCard, type TrainingAnswerAdapter } from '@/components/live-poll/training-poll-answer-card';
import { CdcPollService } from '@/lib/services/live-poll/cdc-poll-service';

const STATUS_COLORS: Record<TrainingProgrammeStatus, string> = {
  planned: 'bg-blue-100 text-blue-800',
  ongoing: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

const ENROLLMENT_STATUS_COLORS: Record<EnrollmentStatus, string> = {
  enrolled: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  dropped: 'bg-red-100 text-red-800',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default function TrainingProgrammeDetailPage(props: Props) {
  return (
    <PermissionGuard module="cdc.training" action="view">
      <TrainingProgrammeDetailContent {...props} />
    </PermissionGuard>
  );
}

function TrainingProgrammeDetailContent({ params }: Props) {
  const { id } = use(params);
  const { profile } = useAuth();
  const { data: programme, isLoading } = useCdcProgramme(id);
  const { data: enrollments, isLoading: enrollmentsLoading } = useCdcEnrollments({ programme_id: id });
  const updateEnrollment = useUpdateCdcEnrollment();
  const syncAttendance = useSyncTrainingAttendance(id);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const hasWindow = !!programme?.start_date && !!programme?.end_date;

  const canManage = profile?.is_super_admin ||
    profile?.role === 'admin' ||
    profile?.role === 'administrator' ||
    profile?.role === 'cdc_head' ||
    profile?.role === 'cdc_coordinator';

  // Live poll (Phase C) — trainer/admin host over the shared engine, keyed by programme.
  const pollHostAdapter: TrainingPollHostAdapter = useMemo(() => ({
    getPoll: () => CdcPollService.getPoll(id),
    upsertPoll: (qs) => CdcPollService.upsertPoll(id, qs),
    openPoll: (pid) => CdcPollService.openPoll(pid),
    closePoll: (pid) => CdcPollService.closePoll(pid),
    getTotals: (pid) => CdcPollService.getTotals(pid),
    setCurrentQuestion: (pid, qid) => CdcPollService.setCurrentQuestion(pid, qid),
    getResponders: async (pid) => (await CdcPollService.getResponders(pid)).map((r) => ({
      id: r.learner_id, code: r.register_number || r.roll_number, name: r.learner_name,
      questions_answered: r.questions_answered, answered_at: r.answered_at,
    })),
  }), [id]);
  // Enrollee answer surface — renders only when this learner has an open training poll.
  const pollAnswerAdapter: TrainingAnswerAdapter = useMemo(() => ({
    getMyOpenPolls: async () => (await CdcPollService.getMyOpenPolls()).map((p) => ({
      poll_id: p.poll_id, title: p.programme_name, already_answered: p.already_answered,
    })),
    getForAnswering: (pid) => CdcPollService.getForAnswering(pid),
    submit: (pid, ans) => CdcPollService.submit(pid, ans),
    getQuestionTotals: (pid) => CdcPollService.getLearnerQuestionTotals(pid),
  }), []);

  if (isLoading) {
    return (
      <ContentLayout title="Training Programme">
        <div className="space-y-4 mt-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      </ContentLayout>
    );
  }

  if (!programme) {
    return (
      <ContentLayout title="Not Found">
        <div className="mt-8 text-center">
          <p className="text-lg">Training programme not found.</p>
          <Button asChild className="mt-4" variant="outline">
            <Link href="/cdc/training"><ArrowLeft className="w-4 h-4 mr-2" />Back to list</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={programme.name}>
      <PageBreadcrumb items={[
        { label: 'Home', href: '/' },
        { label: 'CDC' },
        { label: 'Training Programmes', href: '/cdc/training' },
        { label: programme.name },
      ]} />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex items-start gap-3 flex-wrap">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/cdc/training"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold">{programme.name}</h1>
              <Badge className={STATUS_COLORS[programme.status as TrainingProgrammeStatus] ?? ''}>
                {programme.status}
              </Badge>
            </div>
            {programme.training_type && (
              <p className="text-sm text-primary font-medium mt-0.5 uppercase tracking-wide">
                {programme.training_type.display_name}
              </p>
            )}
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <TrainingPollHostDialog adapter={pollHostAdapter} title={programme.name} />
              <Button variant="outline" size="sm" asChild>
                <Link href={`/cdc/training/${id}/edit`}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Live training poll — appears only when an enrolled learner has an open poll. */}
        <TrainingPollAnswerCard adapter={pollAnswerAdapter} />

        {/* Details card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Programme Info</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
            {programme.institution ? (
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{programme.institution.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="w-4 h-4 shrink-0" />
                <span>Cross-college</span>
              </div>
            )}
            {programme.total_hours != null && (
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{programme.total_hours} hours</span>
              </div>
            )}
            {(programme.start_date || programme.end_date) && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>{programme.start_date ?? '—'} to {programme.end_date ?? '—'}</span>
              </div>
            )}
            {programme.external_provider && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>Provider: {programme.external_provider}</span>
              </div>
            )}
            {programme.description && (
              <div className="sm:col-span-2 text-muted-foreground">{programme.description}</div>
            )}
          </CardContent>
        </Card>

        {/* Semester Schedule (BUG-004200) */}
        <SemesterScheduleCard programmeId={id} targetDepartmentId={programme.target_department_id} />

        <Separator />

        {/* Enrollments */}
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">
              Enrolled Learners {!enrollmentsLoading && `(${enrollments?.length ?? 0})`}
            </h2>
            <PermissionGuard module="cdc.training" action="edit">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!hasWindow || syncAttendance.isPending || (enrollments ?? []).length === 0}
                  title={hasWindow
                    ? 'Recompute each learner’s attendance from the academic attendance records over this programme’s date window'
                    : 'Set the programme start and end dates first'}
                  onClick={() => syncAttendance.mutate()}
                >
                  {syncAttendance.isPending
                    ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    : <RefreshCw className="w-4 h-4 mr-1" />}
                  Recompute attendance
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                  <Upload className="w-4 h-4 mr-1" /> Bulk Add
                </Button>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Learner
                </Button>
              </div>
            </PermissionGuard>
          </div>

          {enrollmentsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded" />)}
            </div>
          ) : (enrollments ?? []).length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2" />
              <p>No learners enrolled yet.</p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {(enrollments ?? []).map((enrollment) => (
                <div key={enrollment.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{[enrollment.learner?.first_name, enrollment.learner?.last_name].filter(Boolean).join(' ') || 'Unknown learner'}</p>
                    <p className="text-muted-foreground text-xs">
                      {enrollment.learner?.roll_number && `${enrollment.learner.roll_number} · `}
                      {enrollment.learner?.institution?.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {enrollment.attendance_pct != null ? (
                      <span
                        className="text-xs text-muted-foreground"
                        title={enrollment.attendance_source === 'auto_window' && enrollment.attendance_basis
                          ? `Computed from ${enrollment.attendance_basis.records_present ?? 0}/${enrollment.attendance_basis.records_total ?? 0} attendance records in the programme window`
                          : 'Manually entered'}
                      >
                        {enrollment.attendance_pct}% attendance
                        {enrollment.attendance_source === 'auto_window' && (
                          <span className="ml-1 text-[10px] uppercase tracking-wide text-emerald-600">auto</span>
                        )}
                      </span>
                    ) : enrollment.attendance_source === 'auto_window' ? (
                      <span className="text-xs text-amber-600" title="No attendance records found in the programme date window — not the same as 0% attendance.">
                        No records in window
                      </span>
                    ) : null}
                    <Badge className={`text-xs ${ENROLLMENT_STATUS_COLORS[enrollment.status as EnrollmentStatus] ?? ''}`}>
                      {enrollment.status}
                    </Badge>
                    {canManage && enrollment.status !== 'completed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => updateEnrollment.mutate({ id: enrollment.id, dto: { status: 'completed' } })}
                        title="Mark as completed"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      </Button>
                    )}
                    {canManage && enrollment.status !== 'dropped' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => updateEnrollment.mutate({ id: enrollment.id, dto: { status: 'dropped' } })}
                        title="Mark as dropped"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {canManage && (
        <>
          <AddEnrollmentDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            programmeId={id}
          />
          <BulkEnrollDialog
            open={bulkOpen}
            onOpenChange={setBulkOpen}
            programmeId={id}
            existingEnrollments={enrollments ?? []}
          />
        </>
      )}
    </ContentLayout>
  );
}
