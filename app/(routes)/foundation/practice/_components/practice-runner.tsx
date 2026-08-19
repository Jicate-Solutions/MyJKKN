'use client';

// Foundation — one practice run, from first question to review.
//
// Three states, in order: loading the questions, answering them one at a time,
// then reading how it went.
//
// Two deliberate choices worth keeping:
//
//   One question on screen at a time. A grid of twenty questions is an exam
//   paper; this is practice for an eleven-year-old, often on a phone. Options
//   are full-width targets for a thumb, and nothing is timed on screen.
//
//   The review leads with the explanation, not the score. The count sits small
//   at the top; the reasoning gets the space. A missed question is amber, never
//   red — this is somewhere to look again, not a mark against anybody.
//
// The write path is the existing useRecordAttempt hook, which calls
// fn_fp_record_attempt. Grading happens inside that function against the answer
// key, which this component never receives.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecordAttempt } from '@/hooks/foundation/use-foundation';
import { ItemFlagButton } from '../../_components/item-flag-button';
import { cn } from '@/lib/utils';

interface Option {
  key: string;
  text: string;
}

interface Question {
  id: string;
  stem: string;
  options: Option[] | null;
  difficulty: number | null;
  q_type: string | null;
}

interface ReviewQuestion {
  itemId: string;
  stem: string;
  options: Option[];
  chosen: any;
  correctAnswer: any;
  isCorrect: boolean | null;
  explanation: string | null;
}

interface ReviewPayload {
  total: number;
  correct: number;
  skipped?: number;
  questions: ReviewQuestion[];
}

interface Draw {
  assessmentId: string;
  learnerId: string;
  questions: Question[];
}

// ---------------------------------------------------------------------------
// Resuming an interrupted run
// ---------------------------------------------------------------------------
// A bell rings and the page closes. Without this, the answers given so far are
// gone, and a learner who has to start over often just doesn't.
//
// Kept in the browser rather than the database on purpose: a run is ~10
// questions over a few minutes, so surviving a closed tab is what actually
// matters, and storing it here means no half-finished attempt rows accumulate
// in the record for every interruption. The trade-off is that a run resumes on
// the same device only.
//
// The DRAWN QUESTIONS are stored alongside the answers. Restoring answers
// against a freshly drawn set would attach them to the wrong questions.

const STORAGE_PREFIX = 'jkkn.foundation.practice.v1';
const RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface SavedRun {
  draw: Draw;
  chosen: Record<string, string>;
  index: number;
  savedAt: number;
}
// Per-question timings are deliberately NOT persisted. They feed the nullable
// fp_responses.time_ms analytics column only, so losing them on resume costs
// nothing — and keeping Date.now() out of the save path keeps the handler pure.

function storageKey(examDefinitionId: string) {
  return `${STORAGE_PREFIX}.${examDefinitionId}`;
}

function loadSavedRun(examDefinitionId: string): SavedRun | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(examDefinitionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedRun;
    if (
      !parsed?.draw?.questions?.length ||
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > RESUME_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(storageKey(examDefinitionId));
      return null;
    }
    return parsed;
  } catch {
    // Corrupt or unreadable storage must never block practice.
    return null;
  }
}

function saveRun(examDefinitionId: string, run: Omit<SavedRun, 'savedAt'>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(examDefinitionId),
      JSON.stringify({ ...run, savedAt: Date.now() }),
    );
  } catch {
    // Private browsing or a full quota. Losing resume is acceptable; losing the
    // run in progress is not, so this failure is deliberately silent.
  }
}

function clearSavedRun(examDefinitionId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(examDefinitionId));
  } catch {
    /* nothing to do */
  }
}

/** Turn whatever the write path threw into something a learner can act on. */
function friendlySubmitError(err: any): string {
  const raw = String(err?.message ?? '');
  if (/parental consent/i.test(raw)) {
    return 'Your answers could not be saved yet because a parent or guardian still needs to give permission. Please ask whoever set up your account.';
  }
  if (err?.code === '42501' || /not authorized|permission denied/i.test(raw)) {
    return 'Your answers could not be saved because this practice is not set up for your account. Please tell whoever runs the programme at your school.';
  }
  if (/assessment .* not found/i.test(raw)) {
    return 'This subject is not ready for practice right now. Please try again later.';
  }
  if (/fetch|network|failed to/i.test(raw)) {
    return 'Your answers could not be saved — check your connection and try again. Nothing you typed has been lost.';
  }
  // Never surface a raw database message to a learner.
  return 'Your answers could not be saved. Please try again — nothing you typed has been lost.';
}

export function PracticeRunner({
  examDefinitionId,
  examName,
  onExit,
  forLearnerId,
  forLearnerName,
}: {
  examDefinitionId: string;
  examName: string;
  onExit: () => void;
  /** Set when a Senior Learner is running this session for a learner who holds
   *  no account. The id is only a request — the route re-checks it against the
   *  database before drawing anything, so passing one here grants nothing. */
  forLearnerId?: string;
  forLearnerName?: string;
}) {
  // Resume state is scoped per learner as well as per subject. Without this, a
  // facilitator moving from one child to the next in the same subject would pick
  // up the previous child's half-finished run and file it under the new name.
  const runScope = forLearnerId
    ? `${examDefinitionId}.${forLearnerId}`
    : examDefinitionId;
  // `run` identifies one draw of questions. Bumping it changes the query key,
  // which fetches a fresh set — that is what "Practise again" does. Keeping the
  // fetch in react-query rather than an effect avoids the cascading renders that
  // a setState-inside-useEffect causes.
  const [run, setRun] = useState(0);

  // Read once, at mount, in a lazy initialiser — not in an effect, which would
  // cause a second render pass and trip the set-state-in-effect rule.
  const resumed = useMemo(() => loadSavedRun(runScope), [runScope]);

  const [index, setIndex] = useState(() => resumed?.index ?? 0);
  const [chosen, setChosen] = useState<Record<string, string>>(
    () => resumed?.chosen ?? {},
  );
  const [askedAt, setAskedAt] = useState<number>(() => Date.now());
  const [timeByItem, setTimeByItem] = useState<Record<string, number>>({});

  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const recordAttempt = useRecordAttempt();

  const {
    data: draw,
    isPending,
    error: loadError,
  } = useQuery({
    queryKey: ['foundation', 'practice', runScope, run],
    queryFn: async (): Promise<Draw> => {
      // An interrupted run resumes with the SAME questions. Only a deliberate
      // "Practise again" (which bumps `run` and clears storage) draws fresh.
      if (run === 0 && resumed) return resumed.draw;

      // forLearner is a request, not a grant: the route verifies the caller runs
      // a session for that learner before it draws anything.
      const query = forLearnerId
        ? `?forLearner=${encodeURIComponent(forLearnerId)}`
        : '';
      const res = await fetch(
        `/api/foundation/practice/${examDefinitionId}${query}`,
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? 'Could not start practice.');
      }
      return body as Draw;
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  /** Start a fresh draw and clear everything from the previous one. */
  function startAgain() {
    clearSavedRun(runScope);
    setIndex(0);
    setChosen({});
    setTimeByItem({});
    setReview(null);
    setSubmitError(null);
    setAskedAt(Date.now());
    setRun((r) => r + 1);
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10 text-center">
        <p className="text-base text-muted-foreground">
          {(loadError as Error).message}
        </p>
        <div className="flex justify-center gap-2">
          <Button variant="outline" onClick={onExit}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to subjects
          </Button>
          <Button onClick={startAgain}>Try again</Button>
        </div>
      </div>
    );
  }

  if (isPending || !draw) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-10">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }

  if (review) {
    return (
      <Review
        examName={examName}
        review={review}
        onAgain={startAgain}
        onExit={onExit}
        forLearnerName={forLearnerName}
      />
    );
  }

  const { questions, assessmentId, learnerId } = draw;
  const current = questions[index];
  const total = questions.length;
  const answeredCount = Object.keys(chosen).length;
  const isLast = index === total - 1;
  const options: Option[] = Array.isArray(current?.options) ? current.options : [];

  function choose(optionKey: string) {
    if (!current) return;
    const nextChosen = { ...chosen, [current.id]: optionKey };
    setChosen(nextChosen);
    setTimeByItem((prev) => ({
      ...prev,
      [current.id]: (prev[current.id] ?? 0) + (Date.now() - askedAt),
    }));
    // Persist on every tap, in the event handler rather than an effect, so an
    // interrupted run resumes exactly where it stopped.
    saveRun(runScope, { draw, chosen: nextChosen, index });
  }

  function goTo(next: number) {
    setAskedAt(Date.now());
    setIndex(next);
    saveRun(runScope, { draw, chosen, index: next });
  }

  async function submit() {
    if (!assessmentId || !learnerId) return;
    setSubmitError(null);

    const answered = questions.filter((q) => chosen[q.id] != null);
    const skipped = questions.filter((q) => chosen[q.id] == null);

    if (answered.length === 0) {
      setSubmitError('Answer at least one question before finishing.');
      return;
    }

    // Only what was actually answered is sent. A blank is not recorded at all,
    // which is what keeps it out of BOTH the run score and the mastery average
    // — fn_fp_record_attempt divides by the responses it receives, and
    // fn_fp_recompute_weakness averages over the rows that exist. A row written
    // with a null answer would count as wrong in both.
    const responses = answered.map((q) => ({
      item_id: q.id,
      chosen: chosen[q.id],
      time_ms: timeByItem[q.id],
    }));

    try {
      const attemptId = await recordAttempt.mutateAsync({
        assessmentId,
        studentId: learnerId,
        responses,
        examDefinitionId,
      });

      // The run is safely recorded; the resume copy has done its job.
      clearSavedRun(runScope);

      // Skipped questions are handed back so the review can still show what the
      // answer was. They are not graded and do not affect the score.
      const query = skipped.length
        ? `?skipped=${skipped.map((q) => q.id).join(',')}`
        : '';
      const res = await fetch(
        `/api/foundation/practice/attempts/${attemptId}${query}`,
      );
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(
          'Your answers were saved, but the results could not be loaded. Open practice again to see them.',
        );
        return;
      }
      setReview(body);
    } catch (err: any) {
      setSubmitError(friendlySubmitError(err));
    }
  }

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-8 flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={onExit} className="-ml-2">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {examName}
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          {index + 1} of {total}
        </span>
      </div>

      {/* Whose answers these are, kept on screen for the whole run. A facilitator
          working through a group is one mis-click away from filing a child's
          answers under the previous name, and nothing downstream would ever
          reveal it. */}
      {forLearnerName && (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Recording answers for{' '}
          <span className="font-medium text-foreground">{forLearnerName}</span>
        </p>
      )}

      <Progress value={((index + 1) / total) * 100} className="mb-10 h-1" />

      <h2 className="mb-8 text-xl font-medium leading-relaxed text-foreground sm:text-2xl sm:leading-relaxed">
        {current?.stem}
      </h2>

      <div className="space-y-3">
        {options.map((opt) => {
          const selected = chosen[current!.id] === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => choose(opt.key)}
              aria-pressed={selected}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border p-4 text-left text-base transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                selected
                  ? 'border-primary bg-primary/5 text-foreground'
                  : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground',
                )}
              >
                {selected ? <Check className="h-3.5 w-3.5" /> : opt.key}
              </span>
              <span className="leading-relaxed">{opt.text}</span>
            </button>
          );
        })}
      </div>

      {submitError && (
        <p className="mt-6 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {submitError}
        </p>
      )}

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
        >
          Previous
        </Button>

        {isLast ? (
          <Button onClick={() => void submit()} disabled={recordAttempt.isPending}>
            {recordAttempt.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Finish and see how it went
          </Button>
        ) : (
          <Button onClick={() => goTo(index + 1)}>Next</Button>
        )}
      </div>

      {answeredCount < total && isLast && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {total - answeredCount} still unanswered. You can finish anyway —
          skipped questions are not counted for or against you, and you will
          still see their answers.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

function Review({
  examName,
  review,
  onAgain,
  onExit,
  forLearnerName,
}: {
  examName: string;
  review: ReviewPayload;
  onAgain: () => void;
  onExit: () => void;
  forLearnerName?: string;
}) {
  // Second person when you answered it yourself; the learner's name when
  // somebody recorded it for them. "You answered 4 of 10" shown to the Senior
  // Learner running the session reads as their own score, which is nobody's.
  const who = forLearnerName ?? null;
  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-10 border-b border-border pb-6">
        <p className="text-sm text-muted-foreground">{examName}</p>
        <p className="mt-1 text-base text-foreground">
          {who ? (
            <>
              <span className="font-medium">{who}</span> answered{' '}
            </>
          ) : (
            'You answered '
          )}
          <span className="font-semibold tabular-nums">{review.correct}</span> of{' '}
          <span className="tabular-nums">{review.total}</span> correctly.
        </p>
        {(review.skipped ?? 0) > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {who ? `${who} skipped ` : 'You skipped '}
            <span className="tabular-nums">{review.skipped}</span>. Those are not
            counted either way — the answers are below so you can read them.
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          The useful part is below — what each answer was, and why.
        </p>
      </div>

      <ol className="space-y-10">
        {review.questions.map((q, i) => {
          const correct = q.isCorrect === true;
          const chosenText = q.options?.find((o) => o.key === q.chosen)?.text;
          const answerText = q.options?.find((o) => o.key === q.correctAnswer)?.text;
          return (
            <li key={q.itemId}>
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span
                  className={cn(
                    'text-xs font-medium uppercase tracking-wide',
                    correct
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {correct ? 'Correct' : q.chosen ? 'Look again' : 'Not attempted'}
                </span>
              </div>

              <p className="mb-3 text-base leading-relaxed text-foreground">
                {q.stem}
              </p>

              {!correct && (
                <p className="mb-2 text-sm text-muted-foreground">
                  {q.chosen ? (
                    <>
                      You chose <span className="text-foreground">{chosenText ?? String(q.chosen)}</span>.{' '}
                    </>
                  ) : null}
                  The answer is{' '}
                  <span className="text-foreground">{answerText ?? String(q.correctAnswer)}</span>.
                </p>
              )}

              {q.explanation && (
                <p className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
                  {q.explanation}
                </p>
              )}

              {/* Reporting lives here rather than beside the question while it
                  is being answered: offering it mid-run signals that something
                  might be wrong with the question, which is a hint. After the
                  answer is revealed, the learner can actually judge. */}
              <div className="mt-3">
                <ItemFlagButton itemId={q.itemId} existingFlag={null} />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-12 flex flex-wrap gap-3 border-t border-border pt-6">
        <Button onClick={onAgain}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Practise again
        </Button>
        <Button variant="outline" onClick={onExit}>
          Choose another subject
        </Button>
      </div>
    </div>
  );
}
