'use client';

/**
 * CaseAttempt — client orchestrator for the clinical case attempt page.
 *
 * Responsibilities:
 *   - Phone-responsive layout: stacked at 360px, side-by-side scenario/Q
 *     panels at 768px+, three-column with progress at 1024px+.
 *   - Attempt counter wiring.
 *   - Question renderer dispatch (6 variants).
 *   - Coach feedback panel state (retry on failure).
 *   - Stage flow + stage locking, for cases that have stages.
 *   - Submit-and-complete flow on the final question.
 *
 * TWO SHAPES, ONE COMPONENT
 *   A case with NO stages (every case authored before stages existed) runs the
 *   flat path: one patient scenario, one list of questions, submit at the end.
 *   Nothing about that path changed.
 *
 *   A case WITH stages runs one stage at a time. Each stage carries its own
 *   clinical narrative, its own figure and its own questions, and the next
 *   stage does not open until this one is passed. That gate is not a UI
 *   preference: a later stage states an earlier stage's answer, so the database
 *   withholds a locked stage's text entirely (fn_pde_get_case_stages) and
 *   withholds its questions entirely (fn_pde_get_case_questions). This
 *   component re-reads both after a stage is cleared, which is the moment the
 *   next stage's content starts existing on the wire.
 */

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ClinicalCaseBundle,
  ClinicalAnswerEnvelope,
  ClinicalEvidenceEnvelope,
  ClinicalQuestion,
  ClinicalStageResult,
  ClinicalStageView,
} from '@/types/pde-clinical-reasoning';
import { DEFAULT_CLINICAL_PASSING_THRESHOLD_PCT } from '@/types/pde-clinical-reasoning';
import { AttemptCounter } from './AttemptCounter';
import { CapReachedState } from './CapReachedState';
import { FreeTextSocraticQuestion } from './FreeTextSocraticQuestion';
import { MCQWarmupQuestion } from './MCQWarmupQuestion';
import { ImageTagQuestion } from './ImageTagQuestion';
import { MultiSelectQuestion } from './MultiSelectQuestion';
import { MatchingQuestion } from './MatchingQuestion';
import { SequencingQuestion } from './SequencingQuestion';
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

/** Question types the platform can mark without a human or the AI coach. */
const OBJECTIVE_TYPES: ReadonlySet<ClinicalAnswerEnvelope['question_type']> = new Set([
  'mcq_warmup',
  'image_tag',
  'multi_select',
  'matching',
  'sequencing',
]);

/**
 * True when the server never returned a verdict for an answer the learner did
 * give — a platform failure, not a learner one, so it must not be scored.
 *
 * `marking_failed` is the signal the escape hatch sets. The per-type verdict
 * checks are the same fact read directly rather than a second convention, and
 * are coextensive with the flag today: MCQWarmupQuestion only ever records
 * either a boolean `is_correct` or the flag, ImageTagQuestion only ever records
 * a numeric `region_score`, and the three partial-credit renderers only ever
 * record a numeric `partial_score`. They are kept as a guard so a future path
 * that omits a verdict without setting the flag cannot silently reintroduce
 * "unmarked scores as wrong".
 */
function isUnresolved(a: ClinicalAnswerEnvelope): boolean {
  if ((a as MarkableAnswer).marking_failed === true) return true;
  if (a.question_type === 'mcq_warmup') return typeof a.is_correct !== 'boolean';
  if (a.question_type === 'image_tag') return typeof a.region_score !== 'number';
  if (
    a.question_type === 'multi_select' ||
    a.question_type === 'matching' ||
    a.question_type === 'sequencing'
  ) {
    return typeof a.partial_score !== 'number';
  }
  return false;
}

/** The 0..100 an answer contributes once it has actually been marked. */
function answerScore(a: ClinicalAnswerEnvelope): number {
  if (a.question_type === 'mcq_warmup') return a.is_correct ? 100 : 0;
  if (a.question_type === 'image_tag') return a.region_score ?? 0;
  return a.partial_score ?? 0;
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

  // Stage state. Seeded from the server render, then re-read from the database
  // after every stage submission — passing a stage is what brings the next
  // stage's scenario and questions into existence on the wire.
  const [stages, setStages] = useState<ClinicalStageView[]>(bundle.stages ?? []);
  const [questions, setQuestions] = useState<ClinicalQuestion[]>(bundle.questions);
  const [stageComplete, setStageComplete] = useState(false);
  const [stageResult, setStageResult] = useState<ClinicalStageResult | null>(null);
  const [stageSubmitting, setStageSubmitting] = useState(false);
  const [stageError, setStageError] = useState<string | null>(null);
  // Bumped on "try this stage again" so every renderer remounts with clean state.
  const [retryNonce, setRetryNonce] = useState(0);

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
        // Only `true` counts. An older bundle without the field, or a notice
        // that could not be delivered, must not tell the learner someone knows.
        facultyNotified={bundle.facultyNotified === true}
      />
    );
  }

  const currentAttemptNumber = bundle.attemptsUsed + 1;

  const staged = stages.length > 0;
  // The stage the learner is on: the first one open to them that they have not
  // yet cleared. Once every stage is cleared there is none, and the attempt is
  // ready to be submitted.
  const currentStage = staged
    ? (stages.find((s) => s.is_unlocked && !s.is_passed) ?? null)
    : null;
  const allStagesPassed = staged && stages.every((s) => s.is_passed);

  // In a staged case only the current stage's questions are on screen — and
  // only the open stages' questions are in `questions` at all.
  const activeQuestions = staged
    ? questions.filter((q) => q.stage_id === currentStage?.id)
    : questions;

  const question = activeQuestions[questionIndex];
  const isLastInStep = questionIndex === activeQuestions.length - 1;
  // For a staged case the end of a step is the end of a STAGE, not of the
  // attempt, so the renderers must not offer to submit the whole attempt there.
  const isLastQuestion = !staged && isLastInStep;

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
    if (!isLastInStep) {
      setQuestionIndex((i) => i + 1);
      return;
    }
    if (staged) {
      // End of a stage: hand over to the stage gate rather than the attempt.
      setStageComplete(true);
      return;
    }
    finalSubmit();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Stage submission — the gate
  // ──────────────────────────────────────────────────────────────────────────
  // Raw answers go to fn_pde_submit_stage, which re-marks every objective one
  // against the key in the database and compares the result with the platform
  // policy clinical_reasoning.scoring.passing_threshold_pct. Nothing computed
  // in this browser decides whether the next stage opens.
  async function submitStage() {
    if (!currentStage || stageSubmitting) return;
    setStageError(null);
    setStageSubmitting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClientSupabaseClient() as any;
      const stageQuestionIds = new Set(activeQuestions.map((q) => q.id));
      const stageAnswers = answers
        .filter((a) => stageQuestionIds.has(a.question_id))
        .map((a) => ({
          question_id: a.question_id,
          selected_option_id: a.selected_option_id,
          selected_option_ids: a.selected_option_ids,
          match_selections: a.match_selections,
          sequence_order: a.sequence_order,
          click_point: a.click_point,
        }));

      const { data, error } = await supabase.rpc('fn_pde_submit_stage', {
        p_stage_id: currentStage.id,
        p_answers: stageAnswers,
      });
      if (error) throw new Error(error.message);
      const result = data as ClinicalStageResult;
      setStageResult(result);

      // Re-read both. On a pass this is what makes the next stage's narrative
      // and questions available; on a fail it refreshes the recorded score.
      const [stagesRes, questionsRes] = await Promise.all([
        supabase.rpc('fn_pde_get_case_stages', { p_assessment_id: bundle.assessment.id }),
        supabase.rpc('fn_pde_get_case_questions', { p_assessment_id: bundle.assessment.id }),
      ]);
      // Only adopt a NON-EMPTY re-read. A case that has stages can never
      // legitimately return zero of them, so an empty array here means the read
      // failed, not that the case changed shape. Taking it at face value would
      // collapse a staged case into the flat view mid-attempt — the learner
      // would suddenly be looking at a screen that does not match the case they
      // are working through. Keeping the last known-good state is the honest
      // failure: the stage verdict below still tells them where they stand.
      if (Array.isArray(stagesRes?.data) && stagesRes.data.length > 0) {
        setStages(stagesRes.data as ClinicalStageView[]);
      }
      if (Array.isArray(questionsRes?.data) && questionsRes.data.length > 0) {
        setQuestions(questionsRes.data as ClinicalQuestion[]);
      }

      if (result?.passed) {
        setStageComplete(false);
        setQuestionIndex(0);
        setStageResult(null);
      }
    } catch (e) {
      setStageError(
        e instanceof Error ? e.message : 'Could not submit this stage. Please try again.',
      );
    } finally {
      setStageSubmitting(false);
    }
  }

  /** Clear this stage's answers and start it over. */
  function retryStage() {
    const stageQuestionIds = new Set(activeQuestions.map((q) => q.id));
    setAnswers((prev) => prev.filter((a) => !stageQuestionIds.has(a.question_id)));
    setStageResult(null);
    setStageComplete(false);
    setStageError(null);
    setQuestionIndex(0);
    setRetryNonce((n) => n + 1);
  }

  async function finalSubmit() {
    setSubmitError(null);
    try {
      // Compute auto_score (every objectively markable type combined; free_text
      // doesn't auto-score). Denominator is EVERY scorable question in the
      // bundle, not just the ones the learner answered: a SKIPPED scorable
      // question counts as zero. Dividing by the answered count let a learner
      // who got one MCQ right and skipped the rest see 100%. The OSCE rubric
      // overwrites final_score post-submission.
      //
      // UNRESOLVED answers are the one exception, and are NOT the same thing as
      // skipped. A skip is the learner's choice; an unresolved answer is ours —
      // the learner answered and our marking RPC failed (#2630 keeps the
      // choice on record instead of discarding the attempt). Counting it as zero
      // scored that learner exactly as if they had answered incorrectly, so the
      // safeguard actively penalised the person it exists to protect. Dropping it
      // from BOTH numerator and denominator makes it neither reward nor penalty:
      // the learner is scored on what was actually markable.
      const isScorable = (t: ClinicalAnswerEnvelope['question_type']) => OBJECTIVE_TYPES.has(t);
      const scorable = answers.filter((a) => isScorable(a.question_type));
      const unresolvedIds = new Set(scorable.filter(isUnresolved).map((a) => a.question_id));
      const resolved = scorable.filter((a) => !unresolvedIds.has(a.question_id));
      // Skipped questions have no envelope, so they are absent from unresolvedIds
      // and keep their zero-weight slot in the denominator. Only questions the
      // learner actually answered-but-we-failed-to-mark are removed.
      const scorableTotal = questions.filter(
        (q) => isScorable(q.question_type) && !unresolvedIds.has(q.id)
      ).length;
      let autoScore: number | null = null;
      // No markable question at all -> null, never NaN. Covers both "bundle has no
      // scorable questions" and "every scorable answer came back unresolved".
      if (scorableTotal > 0) {
        const sum = resolved.reduce((acc, a) => acc + answerScore(a), 0);
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
        // The pass mark comes from clinical_reasoning.scoring.passing_threshold_pct,
        // resolved server-side and carried on the bundle. It used to be a bare
        // 60 here, which meant the policy could move (60 -> 80 on 2026-09-18)
        // while this stamp stayed on the old bar.
        //
        // This value is PROVISIONAL: /api/pde/clinical-reasoning/score
        // overwrites `passed` moments later with the rubric score judged against
        // the same policy. But that call's failure is swallowed below so the
        // learner never loses a saved attempt — and when it is swallowed, this
        // stamp is the one that survives. It has to be right on its own.
        passed:
          autoScore !== null
            ? autoScore >=
              (bundle.passingThresholdPct ?? DEFAULT_CLINICAL_PASSING_THRESHOLD_PCT)
            : null,
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

  /*
    key is load-bearing, not decoration. Each renderer keeps its answer/feedback
    in local useState. Without a key the component type and position are
    identical from one question to the next, so React reuses the same instance
    and that state survives the advance — the free-text renderer then still
    holds the previous answer and coach reply, which keeps it in its "answered"
    state: textarea disabled, feedback button gone. The learner could answer the
    first free-text question and no other. Keying on the question id remounts on
    every advance, so child state starts clean. retryNonce is folded in so
    restarting a failed stage also clears every renderer.
  */
  function renderQuestion(q: ClinicalQuestion) {
    const key = `${q.id}:${retryNonce}`;
    const shared = {
      question: q,
      onAnswered: recordAnswer,
      onContinue: moveNext,
      isLastQuestion,
    };
    switch (q.question_type) {
      case 'free_text_socratic':
        return (
          <FreeTextSocraticQuestion
            key={key}
            learnerId={bundle.learnerProfileId}
            assessmentId={bundle.assessment.id}
            {...shared}
          />
        );
      case 'mcq_warmup':
        return <MCQWarmupQuestion key={key} {...shared} />;
      case 'image_tag':
        return <ImageTagQuestion key={key} {...shared} />;
      case 'multi_select':
        return <MultiSelectQuestion key={key} {...shared} />;
      case 'matching':
        return <MatchingQuestion key={key} {...shared} />;
      case 'sequencing':
        return <SequencingQuestion key={key} {...shared} />;
      default:
        return null;
    }
  }

  const lockedCount = stages.filter((s) => !s.is_unlocked).length;

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

      {/*
        Stage rail. Deliberately shows the locked stages too, as numbered
        placeholders — the learner should know the case continues and that this
        stage is what stands between them and the rest of it. A locked stage's
        title is withheld by the database, because a title like "Confirmed
        Pemphigus Vulgaris" would answer the stage they are still working on.
      */}
      {staged ? (
        <nav aria-label="Case stages" className="mt-4">
          <ol className="flex flex-wrap items-center gap-2 text-xs">
            {stages.map((s) => {
              const isCurrent = currentStage?.id === s.id;
              const tone = s.is_passed
                ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                : isCurrent
                  ? 'border-foreground font-semibold'
                  : s.is_unlocked
                    ? 'border-border text-muted-foreground'
                    : 'border-dashed border-border text-muted-foreground';
              return (
                <li
                  key={s.id}
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`rounded-full border px-3 py-1 ${tone}`}
                >
                  Stage {s.stage_order}
                  {s.is_passed ? ' ✓' : null}
                  {!s.is_unlocked ? ' · Locked' : null}
                  {s.is_unlocked && s.title ? ` · ${s.title}` : null}
                </li>
              );
            })}
          </ol>
          {lockedCount > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {lockedCount === 1
                ? 'One more stage opens once you pass this one.'
                : `${lockedCount} more stages open as you pass each stage.`}{' '}
              Later stages describe findings that answer the questions you are on now, so
              they stay closed until then.
            </p>
          ) : null}
        </nav>
      ) : null}

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

          {/* This stage's own narrative and figure, below the standing patient record. */}
          {currentStage ? (
            <div className="mt-4 border-t pt-4">
              <h3 className="text-sm font-semibold">
                Stage {currentStage.stage_order}
                {currentStage.title ? ` · ${currentStage.title}` : ''}
              </h3>
              {currentStage.scenario_text ? (
                <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                  {currentStage.scenario_text}
                </p>
              ) : null}
              {currentStage.image_url ? (
                <div className="mt-3 overflow-hidden rounded-md border bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentStage.image_url}
                    alt={`Stage ${currentStage.stage_order} clinical image`}
                    className="w-full max-h-64 object-contain"
                    loading="lazy"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </aside>

        {/* Question column */}
        <main className="min-w-0">
          <div ref={questionRef} className="rounded-lg border bg-card p-4 sm:p-6">
            {/* Every stage cleared — nothing left but to hand the attempt in. */}
            {staged && allStagesPassed ? (
              <div>
                <h2 className="text-base font-semibold sm:text-lg">All stages cleared</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  You have worked through every stage of this case. Submit your attempt to see
                  your feedback and score.
                </p>
                <button
                  type="button"
                  onClick={finalSubmit}
                  disabled={completeMutation.isPending || finalizeMutation.isPending}
                  className="mt-4 inline-flex items-center justify-center rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  Submit attempt
                </button>
              </div>
            ) : staged && !currentStage ? (
              /*
                Staged, nothing cleared, and no stage open. Only reachable if the
                case has stages but stage 1 is somehow unavailable. Say so
                plainly — a blank panel here would be exactly the silent dead end
                this module is not allowed to have.
              */
              <div role="alert">
                <h2 className="text-base font-semibold sm:text-lg">This case is not ready yet</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  No stage of this case is open to you at the moment. Please contact your
                  Senior Learner.
                </p>
              </div>
            ) : stageComplete && currentStage ? (
              /* End of a stage — the gate. */
              <div>
                <h2 className="text-base font-semibold sm:text-lg">
                  Stage {currentStage.stage_order} — ready to submit
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  You have answered every question in this stage. Submitting checks your work
                  against the pass mark of {currentStage.threshold_pct}%. You need to clear it
                  before the next stage opens.
                </p>

                {stageResult && !stageResult.passed ? (
                  <div
                    className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                    role="status"
                    aria-live="polite"
                  >
                    <p className="font-medium">
                      Not through yet — you scored{' '}
                      {stageResult.score_pct === null
                        ? 'no marked answers'
                        : `${stageResult.score_pct}%`}
                      , and this stage needs {stageResult.threshold_pct}%.
                    </p>
                    <p className="mt-1">
                      The next stage stays closed for now, because it describes findings that
                      would answer these questions for you. Work through this stage again —
                      your {bundle.attemptsCap - bundle.attemptsUsed === 1 ? 'last' : 'remaining'}{' '}
                      attempts at the whole case are not spent by retrying a stage.
                    </p>
                  </div>
                ) : null}

                {stageError ? (
                  <p className="mt-3 text-sm text-red-600" role="alert">
                    {stageError}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={submitStage}
                    disabled={stageSubmitting}
                    className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {stageSubmitting ? 'Checking…' : 'Submit this stage'}
                  </button>
                  <button
                    type="button"
                    onClick={retryStage}
                    disabled={stageSubmitting}
                    className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
                  >
                    {stageResult && !stageResult.passed
                      ? 'Try this stage again'
                      : 'Go back and change my answers'}
                  </button>
                </div>
              </div>
            ) : !question ? (
              <div role="alert">
                <h2 className="text-base font-semibold sm:text-lg">No questions in this stage</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  This stage has no questions yet. Please contact your Senior Learner.
                </p>
              </div>
            ) : (
              <>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {staged && currentStage ? `Stage ${currentStage.stage_order} · ` : ''}
                  Question {questionIndex + 1} of {activeQuestions.length}
                </div>

                {renderQuestion(question)}
              </>
            )}

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
              {activeQuestions.map((q, i) => {
                const answered = answers.some((a) => a.question_id === q.id);
                const isCurrent = i === questionIndex && !stageComplete;
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
