'use client';

/**
 * MultiSelectQuestion — "select all that apply" with partial-credit marking.
 *
 * Marking is SERVER-SIDE. The answer key (options[].is_correct, plus the
 * exclusion_rationale naming the tempting wrong option) is never shipped to
 * the browser: fn_pde_get_case_questions strips it from the question
 * payload, and grading happens via the SECURITY DEFINER RPC
 * fn_pde_mark_clinical_answer, which reads the key in the database and
 * returns ONLY a score_pct — no correct-option list. Because there is no key
 * on the client, we cannot and must not highlight which options were right;
 * the learner sees their score and a neutral nudge, never "the answer".
 *
 * Because marking is a live RPC round-trip it can fail. When it does, the
 * learner's selections are recorded with the verdict left UNRESOLVED rather
 * than discarded, and no score is shown — we cannot honestly mark an answer
 * the server never graded.
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
 * `marking_failed` distinguishes "ticked these options, never graded" from
 * "never answered" (no envelope at all). It reaches pde_submissions.answers
 * verbatim (schemaless JSONB), so faculty can re-grade rather than guess.
 * Declared here rather than widening types/pde-clinical-reasoning.ts so this
 * fix cannot collide with concurrent edits to that shared module.
 */
type MultiSelectAnswerEnvelope = ClinicalAnswerEnvelope & { marking_failed?: true };

interface MultiSelectQuestionProps {
  question: ClinicalQuestion;
  onAnswered: (envelope: ClinicalAnswerEnvelope) => void;
  onContinue: () => void;
  isLastQuestion: boolean;
}

export function MultiSelectQuestion({
  question,
  onAnswered,
  onContinue,
  isLastQuestion,
}: MultiSelectQuestionProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [savedUnmarked, setSavedUnmarked] = useState(false);
  const [scorePct, setScorePct] = useState<number | null>(null);
  const options = question.options ?? [];

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  }

  /**
   * Hand the selections up with no verdict attached. Safe to call repeatedly:
   * CaseAttempt.recordAnswer overwrites by question_id. Re-reads the current
   * selections each time, so changing the ticks after a failure saves the
   * set the learner can actually see.
   */
  function recordUnmarked() {
    if (selectedIds.length === 0) return;
    const envelope: MultiSelectAnswerEnvelope = {
      question_id: question.id,
      question_type: 'multi_select',
      selected_option_ids: selectedIds,
      marking_failed: true,
      submitted_at: new Date().toISOString(),
    };
    onAnswered(envelope);
    setSavedUnmarked(true);
  }

  function continueUnmarked() {
    // Re-record first so a post-failure change of ticks is what gets saved.
    recordUnmarked();
    onContinue();
  }

  async function submit() {
    if (selectedIds.length === 0 || marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_pde_mark_clinical_answer', {
        p_question_id: question.id,
        p_answer: { selected_option_ids: selectedIds },
      });
      if (error) throw new Error(error.message);
      const verdict = (data ?? {}) as { score_pct?: number | null };
      const pct = verdict.score_pct ?? 0;
      setScorePct(pct);
      setSubmitted(true);
      onAnswered({
        question_id: question.id,
        question_type: 'multi_select',
        selected_option_ids: selectedIds,
        partial_score: pct,
        submitted_at: new Date().toISOString(),
      });
      setSavedUnmarked(false);
    } catch (e) {
      setMarkError(
        e instanceof Error ? e.message : 'Could not mark this answer. Please try again.',
      );
      // Marking outage must not discard the learner's ticks. Note we do NOT
      // set `submitted` — that would render a score the server never
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
      <p className="mt-1 text-xs text-muted-foreground">Select all that apply.</p>

      <fieldset className="mt-4 space-y-2" disabled={submitted || marking}>
        <legend className="sr-only">Select all that apply</legend>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This question has no answer options. Please contact your faculty.
          </p>
        ) : null}
        {options.map((o) => {
          const isSelected = selectedIds.includes(o.id);
          const tone = isSelected ? 'border-primary' : '';

          return (
            <label
              key={o.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-accent ${tone}`}
            >
              <input
                type="checkbox"
                name={`multi-select-${question.id}`}
                value={o.id}
                checked={isSelected}
                onChange={() => toggle(o.id)}
                className="mt-0.5"
              />
              <span className="flex-1">{o.text}</span>
            </label>
          );
        })}
      </fieldset>

      {!submitted ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={submit}
            disabled={selectedIds.length === 0 || options.length === 0 || marking}
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
            this keeps the choice on record when marking stays down.
          */}
          {savedUnmarked ? (
            <div
              className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
              role="status"
              aria-live="polite"
            >
              <p>
                Your selections have been saved but could not be checked right now, so
                they are not marked right or wrong yet. Try again above, or move on —
                the options you picked stay on record and can be marked later.
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
              <p className="mt-1">Some selections were missed or did not belong.</p>
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
