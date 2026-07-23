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
 */

import { useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ClinicalQuestion,
  ClinicalAnswerEnvelope,
} from '@/types/pde-clinical-reasoning';

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
  const [correctId, setCorrectId] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState(false);
  const options = question.options ?? [];

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
    } catch (e) {
      setMarkError(
        e instanceof Error ? e.message : 'Could not mark this answer. Please try again.',
      );
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
