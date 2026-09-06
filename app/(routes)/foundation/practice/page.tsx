'use client';

// =============================================================================
// /foundation/practice — where a learner answers Foundation questions.
// =============================================================================
// The rest of /foundation is an operator surface: cohorts, the question bank,
// the review queue. This is the one page the learner opens.
//
// Until this existed, fn_fp_record_attempt, FoundationService.recordAttempt and
// the useRecordAttempt hook had all shipped and been tested, and the hook had
// zero call sites — every authored question was unreachable. This page is the
// call site.
//
// Access: foundation.practice.take. Being enrolled is a separate matter from
// holding the permission, and the two failures read differently on purpose —
// "you cannot open this" and "you are not on the programme yet" are different
// problems with different people to talk to.
// =============================================================================

import { useEffect, useState } from 'react';
import { GraduationCap, Lock } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { PracticeRunner } from './_components/practice-runner';

interface ExamOption {
  examDefinitionId: string;
  name: string;
  questionCount: number;
}

interface PracticePayload {
  learner: { id: string; full_name: string; grade: string | null } | null;
  exams: ExamOption[];
}

export default function FoundationPracticePage() {
  const { canAccess, isLoading: permissionsLoading } = usePermissions();
  const allowed = canAccess('foundation', 'practice.take');

  const [data, setData] = useState<PracticePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<ExamOption | null>(null);

  useEffect(() => {
    if (permissionsLoading || !allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/foundation/practice');
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error ?? 'Practice could not be loaded.');
          return;
        }
        setData(body);
      } catch {
        if (!cancelled) {
          setError('Practice could not be loaded. Check your connection and try again.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [permissionsLoading, allowed]);

  if (permissionsLoading) {
    return (
      <ContentLayout>
        <div className="mx-auto max-w-2xl space-y-4 py-10">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </ContentLayout>
    );
  }

  // Never a silent bounce to the dashboard: say what is missing and who fixes it.
  if (!allowed) {
    return (
      <ContentLayout>
        <div className="mx-auto max-w-lg py-16 text-center">
          <Lock className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">
            You do not have access to Foundation practice
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page needs the <code className="text-xs">foundation.practice.take</code>{' '}
            permission. Ask whoever manages roles at your institution to add it.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (active) {
    return (
      <ContentLayout>
        <PracticeRunner
          examDefinitionId={active.examDefinitionId}
          examName={active.name}
          onExit={() => setActive(null)}
        />
      </ContentLayout>
    );
  }

  return (
    <ContentLayout>
      <div className="mx-auto max-w-2xl py-6">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Practice
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A short set of questions, one at a time. Nothing is timed and nothing
            is reported as a mark — the point is the explanation at the end.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            {error}
          </p>
        )}

        {!error && !data && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        )}

        {data && !data.learner && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <GraduationCap className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-foreground">
              You are not on the Foundation programme yet.
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Once someone at your school enrols you, your subjects appear here.
            </p>
          </div>
        )}

        {data?.learner && data.exams.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-foreground">No subjects are open yet.</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Questions are being prepared. This page fills in as each subject is
              made ready.
            </p>
          </div>
        )}

        {data?.learner && data.exams.length > 0 && (
          <ul className="space-y-3">
            {data.exams.map((exam) => (
              <li key={exam.examDefinitionId}>
                <button
                  type="button"
                  onClick={() => setActive(exam)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-border p-5 text-left transition-colors hover:border-muted-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span>
                    <span className="block text-base font-medium text-foreground">
                      {exam.name}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">
                      {exam.questionCount} question
                      {exam.questionCount === 1 ? '' : 's'} ready
                    </span>
                  </span>
                  {/* Not a <Button>: this whole row is already the button, and
                      nesting interactive elements breaks keyboard navigation. */}
                  <span className="shrink-0 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground">
                    Start
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ContentLayout>
  );
}
