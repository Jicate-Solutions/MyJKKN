'use client';

/**
 * MCQWarmupQuestion — single-select MCQ with immediate validation against
 * `correct_answer`. No AI call; instant feedback.
 *
 * Note on correct_answer: pde_assessment_questions.correct_answer is a
 * scalar TEXT column. Convention: faculty stores the option `id` of the
 * correct choice there. If a row instead uses an `options` element with
 * `is_correct: true`, we honour that too.
 */

import { useState } from 'react';
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
  const options = question.options ?? [];

  function resolveCorrectId(): string | null {
    // Prefer explicit correct_answer text column if present
    if (question.correct_answer) return question.correct_answer;
    const flagged = options.find((o) => o.is_correct);
    return flagged?.id ?? null;
  }

  function submit() {
    if (!selectedId) return;
    const correctId = resolveCorrectId();
    const isCorrect = correctId !== null && selectedId === correctId;
    setSubmitted(true);
    onAnswered({
      question_id: question.id,
      question_type: 'mcq_warmup',
      selected_option_id: selectedId,
      is_correct: isCorrect,
      submitted_at: new Date().toISOString(),
    });
  }

  const correctId = resolveCorrectId();

  return (
    <div>
      <h3 className="mt-2 text-base font-semibold sm:text-lg">{question.question_text}</h3>
      {question.metadata?.osce_domain ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Domain: {question.metadata.osce_domain.replace(/_/g, ' ')}
        </p>
      ) : null}

      <fieldset className="mt-4 space-y-2" disabled={submitted}>
        <legend className="sr-only">Choose one</legend>
        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This question has no answer options. Please contact your faculty.
          </p>
        ) : null}
        {options.map((o) => {
          const isSelected = selectedId === o.id;
          const showResult = submitted;
          const isCorrectOption = correctId !== null && o.id === correctId;

          let tone = '';
          if (showResult && isSelected && isCorrectOption) tone = 'border-emerald-500 bg-emerald-50';
          else if (showResult && isSelected && !isCorrectOption) tone = 'border-red-500 bg-red-50';
          else if (showResult && isCorrectOption) tone = 'border-emerald-300';
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
        <button
          type="button"
          onClick={submit}
          disabled={!selectedId || options.length === 0}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Submit answer
        </button>
      ) : (
        <div className="mt-4">
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              correctId !== null && selectedId === correctId
                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                : 'border-red-300 bg-red-50 text-red-900'
            }`}
          >
            {correctId !== null && selectedId === correctId
              ? 'Correct.'
              : 'Not quite — review the highlighted answer.'}
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
