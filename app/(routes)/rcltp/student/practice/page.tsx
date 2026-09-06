'use client';

// =============================================================================
// /rcltp/student/practice — Student practice surface (Phase 4b)
// =============================================================================
// The learner's weekly adaptive-practice set: each assignment shows only its
// REAL counts (exercises_assigned / exercises_completed) and status, plus a
// "Mark complete" action that posts to the live Phase-3 service-role route
// (RcltpScheduleService.recordPracticeCompletion → /api/rcltp/practice/[id]/
// complete). We never fabricate progress — empty rows show honest empties.
//
// Gated to rcltp.assessment.take (super-admin always allowed). The learner id is
// derived from the session via get_my_learner_id() — never trusted from input.
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Lock } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useRcltpPracticeAssignments } from '@/hooks/rcltp';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { PracticeList } from './_components/practice-list';

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

export default function RcltpStudentPracticePage() {
  const { can, isSuperAdmin, isLoading: permLoading } = usePermissions();
  const { data: learnerId, isLoading: learnerLoading } = useMyLearnerId();

  const practiceQuery = useRcltpPracticeAssignments(
    learnerId ? { learner_id: learnerId } : {}
  );

  if (permLoading) {
    return (
      <ContentLayout title='My Practice'>
        <Skeleton className='h-64 w-full' />
      </ContentLayout>
    );
  }

  const allowed = isSuperAdmin || can('rcltp.assessment.take');
  if (!allowed) {
    return (
      <ContentLayout title='My Practice'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>This area is for students</AlertTitle>
          <AlertDescription>
            Reading practice is available to learners taking RCLTP assessments. If you are a
            teacher or administrator, use the Teacher console or Content authoring instead.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (!learnerLoading && !learnerId) {
    return (
      <ContentLayout title='My Practice'>
        <Alert>
          <AlertTitle>No learner profile linked</AlertTitle>
          <AlertDescription>
            Your account is not linked to a learner profile yet, so there is no practice to
            show. Please contact your teacher.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const assignments = practiceQuery.data?.data ?? [];

  return (
    <ContentLayout title='My Practice'>
      <div className='space-y-6'>
        <section>
          <h2 className='mb-3 flex items-center gap-2 text-lg font-semibold'>
            <Dumbbell className='h-5 w-5' aria-hidden='true' /> Weekly practice
          </h2>
          {practiceQuery.isLoading || learnerLoading ? (
            <Skeleton className='h-48 w-full' />
          ) : practiceQuery.isError ? (
            <Alert>
              <AlertTitle>Couldn&apos;t load your practice</AlertTitle>
              <AlertDescription>
                We couldn&apos;t load your practice assignments right now. Please refresh the page
                to try again.
              </AlertDescription>
            </Alert>
          ) : (
            <PracticeList assignments={assignments} />
          )}
        </section>
      </div>
    </ContentLayout>
  );
}
