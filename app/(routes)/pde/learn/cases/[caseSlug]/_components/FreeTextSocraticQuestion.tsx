'use client';

/**
 * FreeTextSocraticQuestion — textarea + Socratic AI feedback flow.
 *
 * Submit path:
 *   1. Learner types answer, clicks "Get coach feedback"
 *   2. POST /api/pde/coach with { learnerId, contextType:'clinical_case',
 *      contextId: assessmentId, message: answer, questionId }
 *   3. On success: show feedback via <CoachFeedbackPanel>; record answer
 *      envelope; continue button advances
 *   4. On failure: show retry; do NOT record answer yet
 */

import { useState } from 'react';
import { useCoachFeedback } from '@/hooks/pde/use-clinical-reasoning';
import type {
  ClinicalQuestion,
  ClinicalAnswerEnvelope,
} from '@/types/pde-clinical-reasoning';
import { CoachFeedbackPanel } from './CoachFeedbackPanel';

interface FreeTextSocraticQuestionProps {
  question: ClinicalQuestion;
  learnerId: string;
  assessmentId: string;
  onAnswered: (envelope: ClinicalAnswerEnvelope) => void;
  onContinue: () => void;
  isLastQuestion: boolean;
}

export function FreeTextSocraticQuestion({
  question,
  learnerId,
  assessmentId,
  onAnswered,
  onContinue,
  isLastQuestion,
}: FreeTextSocraticQuestionProps) {
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const coach = useCoachFeedback();

  const status: 'idle' | 'loading' | 'error' | 'success' = coach.isPending
    ? 'loading'
    : coach.isError
      ? 'error'
      : feedback
        ? 'success'
        : 'idle';

  async function submit() {
    if (!answer.trim()) return;
    try {
      const res = await coach.mutateAsync({
        learnerId,
        contextType: 'clinical_case',
        contextId: assessmentId,
        message: answer,
        questionId: question.id,
      });
      setFeedback(res.feedback);
      onAnswered({
        question_id: question.id,
        question_type: 'free_text_socratic',
        answer_text: answer,
        coach_feedback: res.feedback,
        submitted_at: new Date().toISOString(),
      });
    } catch {
      // error state is reflected via coach.isError; do NOT call onAnswered
    }
  }

  function retry() {
    coach.reset();
    setFeedback(null);
    void submit();
  }

  return (
    <div>
      <h3 className="mt-2 text-base font-semibold sm:text-lg">{question.question_text}</h3>
      {question.metadata?.osce_domain ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Domain: {question.metadata.osce_domain.replace(/_/g, ' ')}
        </p>
      ) : null}

      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        disabled={status === 'loading' || status === 'success'}
        placeholder="Write your reasoning. The coach will respond — they won't give the answer, but they'll help you think through it."
        rows={6}
        className="mt-3 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {status === 'idle' || status === 'error' ? (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={submit}
            disabled={!answer.trim()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Get coach feedback
          </button>
          <span className="text-xs text-muted-foreground">
            {answer.length} character{answer.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      <CoachFeedbackPanel
        status={status}
        feedback={feedback}
        errorMessage={coach.error?.message ?? null}
        onRetry={retry}
        onContinue={onContinue}
        isLastQuestion={isLastQuestion}
      />
    </div>
  );
}
