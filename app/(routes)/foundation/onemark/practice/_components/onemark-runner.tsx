'use client';

// OneMark — one sitting, first question to submission.
//
// Distinct from the Foundation practice-runner on purpose: that one collects
// answers and grades them in one batch at the end. OneMark records EVERY
// answer as it is given (fn_onemark_record_response, via the respond route),
// because the Mistake Vault, times_served and the single-submission rule all
// hang off per-response events. Four modes share this component:
//
//   practice      no clock; the explanation appears the moment you answer
//   timed         a clock; verdicts at the end; when it runs out, whatever is
//                 blank is submitted as SKIPPED — not wrong (decision 18)
//   live          a clock and a locked path (forward only, one submission —
//                 decision 19); an interrupted sitting resumes where it stopped
//   vault_review  like practice, drawn from the Mistake Vault
//
// Navigation is forward-only in EVERY mode: once a question is answered or
// skipped, the response is on the record and the next one comes up. That is
// what keeps "one response per question" true without a second write path.
//
// The browser never holds an answer key. Correctness and the explanation
// arrive from the respond route AFTER the response is recorded.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  OneMarkApiError,
  type OneMarkQuestion,
  type OneMarkSitting,
  type RespondResult,
  type SittingReview,
} from '@/lib/services/onemark/vault-service';
import { useFinalizeSitting, useRespond } from '@/hooks/onemark/use-vault';
import { Bilingual, LangSwitch, useLang, optionText } from './bilingual';

const MODE_LABEL: Record<OneMarkSitting['mode'], string> = {
  practice: 'Practice',
  timed: 'Timed paper',
  live: 'Live paper',
  vault_review: 'Vault review',
};

function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Turn whatever the write path threw into something a learner can act on. */
function friendlyError(err: unknown): string {
  if (err instanceof OneMarkApiError) {
    if (err.status === 503) return err.message;
    if (err.status === 401) return 'Your sign-in has expired. Sign in again and reopen the sitting.';
    if (err.status === 403) return err.message;
    if (err.body?.expired) return 'Time is up — the sitting is being submitted.';
    if (err.body?.alreadySubmitted) return 'This sitting has already been submitted.';
    return err.message || 'Your answer could not be saved. Please try again.';
  }
  const raw = String((err as any)?.message ?? '');
  if (/fetch|network|failed to/i.test(raw)) {
    return 'Your answer could not be saved — check your connection and try again.';
  }
  return 'Your answer could not be saved. Please try again.';
}

export function OneMarkRunner({
  sitting,
  examName,
  onExit,
  onFinished,
}: {
  sitting: OneMarkSitting;
  examName: string;
  onExit: () => void;
  onFinished: (review: SittingReview) => void;
}) {
  const [lang, setLang] = useLang();
  const respond = useRespond();
  const finalize = useFinalizeSitting();

  const questions = sitting.questions;
  const total = questions.length;

  // Responses already on the record (a resumed live sitting) are done.
  const [done, setDone] = useState<Record<string, RespondResult | true>>(() =>
    Object.fromEntries(sitting.alreadyAnswered.map((id) => [id, true as const])),
  );
  // The latest `done`, readable from a callback that was created earlier —
  // the clock's auto-submit fires from an effect whose closure may predate
  // the response that is landing right now.
  const doneRef = useRef(done);
  doneRef.current = done;
  // The response currently on the wire, so a submission can wait for it
  // rather than send the same item a second time as a skip.
  const inFlight = useRef<Promise<Record<string, RespondResult | true> | null> | null>(null);
  const finishing = useRef(false);
  const firstOpen = useMemo(
    () => Math.max(0, questions.findIndex((q) => !sitting.alreadyAnswered.includes(q.id))),
    [questions, sitting.alreadyAnswered],
  );
  const [index, setIndex] = useState(firstOpen);
  const [selected, setSelected] = useState<string | null>(null);
  const [askedAt, setAskedAt] = useState<number>(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const current: OneMarkQuestion | undefined = questions[index];
  const currentVerdict = current ? done[current.id] : undefined;
  const answeredCount = Object.keys(done).length;

  // ---- The clock ---------------------------------------------------------
  const deadline = sitting.deadlineAt ? new Date(sitting.deadlineAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [deadline]);
  const remaining = deadline === null ? null : deadline - now;
  const expired = remaining !== null && remaining <= 0;

  // Auto-submit exactly once when the clock runs out.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!expired || autoSubmitted.current) return;
    autoSubmitted.current = true;
    void finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  function advance(nextDone: Record<string, RespondResult | true>) {
    const nextIndex = questions.findIndex((q, i) => i > index && !nextDone[q.id]);
    if (nextIndex === -1) {
      // Nothing left ahead — either finish, or sit on the last verdict.
      if (!sitting.revealAfterAnswer) void finish(false, nextDone);
      return;
    }
    setIndex(nextIndex);
    setSelected(null);
    setAskedAt(Date.now());
  }

  function record(itemId: string, chosen: string | null, skipped: boolean) {
    // One response on the wire at a time; `finish` awaits this same promise.
    if (inFlight.current) return inFlight.current;
    const p = (async () => {
      setError(null);
      setSubmitting(true);
      try {
        const result = await respond.mutateAsync({
          attemptId: sitting.attemptId,
          itemId,
          chosen: chosen ?? undefined,
          skipped,
          timeMs: Date.now() - askedAt,
          servedToken: sitting.servedToken,
        });
        const nextDone = { ...doneRef.current, [itemId]: result };
        doneRef.current = nextDone;
        setDone(nextDone);
        return nextDone;
      } catch (err) {
        if (err instanceof OneMarkApiError && err.body?.expired) {
          // Time ran out between the tap and the server: submit what stands.
          inFlight.current = null;
          await finish(true);
          return null;
        }
        if (err instanceof OneMarkApiError && err.body?.alreadySubmitted) {
          inFlight.current = null;
          await finish(false);
          return null;
        }
        setError(friendlyError(err));
        return null;
      } finally {
        setSubmitting(false);
        if (inFlight.current === p) inFlight.current = null;
      }
    })();
    inFlight.current = p;
    return p;
  }

  /** Practice / vault review: the tap IS the answer. */
  async function chooseAndReveal(optionKey: string) {
    if (!current || currentVerdict || submitting) return;
    setSelected(optionKey);
    await record(current.id, optionKey, false);
  }

  /** Timed / live: commit the selection and move on. */
  async function commitAndNext() {
    if (!current || submitting) return;
    if (currentVerdict) {
      advance(done);
      return;
    }
    if (!selected) {
      setError('Choose an option, or skip this question.');
      return;
    }
    const nextDone = await record(current.id, selected, false);
    if (nextDone) advance(nextDone);
  }

  async function skip() {
    if (!current || submitting || currentVerdict) return;
    const nextDone = await record(current.id, null, true);
    if (nextDone) advance(nextDone);
  }

  async function finish(
    fromClock: boolean,
    doneSnapshot?: Record<string, RespondResult | true>,
  ) {
    if (finalize.isPending || finishing.current) return;
    finishing.current = true;
    try {
      setError(null);
      // Let a response that is mid-flight land first, so the item being
      // answered is never also sent as a skip.
      if (inFlight.current) {
        try {
          await inFlight.current;
        } catch {
          /* its own handler reported it */
        }
      }
      let snapshot = doneSnapshot ?? doneRef.current;
      // A selection made but not yet committed goes in as the answer when the
      // clock stops it; everything never touched goes in as a skip.
      if (fromClock && current && selected && !snapshot[current.id]) {
        const withCurrent = await record(current.id, selected, false);
        if (withCurrent) snapshot = withCurrent;
      }
      // Whatever landed while we waited counts as answered, not blank.
      const settled = { ...doneRef.current, ...snapshot };
      const blanks = questions.filter((q) => !settled[q.id]).map((q) => q.id);
      try {
        const review = await finalize.mutateAsync({
          attemptId: sitting.attemptId,
          skippedItemIds: blanks,
          servedToken: sitting.servedToken,
        });
        onFinished(review);
      } catch (err) {
        setError(friendlyError(err));
      }
    } finally {
      finishing.current = false;
    }
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
        There are no questions in this sitting.
        <div className="mt-4">
          <Button variant="outline" onClick={onExit}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  const options = Array.isArray(current.options) ? current.options : [];
  const verdict = currentVerdict && currentVerdict !== true ? currentVerdict : null;
  const revealed = Boolean(verdict?.reveal);
  const isLastOpen = questions.findIndex((q, i) => i > index && !done[q.id]) === -1;
  const clockUrgent = remaining !== null && remaining < 60_000;

  return (
    <div className="mx-auto max-w-2xl py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onExit} className="-ml-2" disabled={sitting.mode === 'live'}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          {examName}
        </Button>
        <div className="flex items-center gap-3">
          {remaining !== null && (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums',
                clockUrgent
                  ? 'border-amber-400/60 text-amber-700 dark:text-amber-300'
                  : 'border-border text-muted-foreground',
              )}
              aria-live="polite"
            >
              <Clock className="h-3.5 w-3.5" />
              {formatClock(remaining)}
            </span>
          )}
          <span className="text-sm tabular-nums text-muted-foreground">
            {index + 1} of {total}
          </span>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {sitting.lockedNavigation && <Lock className="h-3 w-3" />}
          {MODE_LABEL[sitting.mode]}
          {sitting.assessmentTitle && sitting.mode === 'live' ? ` · ${sitting.assessmentTitle}` : ''}
        </span>
        <LangSwitch lang={lang} onChange={setLang} />
      </div>

      {sitting.resumed && (
        <p className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Picking up where you stopped — {sitting.alreadyAnswered.length} already on the record.
        </p>
      )}

      {sitting.mode === 'vault_review' &&
        typeof sitting.requested === 'number' &&
        total < sitting.requested && (
          <p className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {total} question{total === 1 ? '' : 's'} this time — no single chapter takes more
            than its share of a review, so a shorter sitting is normal. The rest come back when
            they are due.
          </p>
        )}

      <Progress value={(answeredCount / total) * 100} className="mb-8 h-1" />

      <h2 className="mb-8 text-xl font-medium leading-relaxed text-foreground sm:text-2xl sm:leading-relaxed">
        <Bilingual lang={lang} en={current.stem} ta={current.stemTa} />
      </h2>

      <div className="space-y-3">
        {options.map((opt, idx) => {
          const chosenHere = selected === opt.key;
          const isRight = revealed && verdict?.reveal?.correctAnswer === opt.key;
          const isWrongPick = revealed && chosenHere && verdict?.isCorrect === false;
          const t = optionText(options, current.optionsTa, opt.key);
          // On a shuffled paper the badge is the POSITION (A, B, C, D down the
          // column, as the printed series would re-letter it); the bank key
          // still travels with the answer, unchanged.
          const badge = sitting.optionsShuffled ? String.fromCharCode(65 + idx) : opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() =>
                sitting.revealAfterAnswer ? void chooseAndReveal(opt.key) : setSelected(opt.key)
              }
              disabled={submitting || Boolean(currentVerdict)}
              aria-pressed={chosenHere}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border p-4 text-left text-base transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-default',
                isRight
                  ? 'border-emerald-500/70 bg-emerald-500/10 text-foreground'
                  : isWrongPick
                    ? 'border-amber-400/70 bg-amber-500/10 text-foreground'
                    : chosenHere
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'border-border hover:border-muted-foreground/40 hover:bg-muted/40',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  isRight
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : chosenHere
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground',
                )}
              >
                {isRight || (chosenHere && !revealed) ? <Check className="h-3.5 w-3.5" /> : badge}
              </span>
              <span className="leading-relaxed">
                <Bilingual lang={lang} en={t.en ?? opt.text} ta={t.ta} />
              </span>
            </button>
          );
        })}
      </div>

      {revealed && verdict && (
        <div
          className={cn(
            'mt-6 rounded-xl p-4 text-sm leading-relaxed',
            verdict.isCorrect
              ? 'bg-emerald-500/10 text-foreground'
              : 'bg-amber-500/10 text-foreground',
          )}
        >
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {verdict.isCorrect ? 'Correct' : 'Look again'}
            {verdict.vaultStatus === 'mastered' && ' · mastered — out of the vault'}
            {verdict.vaultStatus === 'active' && !verdict.isCorrect && ' · added to your vault'}
            {verdict.vaultStatus === 'active' &&
              verdict.isCorrect &&
              typeof verdict.streak === 'number' &&
              ` · streak ${verdict.streak}`}
          </p>
          {(verdict.reveal?.explanation || verdict.reveal?.explanationTa) && (
            <Bilingual
              lang={lang}
              en={verdict.reveal?.explanation}
              ta={verdict.reveal?.explanationTa}
              className="text-muted-foreground"
            />
          )}
        </div>
      )}

      {error && (
        <p className="mt-6 rounded-lg border border-amber-300/60 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
          {error}
        </p>
      )}

      <div className="mt-10 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => void skip()} disabled={submitting || Boolean(currentVerdict) || finalize.isPending}>
          Skip
        </Button>

        {sitting.revealAfterAnswer ? (
          isLastOpen ? (
            <Button
              onClick={() => void finish(false)}
              disabled={finalize.isPending || submitting}
            >
              {finalize.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Finish and see how it went
            </Button>
          ) : (
            <Button onClick={() => advance(done)} disabled={!currentVerdict || submitting}>
              Next
            </Button>
          )
        ) : isLastOpen ? (
          <Button
            onClick={async () => {
              if (current && selected && !currentVerdict) {
                const nextDone = await record(current.id, selected, false);
                if (nextDone) await finish(false, nextDone);
              } else {
                await finish(false);
              }
            }}
            disabled={finalize.isPending || submitting}
          >
            {(finalize.isPending || submitting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit paper
          </Button>
        ) : (
          <Button onClick={() => void commitAndNext()} disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Next
          </Button>
        )}
      </div>

      {!sitting.revealAfterAnswer && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {sitting.mode === 'live'
            ? 'One submission only. You cannot go back to a question once you move on.'
            : 'Answers are shown at the end. A skipped question is not counted against you.'}
        </p>
      )}
    </div>
  );
}
