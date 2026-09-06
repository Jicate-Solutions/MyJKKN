'use client';

/**
 * MCQWarmupQuestion — single-select MCQ with immediate validation.
 *
 * Marking is SERVER-SIDE. The answer key (correct_answer / options[].is_correct)
 * is never shipped to the browser: fn_pde_get_case_questions strips it from the
 * question payload, and grading happens via the SECURITY DEFINER RPC
 * fn_pde_mark_objective, which reads the key in the database and returns only
 * the verdict plus the correct option id (revealed post-answer for the review
 * highlight). No client-side comparison against a leaked key.
 *
 * Because marking is a live RPC round-trip it can fail. When it does, the
 * learner's chosen option is recorded with the verdict left UNRESOLVED rather
 * than discarded, and no correct/incorrect claim is shown — we cannot honestly
 * mark an answer the server never graded.
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
 * `marking_failed` distinguishes "chose option B, never graded" from "never
 * answered" (no envelope at all). It reaches pde_submissions.answers verbatim
 * (schemaless JSONB), so faculty can re-grade rather than guess. Declared here
 * rather than widening types/pde-clinical-reasoning.ts so this fix cannot
 * collide with concurrent edits to that shared module.
 */
type MCQAnswerEnvelope = ClinicalAnswerEnvelope & { marking_failed?: true };

interface MCQWarmupQuestionProps {
  question: ClinicalQuestion;
  onAnswered: (envelope: ClinicalAnswerEnvelope) => void;
  onContinue: () => void;
  isLastQuestion: boolean;
}

export function MCQWarmupQuestion({
  question,
  onAnswered,
  onContinue,
  isLastQuestion,
}: MCQWarmupQuestionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [savedUnmarked, setSavedUnmarked] = useState(false);
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const options = question.options ?? [];

  /**
   * Hand the selection up with no verdict attached. Safe to call repeatedly:
   * CaseAttempt.recordAnswer overwrites by question_id. Re-reads the current
   * selection each time, so changing the choice after a failure saves the
   * choice the learner can actually see.
   */
  function recordUnmarked() {
    if (!selectedId) return;
    const envelope: MCQAnswerEnvelope = {
      question_id: question.id,
      question_type: 'mcq_warmup',
      selected_option_id: selectedId,
      marking_failed: true,
      submitted_at: new Date().toISOString(),
    };
    onAnswered(envelope);
    setSavedUnmarked(true);
  }

  function continueUnmarked() {
    // Re-record first so a post-failure change of option is what gets saved.
    recordUnmarked();
    onContinue();
  }

  async function submit() {
    if (!selectedId || marking) return;
    setMarking(true);
    setMarkError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClientSupabaseClient() as any;
      const { data, error } = await supabase.rpc('fn_pde_mark_objective', {
        p_question_id: question.id,
        p_selected_option_id: selectedId,
      });
      if (error) throw new Error(error.message);
      const verdict = (data ?? {}) as { is_correct?: boolean; correct_id?: string | null };
      const serverCorrect = verdict.is_correct === true;
      setIsCorrect(serverCorrect);
      setCorrectId(verdict.correct_id ?? null);
      setSubmitted(true);
      onAnswered({
        question_id: question.id,
        question_type: 'mcq_warmup',
        selected_option_id: selectedId,
        is_correct: serverCorrect,
        submitted_at: new Date().toISOString(),
      });
      setSavedUnmarked(false);
    } catch (e) {
      setMarkError(
        e instanceof Error ? e.message : 'Could not mark this answer. Please try again.',
      );
      // Marking outage must not discard the learner's choice. Note we do NOT
      // set `submitted` — that would render a verdict ("Not quite…") and a
      // correct-answer highlight the server never actually returned.
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

      <fieldset className="mt-4 space-y-2" disabled={submitted || marking}>
        <legend className="sr-only">Choose one</legend>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This question has no answer options. Please contact your faculty.
          </p>
        ) : null}
        {options.map((o) => {
          const isSelected = selectedId === o.id;
          const isCorrectOption = submitted && correctId !== null && o.id === correctId;

          let tone = '';
          if (submitted && isSelected && isCorrectOption) tone = 'border-emerald-500 bg-emerald-50';
          else if (submitted && isSelected && !isCorrectOption) tone = 'border-red-500 bg-red-50';
          else if (submitted && isCorrectOption) tone = 'border-emerald-300';
          else if (isSelected) tone = 'border-primary';

          return (
            <label
              key={o.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors hover:bg-accent ${tone}`}
            >
              <input
                type="radio"
                name={`mcq-${question.id}`}
                value={o.id}
                checked={isSelected}
                onChange={() => setSelectedId(o.id)}
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
            disabled={!selectedId || options.length === 0 || marking}
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
                Your choice has been saved but could not be checked right now, so it is
                not marked right or wrong yet. Try again above, or move on — the option
                you picked stays on record and can be marked later.
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
              isCorrect
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-red-300 bg-red-50 text-red-900'
            }`}
          >
            {isCorrect ? 'Correct.' : 'Not quite — review the highlighted answer.'}
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
