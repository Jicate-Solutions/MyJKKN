'use client';

// =============================================================================
// /rcltp/student — Student portal (Phase 4b)
// =============================================================================
// The learner's home: their reading assessments (start/continue), earned badges
// + streak, and an honest "report awaiting scoring" state (composite scoring is
// MyJKKN-gated — we never show a fabricated band/score). The take-assessment flow
// (read + record + answer + submit) lives at /rcltp/student/assessment/[id].
//
// Gated to rcltp.assessment.take. The learner id is derived from the session via
// get_my_learner_id() — never trusted from input.
// =============================================================================

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Award,
  Flame,
  ClipboardList,
  Lock,
  FileBarChart,
  Dumbbell,
  BookA,
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useRcltpAssessments,
  useRcltpLearnerBadges,
  useRcltpStreaks,
} from '@/hooks/rcltp';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { RcltpAssessmentStatus } from '@/types/rcltp';

function useMyLearnerId() {
  return useQuery({
    queryKey: ['rcltp', 'my-learner-id'],
    queryFn: async (): Promise<string | null> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('get_my_learner_id');
      if (error) return null;
      return (data as string | null) ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });
}

const STATUS_LABEL: Record<RcltpAssessmentStatus, string> = {
  scheduled: 'Ready to start',
  in_progress: 'In progress',
  recorded: 'Recorded',
  queued_for_scoring: 'Submitted — awaiting scoring',
  scored: 'Scored',
  needs_review: 'Under review',
  published: 'Result published',
  not_attempted: 'Not attempted',
};

function statusVariant(s: RcltpAssessmentStatus): 'default' | 'secondary' | 'outline' {
  if (s === 'scheduled' || s === 'in_progress') return 'default';
  if (s === 'scored' || s === 'published') return 'secondary';
  return 'outline';
}

export default function RcltpStudentPage() {
  const { can, isSuperAdmin, isLoading: permLoading } = usePermissions();
  const { data: learnerId, isLoading: learnerLoading } = useMyLearnerId();

  const assessmentsQuery = useRcltpAssessments(
    learnerId ? { learner_id: learnerId } : {}
  );
  const badgesQuery = useRcltpLearnerBadges(learnerId ? { learner_id: learnerId } : {});
  const streaksQuery = useRcltpStreaks(learnerId ? { learner_id: learnerId } : {});

  if (permLoading) {
    return (
      <ContentLayout title='My Reading'>
        <Skeleton className='h-64 w-full' />
      </ContentLayout>
    );
  }

  const allowed = isSuperAdmin || can('rcltp.assessment.take');
  if (!allowed) {
    return (
      <ContentLayout title='My Reading'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>This area is for students</AlertTitle>
          <AlertDescription>
            The reading portal is available to learners taking RCLTP assessments. If you are a
            teacher or administrator, use the Teacher console or Content authoring instead.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (!learnerLoading && !learnerId) {
    return (
      <ContentLayout title='My Reading'>
        <Alert>
          <AlertTitle>No learner profile linked</AlertTitle>
          <AlertDescription>
            Your account is not linked to a learner profile yet, so there are no reading
            assessments to show. Please contact your teacher.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const assessments = assessmentsQuery.data?.data ?? [];
  const badges = badgesQuery.data?.data ?? [];
  const streak = (streaksQuery.data?.data ?? [])[0];

  return (
    <ContentLayout title='My Reading'>
      <div className='space-y-6'>
        {/* Gamification summary */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='flex items-center gap-3 rounded-xl border bg-card p-4'>
            <div className='flex h-11 w-11 items-center justify-center rounded-lg bg-amber-100 text-amber-700'>
              <Award className='h-5 w-5' />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>Badges earned</p>
              <p className='text-xl font-semibold'>
                {badgesQuery.isLoading ? '—' : badges.length}
              </p>
            </div>
          </div>
          <div className='flex items-center gap-3 rounded-xl border bg-card p-4'>
            <div className='flex h-11 w-11 items-center justify-center rounded-lg bg-orange-100 text-orange-700'>
              <Flame className='h-5 w-5' />
            </div>
            <div>
              <p className='text-sm text-muted-foreground'>Current streak</p>
              <p className='text-xl font-semibold'>
                {streaksQuery.isLoading
                  ? '—'
                  : streak
                    ? `${streak.current_streak} day${streak.current_streak === 1 ? '' : 's'}`
                    : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Assessments */}
        <section>
          <h2 className='mb-3 flex items-center gap-2 text-lg font-semibold'>
            <ClipboardList className='h-5 w-5' /> My assessments
          </h2>
          {assessmentsQuery.isLoading || learnerLoading ? (
            <Skeleton className='h-40 w-full' />
          ) : assessments.length === 0 ? (
            <div className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
              <BookOpen className='mx-auto mb-2 h-7 w-7' />
              No reading assessments assigned to you yet. Your teacher will schedule one.
            </div>
          ) : (
            <ul className='space-y-2'>
              {assessments.map((a) => {
                const canStart = a.status === 'scheduled' || a.status === 'in_progress';
                return (
                  <li
                    key={a.id}
                    className='flex items-center justify-between gap-3 rounded-lg border bg-card p-4'
                  >
                    <div className='min-w-0'>
                      <p className='font-medium'>
                        {a.assessment_type === 'cycle'
                          ? `Cycle ${a.cycle_no ?? ''}`
                          : a.assessment_type === 'baseline'
                            ? 'Baseline'
                            : 'Practice'}{' '}
                        assessment
                      </p>
                      <Badge variant={statusVariant(a.status)} className='mt-1'>
                        {STATUS_LABEL[a.status]}
                      </Badge>
                    </div>
                    {canStart ? (
                      <Button asChild size='sm'>
                        <Link href={`/rcltp/student/assessment/${a.id}`}>
                          {a.status === 'in_progress' ? 'Continue' : 'Start'}
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size='sm' variant='outline'>
                        <Link href={`/rcltp/student/assessment/${a.id}`}>View</Link>
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Practice & vocabulary */}
        <section>
          <h2 className='mb-3 flex items-center gap-2 text-lg font-semibold'>
            <Dumbbell className='h-5 w-5' /> Practice &amp; vocabulary
          </h2>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Link
              href='/rcltp/student/practice'
              className='flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/60'
            >
              <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-700'>
                <Dumbbell className='h-5 w-5' />
              </div>
              <div>
                <p className='font-medium'>Adaptive practice</p>
                <p className='text-sm text-muted-foreground'>Your weekly reading practice assignments.</p>
              </div>
            </Link>
            <Link
              href='/rcltp/student/vbb'
              className='flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/60'
            >
              <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700'>
                <BookA className='h-5 w-5' />
              </div>
              <div>
                <p className='font-medium'>Vocabulary (VBB)</p>
                <p className='text-sm text-muted-foreground'>Vocabulary Building Blocks — coming soon.</p>
              </div>
            </Link>
          </div>
        </section>

        {/* Report — honest gated state */}
        <section>
          <h2 className='mb-3 flex items-center gap-2 text-lg font-semibold'>
            <FileBarChart className='h-5 w-5' /> My report
          </h2>
          <Alert>
            <AlertTitle>Scoring coming soon</AlertTitle>
            <AlertDescription>
              Your reading band and detailed report will appear here once scoring is enabled. We
              only show validated results — never an estimated or placeholder score.
            </AlertDescription>
          </Alert>
        </section>
      </div>
    </ContentLayout>
  );
}
