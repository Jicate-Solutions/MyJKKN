'use client';

/**
 * CaseAttempt — client orchestrator for the clinical case attempt page.
 *
 * Responsibilities:
 *   - Phone-responsive layout: stacked at 360px, side-by-side scenario/Q
 *     panels at 768px+, three-column with progress at 1024px+.
 *   - Attempt counter wiring.
 *   - Question renderer dispatch (3 variants).
 *   - Coach feedback panel state (retry on failure).
 *   - Submit-and-complete flow on the final question.
 *
 * Renderers are added in subsequent commits (c–g). For now this is a
 * scaffold that wires the page together and renders the patient scenario
 * + a "questions are coming" placeholder list, so the route compiles and
 * the layout can be eyeballed at the three breakpoints.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ClinicalCaseBundle,
  ClinicalAnswerEnvelope,
  ClinicalEvidenceEnvelope,
} from '@/types/pde-clinical-reasoning';
import { AttemptCounter } from './AttemptCounter';
import { CapReachedState } from './CapReachedState';
import { FreeTextSocraticQuestion } from './FreeTextSocraticQuestion';
import { MCQWarmupQuestion } from './MCQWarmupQuestion';
import { ImageTagQuestion } from './ImageTagQuestion';
import { useCompleteAttempt, useFinalizeAttempt } from '@/hooks/pde/use-clinical-reasoning';

interface CaseAttemptProps {
  bundle: ClinicalCaseBundle;
  rollNumberSnapshot: string | null;
}

/**
 * Local widening, mirroring the one MCQWarmupQuestion declares. `marking_failed`
 * is set by the marking-outage escape hatch and rides along to
 * pde_submissions.answers verbatim (schemaless JSONB), which is what lets
 * faculty tell "picked B, never graded" apart from "picked B, graded wrong".
 * Declared here rather than widening types/pde-clinical-reasoning.ts so this
 * fix cannot collide with concurrent edits to that shared module.
 */
type MarkableAnswer = ClinicalAnswerEnvelope & { marking_failed?: true };

/**
 * True when the server never returned a verdict for an answer the learner did
 * give — a platform failure, not a learner one, so it must not be scored.
 *
 * `marking_failed` is the signal the escape hatch sets. The per-type verdict
 * checks are the same fact read directly rather than a second convention, and
 * are coextensive with the flag today: MCQWarmupQuestion only ever records
 * either a boolean `is_correct` or the flag, and ImageTagQuestion only ever
 * records a numeric `region_score`. They are kept as a guard so a future path
 * that omits a verdict without setting the flag cannot silently reintroduce
 * "unmarked scores as wrong".
 */
function isUnresolved(a: ClinicalAnswerEnvelope): boolean {
  if ((a as MarkableAnswer).marking_failed === true) return true;
  if (a.question_type === 'mcq_warmup') return typeof a.is_correct !== 'boolean';
  if (a.question_type === 'image_tag') return typeof a.region_score !== 'number';
  return false;
}

export function CaseAttempt({ bundle, rollNumberSnapshot }: CaseAttemptProps) {
  const router = useRouter();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<ClinicalAnswerEnvelope[]>([]);
  const [startTime] = useState(() => Date.now());
  const completeMutation = useCompleteAttempt();
  const finalizeMutation = useFinalizeAttempt();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const questionRef = useRef<HTMLDivElement>(null);

  // On mobile/tablet, scrolling the new question into view after Continue
  // avoids the "where did the next Q go?" silent-failure pattern.
  useEffect(() => {
    if (questionRef.current && questionIndex > 0) {
      questionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [questionIndex]);

  if (bundle.capReached) {
    return (
      <CapReachedState
        attemptsCap={bundle.attemptsCap}
        bestSubmission={bundle.bestSubmission}
        caseTitle={bundle.assessment.title}
        caseSlug={bundle.assessment.id}
      />
    );
  }

  const currentAttemptNumber = bundle.attemptsUsed + 1;
  const question = bundle.questions[questionIndex];
  const isLastQuestion = questionIndex === bundle.questions.length - 1;

  function recordAnswer(env: ClinicalAnswerEnvelope) {
    setAnswers((prev) => {
      // overwrite if learner re-answers same question, else append
      const existing = prev.findIndex((a) => a.question_id === env.question_id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = env;
        return next;
      }
      return [...prev, env];
    });
  }

  function moveNext() {
    if (isLastQuestion) {
      finalSubmit();
    } else {
      setQuestionIndex((i) => i + 1);
    }
  }

  async function finalSubmit() {
    setSubmitError(null);
    try {
      // Compute auto_score (MCQs + image_tag combined; free_text doesn't auto-score).
      // Denominator is EVERY scorable question in the bundle, not just the ones the
      // learner answered: a SKIPPED scorable question counts as zero. Dividing by
      // the answered count let a learner who got one MCQ right and skipped the rest
      // see 100%. The OSCE rubric overwrites final_score post-submission.
      //
      // UNRESOLVED answers are the one exception, and are NOT the same thing as
      // skipped. A skip is the learner's choice; an unresolved answer is ours —
      // the learner picked an option and our marking RPC failed (#2630 keeps the
      // choice on record instead of discarding the attempt). Counting it as zero
      // scored that learner exactly as if they had answered incorrectly, so the
      // safeguard actively penalised the person it exists to protect. Dropping it
      // from BOTH numerator and denominator makes it neither reward nor penalty:
      // the learner is scored on what was actually markable.
      const isScorable = (t: ClinicalAnswerEnvelope['question_type']) =>
        t === 'mcq_warmup' || t === 'image_tag';
      const scorable = answers.filter((a) => isScorable(a.question_type));
      const unresolvedIds = new Set(scorable.filter(isUnresolved).map((a) => a.question_id));
      const resolved = scorable.filter((a) => !unresolvedIds.has(a.question_id));
      // Skipped questions have no envelope, so they are absent from unresolvedIds
      // and keep their zero-weight slot in the denominator. Only questions the
      // learner actually answered-but-we-failed-to-mark are removed.
      const scorableTotal = bundle.questions.filter(
        (q) => isScorable(q.question_type) && !unresolvedIds.has(q.id)
      ).length;
      let autoScore: number | null = null;
      // No markable question at all -> null, never NaN. Covers both "bundle has no
      // scorable questions" and "every scorable answer came back unresolved".
      if (scorableTotal > 0) {
        const sum = resolved.reduce((acc, a) => {
          if (a.question_type === 'mcq_warmup') return acc + (a.is_correct ? 100 : 0);
          if (a.question_type === 'image_tag') return acc + (a.region_score ?? 0);
          return acc;
        }, 0);
        autoScore = sum / scorableTotal;
      }

      const evidence: ClinicalEvidenceEnvelope = {
        type: 'clinical_case_attempt',
        coach_messages: answers
          .filter((a) => a.coach_feedback)
          .map((a) => ({
            question_id: a.question_id,
            feedback: a.coach_feedback!,
            timestamp: a.submitted_at,
          })),
      };

      const timeSpentSeconds = Math.floor((Date.now() - startTime) / 1000);
      const result = await completeMutation.mutateAsync({
        assessmentId: bundle.assessment.id,
        learnerId: bundle.learnerProfileId,
        attemptNumber: currentAttemptNumber,
        assessmentVersion: bundle.assessment.version,
        rollNumberSnapshot,
        answers,
        evidence,
        timeSpentSeconds,
        autoScore,
        passed: autoScore !== null ? autoScore >= 60 : null,
      });

      // Fire Agent E's OSCE scoring + engagement event + evidence mapping.
      // Failures here don't roll back the saved attempt — the learner can
      // still see their submission on the summary page; faculty can re-run.
      try {
        await finalizeMutation.mutateAsync({ submissionId: result.submissionId });
      } catch (e) {
        // Surface to console so dev sees it but don't block navigation.
        // eslint-disable-next-line no-console
        console.warn('OSCE scoring failed; summary will show without it:', e);
      }

      router.push(`/pde/learn/cases/${bundle.assessment.id}/summary/${result.submissionId}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to save attempt');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Layout — phone-first, tablet+ side-by-side, desktop three-column.
  // 360px:  stacked   (patient → counter → question)
  // 768px:  2-col     (patient on left, question on right)
  // 1024px+: 3-col    (patient | question | progress sidebar)
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <header className="mt-4">
        <h1 className="text-xl font-semibold sm:text-2xl">{bundle.assessment.title}</h1>
        {bundle.assessment.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{bundle.assessment.description}</p>
        ) : null}
      </header>

      <AttemptCounter
        attemptsUsed={bundle.attemptsUsed}
        attemptsCap={bundle.attemptsCap}
        current={currentAttemptNumber}
        bestSubmission={bundle.bestSubmission}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-[1fr_1.5fr_minmax(180px,240px)]">
        {/* Patient scenario panel — sticky on desktop so it stays visible while answering */}
        <aside className="rounded-lg border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Patient
          </h2>
          <h3 className="mt-1 text-lg font-semibold">
            {bundle.scenario.patient_name}, {bundle.scenario.age}
            {bundle.scenario.gender ? ` · ${bundle.scenario.gender}` : ''}
          </h3>
          {bundle.scenario.occupation ? (
            <p className="text-xs text-muted-foreground">{bundle.scenario.occupation}</p>
          ) : null}

          {bundle.scenario.image_url ? (
            <div className="mt-3 overflow-hidden rounded-md border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bundle.scenario.image_url}
                alt={`Clinical photograph: ${bundle.scenario.patient_name}`}
                className="w-full max-h-64 object-contain"
                loading="lazy"
              />
            </div>
          ) : null}

          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="font-medium">Chief complaint</dt>
              <dd className="text-muted-foreground">{bundle.scenario.chief_complaint}</dd>
            </div>
            <div>
              <dt className="font-medium">HOPI</dt>
              <dd className="text-muted-foreground">{bundle.scenario.hopi}</dd>
            </div>
            <div>
              <dt className="font-medium">Medical history</dt>
              <dd className="text-muted-foreground">{bundle.scenario.medical_history}</dd>
            </div>
            {bundle.scenario.habit_history?.type && bundle.scenario.habit_history.type !== 'None' ? (
              <div>
                <dt className="font-medium">Habits</dt>
                <dd className="text-muted-foreground">
                  {bundle.scenario.habit_history.type} ·{' '}
                  {bundle.scenario.habit_history.duration_years} yrs ·{' '}
                  {bundle.scenario.habit_history.frequency} · {bundle.scenario.habit_history.quantity}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="font-medium">Examination</dt>
              <dd className="text-muted-foreground">{bundle.scenario.additional_clinical_details}</dd>
            </div>
          </dl>
        </aside>

        {/* Question column */}
        <main className="min-w-0">
          <div ref={questionRef} className="rounded-lg border bg-card p-4 sm:p-6">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Question {questionIndex + 1} of {bundle.questions.length}
            </div>

            {/*
              key={question.id} is load-bearing, not decoration. Each renderer keeps
              its answer/feedback in local useState. Without a key the component type
              and position are identical from one question to the next, so React reuses
              the same instance and that state survives the advance — the free-text
              renderer then still holds the previous answer and coach reply, which keeps
              it in its "answered" state: textarea disabled, feedback button gone. The
              learner could answer the first free-text question and no other. Keying on
              the question id remounts on every advance, so child state starts clean.
            */}
            {question.question_type === 'free_text_socratic' ? (
              <FreeTextSocraticQuestion
                key={question.id}
                question={question}
                learnerId={bundle.learnerProfileId}
                assessmentId={bundle.assessment.id}
                onAnswered={recordAnswer}
                onContinue={moveNext}
                isLastQuestion={isLastQuestion}
              />
            ) : null}

            {question.question_type === 'mcq_warmup' ? (
              <MCQWarmupQuestion
                key={question.id}
                question={question}
                onAnswered={recordAnswer}
                onContinue={moveNext}
                isLastQuestion={isLastQuestion}
              />
            ) : null}

            {question.question_type === 'image_tag' ? (
              <ImageTagQuestion
                key={question.id}
                question={question}
                onAnswered={recordAnswer}
                onContinue={moveNext}
                isLastQuestion={isLastQuestion}
              />
            ) : null}

            {completeMutation.isPending || finalizeMutation.isPending ? (
              <div className="mt-4 flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900" role="status" aria-live="polite">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-sky-500" />
                {completeMutation.isPending ? 'Saving your attempt…' : 'Computing OSCE score…'}
              </div>
            ) : null}

            {submitError ? (
              <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
                {submitError}
                <button
                  type="button"
                  onClick={finalSubmit}
                  className="ml-3 underline hover:no-underline"
                >
                  Retry save
                </button>
              </div>
            ) : null}
          </div>
        </main>

        {/* Progress sidebar — only at lg+, hidden below */}
        <aside className="hidden lg:block">
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Progress
            </h3>
            <ol className="mt-3 space-y-2 text-sm">
              {bundle.questions.map((q, i) => {
                const answered = answers.some((a) => a.question_id === q.id);
                const isCurrent = i === questionIndex;
                return (
                  <li
                    key={q.id}
                    className={`flex items-center gap-2 ${
                      isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${
                        answered
                          ? 'border-emerald-500 bg-emerald-500 text-white'
                          : isCurrent
                            ? 'border-foreground'
                            : ''
                      }`}
                    >
                      {answered ? '✓' : i + 1}
                    </span>
                    <span className="truncate">Q{i + 1}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
