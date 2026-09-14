'use client';

// =============================================================================
// /foundation/onemark/practice — where a Class-12 learner sits OneMark.
// =============================================================================
// Four ways to sit one-mark questions (PRD §6, decisions 17-19):
//   Practice      untimed, explanation after every answer
//   Timed paper   the board clock, verdicts at the end, blanks = skipped
//   Live paper    a paper a Senior Learner assigned to your group — one go
//   Vault review  the questions you got wrong, when they are due
//
// Access: foundation.practice.take (the same key as Foundation practice — no
// new permission keys in this wave). Being enrolled is a separate matter, and
// the two failures read differently on purpose: "you cannot open this" and
// "you are not on the programme yet" have different people to talk to.
// Never a silent bounce to the dashboard.
// =============================================================================

import { useState } from 'react';
import { Clock, GraduationCap, Lock, Radio } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useOneMarkHome, useStartSitting } from '@/hooks/onemark/use-vault';
import {
  OneMarkApiError,
  OneMarkVaultService,
  type OneMarkLivePaper,
  type OneMarkSitting,
  type OneMarkSubject,
  type SittingReview,
  type StartSittingInput,
} from '@/lib/services/onemark/vault-service';
import { OneMarkRunner } from './_components/onemark-runner';
import { ProgressCard } from './_components/progress-card';
import { SittingReviewView } from './_components/sitting-review';
import { VaultPanel } from './_components/vault-panel';

/** Fields Lane L added to the attempts API that the shared client types do not
 *  carry yet (vault-service.ts belongs to another lane this wave). */
type LivePaperExtras = {
  /** Ruling 2 — when this paper's item-level review opens; null = open now. */
  reviewOpensAt?: string | null;
  /** Ruling 13 — the same questions may be sat again as practice. */
  practiceAvailable?: boolean;
};
type StartWithReplay = StartSittingInput & { fromAssessmentId?: string };

const LIVE_STATUS_LABEL: Record<OneMarkLivePaper['status'], string> = {
  open: 'Open now',
  in_progress: 'In progress — continue',
  upcoming: 'Opens',
  closed: 'Closed',
  submitted: 'Submitted',
};

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function OneMarkPracticePage() {
  const { canAccess, isLoading: permissionsLoading } = usePermissions();
  const allowed = canAccess('foundation', 'practice.take');

  const home = useOneMarkHome(!permissionsLoading && allowed);
  const start = useStartSitting();

  const [sitting, setSitting] = useState<OneMarkSitting | null>(null);
  const [sittingExamName, setSittingExamName] = useState<string>('');
  const [lastStart, setLastStart] = useState<StartSittingInput | null>(null);
  const [review, setReview] = useState<SittingReview | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  // Ruling 13 — what is offered in place of reopening a closed sitting.
  const [replayOffer, setReplayOffer] = useState<{
    fromAssessmentId: string;
    available: boolean;
    opensAt: string | null;
  } | null>(null);
  // A calm, non-error message — e.g. the vault had nothing due after all.
  const [notice, setNotice] = useState<string | null>(null);

  async function open(input: StartWithReplay, examName: string) {
    setStartError(null);
    setNotice(null);
    setReplayOffer(null);
    try {
      const s = await start.mutateAsync(input);
      setLastStart(input);
      setSittingExamName(examName);
      setReview(null);
      setSitting(s);
    } catch (err) {
      if (err instanceof OneMarkApiError && err.body?.practiceOffer?.fromAssessmentId) {
        // Ruling 13 — the sitting is never reopened; these questions come back
        // as practice instead, once the paper itself has closed.
        setReplayOffer({
          fromAssessmentId: String(err.body.practiceOffer.fromAssessmentId),
          available: err.body.practiceOffer.available === true,
          opensAt: err.body.practiceOffer.opensAt ?? null,
        });
      }
      if (err instanceof OneMarkApiError && err.body?.alreadySubmitted && err.body?.attemptId) {
        // Decision 19: blocked on retry, result shown.
        try {
          const r = await OneMarkVaultService.finalize(err.body.attemptId, []);
          setSittingExamName(examName);
          setSitting(null);
          setReview(r);
          return;
        } catch (inner) {
          setStartError(inner instanceof Error ? inner.message : 'The result could not be loaded.');
          return;
        }
      }
      if (err instanceof OneMarkApiError && err.body?.empty === true) {
        // Nothing due is a state, not a failure (the panel's count and the
        // draw can differ by a hair — an item retired since the page loaded).
        setNotice('Nothing in your vault is due for review right now.');
        void home.refetch();
        return;
      }
      setStartError(err instanceof Error ? err.message : 'The sitting could not be opened.');
    }
  }

  function backToSubjects() {
    setSitting(null);
    setReview(null);
    setStartError(null);
    setNotice(null);
    setReplayOffer(null);
    void home.refetch();
  }

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

  if (!allowed) {
    return (
      <ContentLayout>
        <div className="mx-auto max-w-lg py-16 text-center">
          <Lock className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">
            You do not have access to OneMark practice
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page needs the <code className="text-xs">foundation.practice.take</code>{' '}
            permission. Ask whoever manages roles at your institution to add it.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (review) {
    const canRepeat =
      lastStart && lastStart.mode !== 'live' && !review.alreadySubmitted ? lastStart : null;
    // Ruling 13 — after a closed live sitting the button is "practise these
    // again", never "sit it again": a new PRACTICE sitting on the same
    // questions, and only once the paper has closed.
    const replay: StartWithReplay | null =
      !canRepeat && replayOffer?.available
        ? { mode: 'practice', fromAssessmentId: replayOffer.fromAssessmentId }
        : null;
    return (
      <ContentLayout>
        <SittingReviewView
          examName={sittingExamName}
          review={review}
          againLabel={replay ? 'Practise these questions again' : undefined}
          onAgain={
            canRepeat
              ? () => void open(canRepeat, sittingExamName)
              : replay
                ? () => void open(replay, sittingExamName)
                : undefined
          }
          onExit={backToSubjects}
        />
      </ContentLayout>
    );
  }

  if (sitting) {
    return (
      <ContentLayout>
        <OneMarkRunner
          sitting={sitting}
          examName={sittingExamName}
          onExit={backToSubjects}
          onFinished={(r) => {
            setSitting(null);
            setReview(r);
          }}
        />
      </ContentLayout>
    );
  }

  const data = home.data;
  const loadError =
    home.error instanceof Error ? home.error.message : home.error ? 'OneMark could not be loaded.' : null;

  return (
    <ContentLayout>
      <div className="mx-auto max-w-2xl py-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">OneMark</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The one-mark section of the Class 12 board paper, one question at a time.
            Practise, sit it against the clock, or work through the questions you got wrong.
          </p>
        </div>

        {(loadError || startError) && (
          <p className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            {startError ?? loadError}
          </p>
        )}

        {notice && !startError && (
          <p className="mb-6 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            {notice}
          </p>
        )}

        {home.isPending && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        )}

        {data && !data.learner && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <GraduationCap className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-foreground">You are not on the Foundation programme yet.</p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Once someone at your school enrols you, your subjects appear here.
            </p>
          </div>
        )}

        {data?.learner && (
          <div className="space-y-8">
            {/* ---- My progress (Lane A's learner report) ---------------------
                Renders nothing until that API is on main. */}
            <ProgressCard learnerId={data.learner.id} />

            {/* ---- Subjects: practice + timed ------------------------------- */}
            <section>
              <h2 className="mb-3 text-lg font-semibold text-foreground">Subjects</h2>
              {data.subjects.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No subjects are open yet. This page fills in as each subject is made ready.
                </p>
              )}
              <ul className="space-y-3">
                {data.subjects.map((s: OneMarkSubject) => {
                  const ready = s.poolReady && s.questionCount > 0;
                  return (
                    <li key={s.examDefinitionId} className="rounded-2xl bg-card p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-medium text-foreground">{s.name}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {ready
                              ? `${s.questionCount} question${s.questionCount === 1 ? '' : 's'} ready`
                              : !s.poolReady
                                ? 'Not set up yet'
                                : 'Questions are being prepared'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            disabled={!ready || start.isPending}
                            onClick={() =>
                              void open({ mode: 'practice', examDefinitionId: s.examDefinitionId }, s.name)
                            }
                          >
                            Practice
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!ready || start.isPending}
                            onClick={() =>
                              void open({ mode: 'timed', examDefinitionId: s.examDefinitionId }, s.name)
                            }
                          >
                            <Clock className="mr-1.5 h-3.5 w-3.5" />
                            Timed
                            {data.policy?.timedMinutes ? ` · ${data.policy.timedMinutes} min` : ''}
                          </Button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ---- Live papers ------------------------------------------------ */}
            <section>
              <div className="mb-3 flex items-center gap-2">
                <Radio className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground">Assigned papers</h2>
              </div>
              {data.live.length === 0 && (
                <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nothing has been assigned to your group. A paper appears here when a Senior
                  Learner publishes one to you.
                </p>
              )}
              <ul className="space-y-3">
                {data.live.map((p) => {
                  const canSit = p.status === 'open' || p.status === 'in_progress';
                  const examName = p.examName ?? p.title;
                  const extras = p as OneMarkLivePaper & LivePaperExtras;
                  return (
                    <li key={p.assessmentId} className="rounded-2xl bg-card p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-base font-medium text-foreground">{p.title}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {p.examName ? `${p.examName} · ` : ''}
                            {p.questionCount} question{p.questionCount === 1 ? '' : 's'}
                            {p.durationMin ? ` · ${p.durationMin} min` : ''}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {LIVE_STATUS_LABEL[p.status]}
                            {p.status === 'upcoming' ? ` ${formatWhen(p.opensAt)}` : ''}
                            {p.status === 'open' && p.closesAt ? ` · closes ${formatWhen(p.closesAt)}` : ''}
                          </p>
                          {p.status === 'submitted' && extras.reviewOpensAt && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Your score is ready now. The question-by-question review opens when the
                              paper closes, {formatWhen(extras.reviewOpensAt)} — everyone is still
                              sitting it.
                            </p>
                          )}
                        </div>
                        {p.status === 'submitted' && p.attemptId ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={start.isPending}
                              onClick={async () => {
                                try {
                                  const r = await OneMarkVaultService.finalize(p.attemptId as string, []);
                                  setSittingExamName(examName);
                                  setLastStart(null);
                                  setReplayOffer(
                                    extras.practiceAvailable
                                      ? {
                                          fromAssessmentId: p.assessmentId,
                                          available: true,
                                          opensAt: null,
                                        }
                                      : null,
                                  );
                                  setReview(r);
                                } catch (err) {
                                  setStartError(err instanceof Error ? err.message : 'The result could not be loaded.');
                                }
                              }}
                            >
                              See result
                            </Button>
                            {extras.practiceAvailable && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={start.isPending}
                                onClick={() =>
                                  void open(
                                    { mode: 'practice', fromAssessmentId: p.assessmentId },
                                    examName,
                                  )
                                }
                              >
                                Practise these again
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            disabled={!canSit || start.isPending}
                            onClick={() => void open({ mode: 'live', assessmentId: p.assessmentId }, examName)}
                          >
                            {p.status === 'in_progress' ? 'Continue' : 'Sit now'}
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* ---- Mistake Vault ----------------------------------------------- */}
            <VaultPanel
              learnerId={data.learner.id}
              subjects={data.subjects}
              vault={data.vault}
              starting={start.isPending}
              onReview={(s) =>
                void open({ mode: 'vault_review', examDefinitionId: s.examDefinitionId }, s.name)
              }
            />
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
