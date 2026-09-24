'use client';

/**
 * SequencingQuestion — arrange steps into order via Move-up / Move-down
 * controls (no drag-and-drop, so it works on a phone and with a keyboard),
 * with partial-credit marking.
 *
 * Marking is SERVER-SIDE. The answer key (the true order) is never shipped
 * to the browser: fn_pde_get_case_questions ships metadata.sequence_items in
 * display order only, and grading happens via the SECURITY DEFINER RPC
 * fn_pde_mark_clinical_answer, which reads the key in the database and
 * returns ONLY a score_pct — no correct order. Because there is no key on
 * the client, we cannot and must not reveal the correct order; the learner
 * sees their score and a neutral nudge, never "the answer".
 *
 * Because marking is a live RPC round-trip it can fail. When it does, the
 * learner's arrangement is recorded with the verdict left UNRESOLVED rather
 * than discarded, and no score is shown — we cannot honestly mark an answer
 * the server never graded.
 *
 * The initial (display) order is itself a valid attempt at an answer, so
 * Submit is never disabled here the way it is for the other question types.
 */

import { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ClinicalQuestion,
  ClinicalAnswerEnvelope,
} from '@/types/pde-clinical-reasoning';

/**
 * Local widening of ClinicalAnswerEnvelope.
 *
 * `marking_failed` distinguishes "arranged in this order, never graded" from
 * "never answered" (no envelope at all). It reaches pde_submissions.answers
 * verbatim (schemaless JSONB), so faculty can re-grade rather than guess.
 * Declared here rather than widening types/pde-clinical-reasoning.ts so this
 * fix cannot collide with concurrent edits to that shared module.
 */
type SequencingAnswerEnvelope = ClinicalAnswerEnvelope & { marking_failed?: true };

interface SequencingQuestionProps {
  question: ClinicalQuestion;
  onAnswered: (envelope: ClinicalAnswerEnvelope) => void;
  onContinue: () => void;
  isLastQuestion: boolean;
}

export function SequencingQuestion({
  question,
  onAnswered,
  onContinue,
  isLastQuestion,
}: SequencingQuestionProps) {
  const initialItems = question.metadata?.sequence_items ?? [];
  const [order, setOrder] = useState(initialItems);
  const [submitted, setSubmitted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [savedUnmarked, setSavedUnmarked] = useState(false);
  const [scorePct, setScorePct] = useState<number | null>(null);

  function moveUp(index: number) {
    if (index <= 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setOrder((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  /**
   * Hand the arrangement up with no verdict attached. Safe to call
   * repeatedly: CaseAttempt.recordAnswer overwrites by question_id. Re-reads
   * the current order each time, so changing the arrangement after a
   * failure saves the order the learner can actually see.
   */
  function recordUnmarked() {
    if (order.length === 0) return;
    const envelope: SequencingAnswerEnvelope = {
      question_id: question.id,
      question_type: 'sequencing',
      sequence_order: order.map((item) => item.id),
      marking_failed: true,
      submitted_at: new Date().toISOString(),
    };
    onAnswered(envelope);
    setSavedUnmarked(true);
  }

  function continueUnmarked() {
    // Re-record first so a post-failure change of order is what gets saved.
    recordUnmarked();
    onContinue();
  }

  async function submit() {
    if (order.length === 0 || marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClientSupabaseClient() as any;
      const sequenceOrder = order.map((item) => item.id);
      const { data, error } = await supabase.rpc('fn_pde_mark_clinical_answer', {
        p_question_id: question.id,
        p_answer: { sequence_order: sequenceOrder },
      });
      if (error) throw new Error(error.message);
      const verdict = (data ?? {}) as { score_pct?: number | null };
      const pct = verdict.score_pct ?? 0;
      setScorePct(pct);
      setSubmitted(true);
      onAnswered({
        question_id: question.id,
        question_type: 'sequencing',
        sequence_order: sequenceOrder,
        partial_score: pct,
        submitted_at: new Date().toISOString(),
      });
      setSavedUnmarked(false);
    } catch (e) {
      setMarkError(
        e instanceof Error ? e.message : 'Could not mark this answer. Please try again.',
      );
      // Marking outage must not discard the learner's arrangement. Note we
      // do NOT set `submitted` — that would render a score the server never
      // actually returned.
      recordUnmarked();
    } finally {
      setMarking(false);
    }
  }

  return (
    <div>
      <h3 className="mt-2 text-base font-semibold sm:text-lg">{question.question_text}</h3>
      {question.metadata?.osce_domain ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Domain: {question.metadata.osce_domain.replace(/_/g, ' ')}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">
        Put these in the correct order, earliest first.
      </p>

      <fieldset className="mt-4 space-y-2" disabled={submitted || marking}>
        <legend className="sr-only">Arrange in order</legend>
        {order.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This question has no answer options. Please contact your Senior Learner.
          </p>
        ) : null}
        {order.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
              {index + 1}
            </span>
            <span className="flex-1">{item.text}</span>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => moveUp(index)}
                disabled={submitted || marking || index === 0}
                aria-label={`Move "${item.text}" up`}
                className="rounded-md border p-1 hover:bg-accent disabled:opacity-40"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => moveDown(index)}
                disabled={submitted || marking || index === order.length - 1}
                aria-label={`Move "${item.text}" down`}
                className="rounded-md border p-1 hover:bg-accent disabled:opacity-40"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </fieldset>

      {!submitted ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={submit}
            disabled={order.length === 0 || marking}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {marking ? 'Checking…' : 'Submit answer'}
          </button>
          {markError ? (
            <p className="mt-2 text-sm text-red-600">{markError}</p>
          ) : null}
          {/*
            The attempt is written to pde_submissions in one INSERT on the
            final question, so with no way past a marking outage the whole
            attempt was lost. Submit answer above is still the preferred path;
            this keeps the order on record when marking stays down.
          */}
          {savedUnmarked ? (
            <div
              className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
              aria-live="polite"
            >
              <p>
                Your order has been saved but could not be checked right now, so it is
                not marked right or wrong yet. Try again above, or move on — the order
                you arranged stays on record and can be marked later.
              </p>
              <button
                type="button"
                onClick={continueUnmarked}
                className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {isLastQuestion ? 'Submit attempt without checking' : 'Continue without checking'}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              (scorePct ?? 0) >= 100
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
          >
            <p>You scored {scorePct ?? 0}%.</p>
            {(scorePct ?? 0) < 100 ? (
              <p className="mt-1">Some steps were out of place.</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onContinue}
            className="mt-3 inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            {isLastQuestion ? 'Submit attempt' : 'Continue to next question'}
          </button>
        </div>
      )}
    </div>
  );
}
