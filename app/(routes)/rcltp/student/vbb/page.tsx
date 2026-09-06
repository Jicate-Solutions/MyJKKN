'use client';

// =============================================================================
// /rcltp/student/vbb — Vocabulary Building Blocks SHELL (Phase 4b)
// =============================================================================
// The student-facing vocabulary surface. The 5,000-word VBB list is MyJKKN-gated
// content: until it lands, useRcltpVbbWords() returns an empty set and we render
// an honest "word list coming soon (awaiting MyJKKN content)" shell — we NEVER
// invent words, definitions, or scores. When real words exist they're listed
// simply (word + definition). Per-learner progress (useRcltpVbbProgress) is only
// surfaced when real rows exist; we never fabricate a score or completion rate.
//
// Gated to rcltp.assessment.take (super-admin always allowed). The learner id is
// derived from the session via get_my_learner_id() — never trusted from input.
// =============================================================================

import { useQuery } from '@tanstack/react-query';
import { BookA, Lock } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useRcltpVbbWords, useRcltpVbbProgress } from '@/hooks/rcltp';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { VbbWordList } from './_components/vbb-word-list';

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

export default function RcltpStudentVbbPage() {
  const { can, isSuperAdmin, isLoading: permLoading } = usePermissions();
  const { data: learnerId, isLoading: learnerLoading } = useMyLearnerId();

  // Active words only — the student-facing list never shows retired/inactive words.
  const wordsQuery = useRcltpVbbWords({ is_active: true });
  const progressQuery = useRcltpVbbProgress(
    learnerId ? { learner_id: learnerId } : {}
  );

  if (permLoading) {
    return (
      <ContentLayout title='Vocabulary Building Blocks'>
        <Skeleton className='h-64 w-full' />
      </ContentLayout>
    );
  }

  const allowed = isSuperAdmin || can('rcltp.assessment.take');
  if (!allowed) {
    return (
      <ContentLayout title='Vocabulary Building Blocks'>
        <Alert>
          <Lock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>This area is for students</AlertTitle>
          <AlertDescription>
            Vocabulary Building Blocks is available to learners taking RCLTP assessments. If you
            are a teacher or administrator, use the Teacher console or Content authoring instead.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (!learnerLoading && !learnerId) {
    return (
      <ContentLayout title='Vocabulary Building Blocks'>
        <Alert>
          <AlertTitle>No learner profile linked</AlertTitle>
          <AlertDescription>
            Your account is not linked to a learner profile yet, so there is no vocabulary
            progress to show. Please contact your teacher.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  const words = wordsQuery.data?.data ?? [];
  const progressRows = progressQuery.data?.data ?? [];

  return (
    <ContentLayout title='Vocabulary Building Blocks'>
      <div className='space-y-6'>
        {/* Intro */}
        <p className='text-sm text-muted-foreground'>
          Vocabulary Building Blocks (VBB) grows your word knowledge week by week. Below is your
          word list and — once available — your progress.
        </p>

        {/* My progress — only shown when REAL rows exist (never fabricated) */}
        {progressRows.length > 0 && (
          <section>
            <h2 className='mb-3 text-lg font-semibold'>My progress</h2>
            <ul className='space-y-2'>
              {progressRows.map((p) => (
                <li
                  key={p.id}
                  className='flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-4 text-sm'
                >
                  <span className='font-medium capitalize'>
                    {p.stage ?? 'Vocabulary'}
                    {p.week_of ? ` — week of ${p.week_of}` : ''}
                  </span>
                  <span className='text-muted-foreground'>
                    {p.completion_rate != null
                      ? `${Math.round(p.completion_rate)}% complete`
                      : 'In progress'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Word list (or honest MyJKKN-gated shell) */}
        <section>
          <h2 className='mb-3 flex items-center gap-2 text-lg font-semibold'>
            <BookA className='h-5 w-5' aria-hidden='true' /> Word list
          </h2>
          {wordsQuery.isLoading ? (
            <Skeleton className='h-48 w-full' />
          ) : wordsQuery.isError ? (
            <Alert>
              <AlertTitle>Couldn&apos;t load the word list</AlertTitle>
              <AlertDescription>
                We couldn&apos;t load your vocabulary words right now. Please refresh the page to
                try again.
              </AlertDescription>
            </Alert>
          ) : (
            <VbbWordList words={words} />
          )}
        </section>
      </div>
    </ContentLayout>
  );
}
