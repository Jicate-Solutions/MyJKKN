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
 *   4. On failure: record the answer ANYWAY (without feedback) and let the
 *      learner continue. The coach is a live external LLM call that takes
 *      ~15s, so timeouts are routine; discarding several paragraphs of
 *      written clinical reasoning because of a transient outage is not an
 *      acceptable failure mode. The error banner and Retry are unchanged —
 *      a successful retry overwrites the same envelope (CaseAttempt keys
 *      recordAnswer on question_id) so coaching is added, never duplicated.
 */

import { useState } from 'react';
import { useCoachFeedback } from '@/hooks/pde/use-clinical-reasoning';
import type {
  ClinicalQuestion,
  ClinicalAnswerEnvelope,
} from '@/types/pde-clinical-reasoning';
import { CoachFeedbackPanel } from './CoachFeedbackPanel';

/**
 * Local widening of ClinicalAnswerEnvelope.
 *
 * `coach_failed` distinguishes three states that would otherwise collapse:
 *   - not attempted  → no envelope for this question_id at all
 *   - answered, uncoached → answer_text set, coach_feedback absent, this flag
 *   - answered, coached  → coach_feedback set
 *
 * It reaches pde_submissions.answers verbatim (schemaless JSONB, inserted
 * as-is by useCompleteAttempt), so faculty and the OSCE rubric can tell them
 * apart. Declared here rather than widening types/pde-clinical-reasoning.ts
 * so this fix cannot collide with concurrent edits to that shared module.
 */
type FreeTextAnswerEnvelope = ClinicalAnswerEnvelope & { coach_failed?: true };

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
  const [savedWithoutCoaching, setSavedWithoutCoaching] = useState(false);
  const coach = useCoachFeedback();

  const status: 'idle' | 'loading' | 'error' | 'success' = coach.isPending
    ? 'loading'
    : coach.isError
      ? 'error'
      : feedback
        ? 'success'
        : 'idle';

  /**
   * Hand the answer up with no coaching attached. Safe to call repeatedly:
   * CaseAttempt.recordAnswer overwrites by question_id. Re-reads the textarea
   * each time so that if the learner edits after a failure, what they see is
   * what gets saved.
   */
  function recordWithoutCoaching() {
    if (!answer.trim()) return;
    const envelope: FreeTextAnswerEnvelope = {
      question_id: question.id,
      question_type: 'free_text_socratic',
      answer_text: answer,
      coach_failed: true,
      submitted_at: new Date().toISOString(),
    };
    onAnswered(envelope);
    setSavedWithoutCoaching(true);
  }

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
      setSavedWithoutCoaching(false);
    } catch {
      // The error banner + Retry still come from coach.isError. What changed:
      // the written answer is no longer thrown away when the coach is down.
      recordWithoutCoaching();
    }
  }

  function retry() {
    coach.reset();
    setFeedback(null);
    void submit();
  }

  function continueWithoutCoaching() {
    // Re-record first so a post-failure edit is the version that is saved.
    recordWithoutCoaching();
    onContinue();
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

      {/*
        A way forward when the coach stays down. CoachFeedbackPanel's error
        state offers Retry only, and the attempt is written to
        pde_submissions in one INSERT on the final question — so with no way
        to advance, a coach outage discarded the whole attempt, not just one
        answer. Retry above is still the preferred path; this is the escape
        hatch that keeps the written work.
      */}
      {status === 'error' && savedWithoutCoaching ? (
        <div
          className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
          aria-live="polite"
        >
          <p>
            Your answer has been saved. Coach feedback is unavailable right now — retry
            above, or move on without it. What you wrote stays on record either way.
          </p>
          <button
            type="button"
            onClick={continueWithoutCoaching}
            className="mt-2 inline-flex items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            {isLastQuestion
              ? 'Submit attempt without coach feedback'
              : 'Continue without coach feedback'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
