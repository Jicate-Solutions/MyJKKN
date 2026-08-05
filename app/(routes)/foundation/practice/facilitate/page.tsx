'use client';

// =============================================================================
// /foundation/practice/facilitate — running a practice session for a group.
// =============================================================================
// Foundation is aimed largely at children who hold no account here.
// fp_students.profile_id is nullable precisely so a child can be on the
// programme without a login, and this is the screen that makes that usable: the
// Senior Learner running the session picks a learner from their own group and
// records that learner's answers.
//
// Why this is a separate page from /foundation/practice rather than a mode of
// it: on that page you are always answering as yourself, and the identity comes
// from RLS with no id crossing the wire at all. Keeping the two apart means the
// self-answering path cannot be talked into acting for somebody else by a query
// string it never reads.
//
// Access: foundation.practice.take, the same key as answering for yourself.
// Holding it is not enough — you also have to actually run a group, which is
// fp_cohorts.resource_person_id, and the two failures read differently on
// purpose.
// =============================================================================

import { useEffect, useState } from 'react';
import { ArrowLeft, Lock, Users } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PracticeRunner } from '../_components/practice-runner';

interface LearnerOption {
  id: string;
  fullName: string;
  grade: string | null;
}

interface CohortExam {
  examDefinitionId: string;
  name: string;
  isActive: boolean;
  questionCount: number;
}

interface Cohort {
  id: string;
  term: string | null;
  schoolName: string | null;
  exam: CohortExam | null;
  learners: LearnerOption[];
}

interface Selection {
  learner: LearnerOption;
  exam: CohortExam;
}

export default function FoundationFacilitatePage() {
  const { canAccess, isLoading: permissionsLoading } = usePermissions();
  const allowed = canAccess('foundation', 'practice.take');

  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Selection | null>(null);

  useEffect(() => {
    if (permissionsLoading || !allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/foundation/practice/facilitate');
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.error ?? 'Your sessions could not be loaded.');
          return;
        }
        setCohorts(body.cohorts ?? []);
      } catch {
        if (!cancelled) {
          setError(
            'Your sessions could not be loaded. Check your connection and try again.',
          );
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
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </ContentLayout>
    );
  }

  // Never a silent bounce: say what is missing and who fixes it.
  if (!allowed) {
    return (
      <ContentLayout>
        <div className="mx-auto max-w-lg py-16 text-center">
          <Lock className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">
            You do not have access to Foundation practice
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page needs the{' '}
            <code className="text-xs">foundation.practice.take</code>{' '}
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
          examDefinitionId={active.exam.examDefinitionId}
          examName={active.exam.name}
          forLearnerId={active.learner.id}
          forLearnerName={active.learner.fullName}
          onExit={() => setActive(null)}
        />
      </ContentLayout>
    );
  }

  const hasAnyCohort = (cohorts?.length ?? 0) > 0;

  return (
    <ContentLayout>
      <div className="mx-auto max-w-2xl py-6">
        <div className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Run a practice session
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a learner, then work through the questions together. Their
            answers are recorded under their own name, so their progress builds
            up even though they have no account of their own.
          </p>
        </div>

        {error && (
          <p className="rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            {error}
          </p>
        )}

        {!error && !cohorts && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        )}

        {/* Holding the permission but running no group is a real and likely
            state — say so plainly rather than showing an empty page that looks
            identical to something being broken. */}
        {cohorts && !hasAnyCohort && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Users className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-foreground">
              You are not running any groups yet.
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Once a group is set up with you as the person running it, the
              learners in it appear here.
            </p>
          </div>
        )}

        <div className="space-y-8">
          {(cohorts ?? []).map((cohort) => {
            const exam = cohort.exam;
            const ready = Boolean(exam?.isActive) && (exam?.questionCount ?? 0) > 0;

            return (
              <section key={cohort.id}>
                <div className="mb-3">
                  <h2 className="text-base font-medium text-foreground">
                    {exam?.name ?? 'Group'}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {[cohort.schoolName, cohort.term].filter(Boolean).join(' · ')}
                    {ready
                      ? ` · ${exam!.questionCount} question${
                          exam!.questionCount === 1 ? '' : 's'
                        } ready`
                      : ''}
                  </p>
                </div>

                {/* A group whose questions are not switched on yet is shown, not
                    hidden. Hiding it would be indistinguishable from the group
                    not existing — which is the exact confusion this module has
                    already caused once. */}
                {!ready && (
                  <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                    No questions are open for this subject yet, so a session
                    cannot be started. This fills in once the questions are made
                    ready.
                  </p>
                )}

                {ready && cohort.learners.length === 0 && (
                  <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                    Nobody is enrolled in this group yet.
                  </p>
                )}

                {ready && cohort.learners.length > 0 && (
                  <ul className="space-y-2">
                    {cohort.learners.map((learner) => (
                      <li key={learner.id}>
                        <button
                          type="button"
                          onClick={() => setActive({ learner, exam: exam! })}
                          className="flex w-full items-center justify-between gap-4 rounded-xl border border-border p-4 text-left transition-colors hover:border-muted-foreground/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <span>
                            <span className="block text-sm font-medium text-foreground">
                              {learner.fullName}
                            </span>
                            {learner.grade && (
                              <span className="mt-0.5 block text-sm text-muted-foreground">
                                Grade {learner.grade}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground">
                            Start
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        {cohorts && (
          <div className="mt-12 border-t border-border pt-6">
            <Button variant="ghost" size="sm" asChild className="-ml-2">
              <a href="/foundation/practice">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Practise on my own instead
              </a>
            </Button>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
