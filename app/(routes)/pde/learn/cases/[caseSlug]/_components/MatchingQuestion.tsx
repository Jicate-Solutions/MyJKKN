'use client';

/**
 * MatchingQuestion — pair each left-hand item with the matching option from
 * that pair's OWN option list, with partial-credit marking.
 *
 * Marking is SERVER-SIDE. The answer key (which option text is correct per
 * pair) is never shipped to the browser: fn_pde_get_case_questions ships
 * metadata.match_pairs with `left` and `options` only, and grading happens
 * via the SECURITY DEFINER RPC fn_pde_mark_clinical_answer, which reads the
 * key in the database and returns ONLY a score_pct — no correct-pairing
 * list. Because there is no key on the client, we cannot and must not
 * highlight which pairings were right; the learner sees their score and a
 * neutral nudge, never "the answer".
 *
 * Because marking is a live RPC round-trip it can fail. When it does, the
 * learner's selections are recorded with the verdict left UNRESOLVED rather
 * than discarded, and no score is shown — we cannot honestly mark an answer
 * the server never graded.
 *
 * Uses a native <select> per pair, NOT the Radix Select component: each pair
 * has its own distinct option list, and a native element sidesteps the
 * empty-string Radix SelectItem footgun entirely (scripts/ci/check-radix-
 * select-empty-values.sh only targets Radix, so this is a deliberate choice,
 * not an oversight).
 */

import { useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ClinicalQuestion,
  ClinicalAnswerEnvelope,
} from '@/types/pde-clinical-reasoning';

/**
 * Local widening of ClinicalAnswerEnvelope.
 *
 * `marking_failed` distinguishes "chose these pairings, never graded" from
 * "never answered" (no envelope at all). It reaches pde_submissions.answers
 * verbatim (schemaless JSONB), so faculty can re-grade rather than guess.
 * Declared here rather than widening types/pde-clinical-reasoning.ts so this
 * fix cannot collide with concurrent edits to that shared module.
 */
type MatchingAnswerEnvelope = ClinicalAnswerEnvelope & { marking_failed?: true };

interface MatchingQuestionProps {
  question: ClinicalQuestion;
  onAnswered: (envelope: ClinicalAnswerEnvelope) => void;
  onContinue: () => void;
  isLastQuestion: boolean;
}

export function MatchingQuestion({
  question,
  onAnswered,
  onContinue,
  isLastQuestion,
}: MatchingQuestionProps) {
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [savedUnmarked, setSavedUnmarked] = useState(false);
  const [scorePct, setScorePct] = useState<number | null>(null);
  const pairs = question.metadata?.match_pairs ?? [];
  const allPaired = pairs.length > 0 && pairs.every((p) => Boolean(selections[p.id]));

  function chooseFor(pairId: string, value: string) {
    setSelections((prev) => ({ ...prev, [pairId]: value }));
  }

  /**
   * Hand the selections up with no verdict attached. Safe to call repeatedly:
   * CaseAttempt.recordAnswer overwrites by question_id. Re-reads the current
   * selections each time, so changing a pairing after a failure saves the
   * set the learner can actually see.
   */
  function recordUnmarked() {
    if (Object.keys(selections).length === 0) return;
    const envelope: MatchingAnswerEnvelope = {
      question_id: question.id,
      question_type: 'matching',
      match_selections: selections,
      marking_failed: true,
      submitted_at: new Date().toISOString(),
    };
    onAnswered(envelope);
    setSavedUnmarked(true);
  }

  function continueUnmarked() {
    // Re-record first so a post-failure change of pairing is what gets saved.
    recordUnmarked();
    onContinue();
  }

  async function submit() {
    if (!allPaired || marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_pde_mark_clinical_answer', {
        p_question_id: question.id,
        p_answer: { match_selections: selections },
      });
      if (error) throw new Error(error.message);
      const verdict = (data ?? {}) as { score_pct?: number | null };
      const pct = verdict.score_pct ?? 0;
      setScorePct(pct);
      setSubmitted(true);
      onAnswered({
        question_id: question.id,
        question_type: 'matching',
        match_selections: selections,
        partial_score: pct,
        submitted_at: new Date().toISOString(),
      });
      setSavedUnmarked(false);
    } catch (e) {
      setMarkError(
        e instanceof Error ? e.message : 'Could not mark this answer. Please try again.',
      );
      // Marking outage must not discard the learner's pairings. Note we do
      // NOT set `submitted` — that would render a score the server never
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
      <p className="mt-1 text-xs text-muted-foreground">Match each item to the best option.</p>

      <fieldset className="mt-4 space-y-3" disabled={submitted || marking}>
        <legend className="sr-only">Match each item to an option</legend>
        {pairs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This question has no answer options. Please contact your faculty.
          </p>
        ) : null}
        {pairs.map((pair) => {
          const isSelected = Boolean(selections[pair.id]);
          const tone = isSelected ? 'border-primary' : '';

          return (
            <div
              key={pair.id}
              className={`flex flex-col gap-2 rounded-md border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${tone}`}
            >
              <span className="flex-1 font-medium">{pair.left}</span>
              <select
                aria-label={`Match for ${pair.left}`}
                value={selections[pair.id] ?? ''}
                onChange={(e) => chooseFor(pair.id, e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm sm:w-56"
              >
                <option value="">Choose…</option>
                {pair.options.map((optionText) => (
                  <option key={optionText} value={optionText}>
                    {optionText}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </fieldset>

      {!submitted ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={submit}
            disabled={!allPaired || pairs.length === 0 || marking}
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
            this keeps the pairing on record when marking stays down.
          */}
          {savedUnmarked ? (
            <div
              className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
              aria-live="polite"
            >
              <p>
                Your pairings have been saved but could not be checked right now, so
                they are not marked right or wrong yet. Try again above, or move on —
                the pairings you chose stay on record and can be marked later.
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
              <p className="mt-1">Some pairings did not match up.</p>
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
