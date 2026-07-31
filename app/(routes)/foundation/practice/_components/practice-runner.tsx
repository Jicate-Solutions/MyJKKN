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

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecordAttempt } from '@/hooks/foundation/use-foundation';
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
  questions: ReviewQuestion[];
}

export function PracticeRunner({
  examDefinitionId,
  examName,
  onExit,
}: {
  examDefinitionId: string;
  examName: string;
  onExit: () => void;
}) {
  // `run` identifies one draw of questions. Bumping it changes the query key,
  // which fetches a fresh set — that is what "Practise again" does. Keeping the
  // fetch in react-query rather than an effect avoids the cascading renders that
  // a setState-inside-useEffect causes.
  const [run, setRun] = useState(0);

  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Record<string, string>>({});
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
    queryKey: ['foundation', 'practice', examDefinitionId, run],
    queryFn: async () => {
      const res = await fetch(`/api/foundation/practice/${examDefinitionId}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? 'Could not start practice.');
      }
      return body as {
        assessmentId: string;
        learnerId: string;
        questions: Question[];
      };
    },
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });

  /** Start a fresh draw and clear everything from the previous one. */
  function startAgain() {
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
    setChosen((prev) => ({ ...prev, [current.id]: optionKey }));
    setTimeByItem((prev) => ({
      ...prev,
      [current.id]: (prev[current.id] ?? 0) + (Date.now() - askedAt),
    }));
  }

  function goTo(next: number) {
    setAskedAt(Date.now());
    setIndex(next);
  }

  async function submit() {
    if (!assessmentId || !learnerId) return;
    setSubmitError(null);
    const responses = questions.map((q) => ({
      item_id: q.id,
      chosen: chosen[q.id] ?? null,
      time_ms: timeByItem[q.id],
    }));

    try {
      const attemptId = await recordAttempt.mutateAsync({
        assessmentId,
        studentId: learnerId,
        responses,
        examDefinitionId,
      });

      const res = await fetch(`/api/foundation/practice/attempts/${attemptId}`);
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(
          'Your answers were saved, but the results could not be loaded. Open practice again to see them.',
        );
        return;
      }
      setReview(body);
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Your answers could not be saved. Try again.');
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
          {total - answeredCount} still unanswered. You can finish anyway — they
          will be marked as not attempted.
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
}: {
  examName: string;
  review: ReviewPayload;
  onAgain: () => void;
  onExit: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-10 border-b border-border pb-6">
        <p className="text-sm text-muted-foreground">{examName}</p>
        <p className="mt-1 text-base text-foreground">
          You answered{' '}
          <span className="font-semibold tabular-nums">{review.correct}</span> of{' '}
          <span className="tabular-nums">{review.total}</span> correctly.
        </p>
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
