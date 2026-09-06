'use client';

// =============================================================================
// RCLTP take-assessment flow (Phase 4b) — the marquee student experience
// =============================================================================
// One sitting, three parts on a single focused page:
//   1. READ      — the approved passage (rcltp_passages.body)
//   2. RECORD    — Part A voice (optional; graceful no-mic — see voice-recorder)
//   3. ANSWER    — Part B comprehension questions (last-wins upsert)
//   → SUBMIT     — moves the sitting to 'queued_for_scoring'
//
// STATE MACHINE (mirrors the Phase-3 route guards exactly):
//   - On open, if the sitting is startable (scheduled/not_attempted/in_progress)
//     we POST /start once (idempotent) so /responses + /submit are accepted —
//     those routes 409 on 'scheduled'. A 'recorded' sitting is NOT re-started.
//   - recording advances scheduled/in_progress → 'recorded' server-side.
//   - submit lands on 'queued_for_scoring' (there is no 'submitted' enum value).
//
// CONTENT-SAFETY: only status='approved' questions are ever fetched, and NO score
// or band is ever shown — the post-submit state is an honest "awaiting scoring".
// All student-affecting writes go through the live Phase-3 service-role routes;
// the learner identity is derived server-side from the session, never the client.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import {
  BookOpen,
  Mic,
  ListChecks,
  Send,
  Loader2,
  CheckCircle2,
  Clock,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useRcltpAssessment,
  useRcltpResponses,
} from '@/hooks/rcltp/use-rcltp-assessments';
import { useRcltpPassage, useRcltpQuestionsForTake } from '@/hooks/rcltp/use-rcltp-passages';
import { RcltpAssessmentsService } from '@/lib/services/rcltp/assessments-service';
import type { RcltpAssessmentStatus } from '@/types/rcltp';
import { VoiceRecorder } from './voice-recorder';
import { PartBAnswers } from './part-b-answers';

const OPEN_STATUSES: RcltpAssessmentStatus[] = [
  'scheduled',
  'not_attempted',
  'in_progress',
  'recorded',
];
const STARTABLE: RcltpAssessmentStatus[] = ['scheduled', 'not_attempted', 'in_progress'];

function SectionHeader({
  step,
  icon: Icon,
  title,
  hint,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  hint?: string;
}) {
  return (
    <div className='flex items-start gap-3'>
      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary'>
        {step}
      </div>
      <div>
        <h2 className='flex items-center gap-2 text-lg font-semibold'>
          <Icon className='h-5 w-5' aria-hidden='true' /> {title}
        </h2>
        {hint && <p className='text-sm text-muted-foreground'>{hint}</p>}
      </div>
    </div>
  );
}

export function TakeFlow({ assessmentId }: { assessmentId: string }) {
  const assessmentQuery = useRcltpAssessment(assessmentId);
  const assessment = assessmentQuery.data;
  const passageId = assessment?.passage_id ?? '';

  const passageQuery = useRcltpPassage(passageId);
  // Learner-safe read: answer key (correct_answer + ai_meta) is never fetched to
  // the browser. RLS blocks the base-table select for learners; this uses the
  // SECURITY DEFINER RPC that returns only answerable columns.
  const questionsQuery = useRcltpQuestionsForTake(passageId);
  const responsesQuery = useRcltpResponses(
    assessmentId ? { assessment_id: assessmentId } : {}
  );

  // Local status mirrors the server lifecycle; mutations update it optimistically
  // so the UI doesn't depend on a refetch race after start/record/submit.
  const [status, setStatus] = useState<RcltpAssessmentStatus | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const startedRef = useRef(false);
  const prefilledRef = useRef(false);

  // Initialise local status from the loaded assessment (once).
  useEffect(() => {
    if (assessment && status === null) setStatus(assessment.status);
  }, [assessment, status]);

  // Prefill answers from any previously-saved responses (Continue support).
  useEffect(() => {
    if (prefilledRef.current) return;
    const rows = responsesQuery.data?.data;
    if (!rows) return;
    prefilledRef.current = true;
    if (rows.length > 0) {
      const seed: Record<string, string> = {};
      for (const r of rows) seed[r.question_id] = r.response ?? '';
      setAnswers((prev) => ({ ...seed, ...prev }));
    }
  }, [responsesQuery.data]);

  // Start the sitting once on open so /responses + /submit are accepted.
  useEffect(() => {
    if (startedRef.current) return;
    if (!assessment || status === null) return;
    if (!STARTABLE.includes(status)) return;
    if (status === 'in_progress') {
      startedRef.current = true; // already open — nothing to do
      return;
    }
    startedRef.current = true;
    setStarting(true);
    RcltpAssessmentsService.startAssessment(assessmentId)
      .then((updated) => setStatus(updated.status))
      .catch((e) => {
        // Non-fatal: a recorded/closed sitting or an ownership issue. Keep the
        // page usable; the write routes will surface a precise error if needed.
        const msg = e instanceof Error ? e.message : 'Could not open this assessment.';
        toast.error(msg);
      })
      .finally(() => setStarting(false));
  }, [assessment, status, assessmentId]);

  // Gate on passageId: useRcltpQuestions has no `enabled` flag, so an empty
  // passage filter would fetch unrelated tenant questions — never render those.
  const questions = passageId ? (questionsQuery.data?.data ?? []) : [];
  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length,
    [questions, answers]
  );

  function setAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  /** Build the responses payload from currently-answered questions. */
  function answeredPayload() {
    return questions
      .filter((q) => (answers[q.id] ?? '').trim().length > 0)
      .map((q) => ({ question_id: q.id, response: (answers[q.id] ?? '').trim() }));
  }

  async function saveProgress() {
    const payload = answeredPayload();
    if (payload.length === 0) {
      toast('Nothing to save yet — answer a question first.', { icon: '✏️' });
      return;
    }
    setSaving(true);
    try {
      await RcltpAssessmentsService.recordResponses(assessmentId, payload);
      toast.success('Answers saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save answers.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const payload = answeredPayload();
      if (payload.length > 0) {
        await RcltpAssessmentsService.recordResponses(assessmentId, payload);
      }
      const updated = await RcltpAssessmentsService.submitAssessment(assessmentId);
      setStatus(updated.status);
      setConfirmOpen(false);
      toast.success('Assessment submitted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Loading / error / not-found
  // -------------------------------------------------------------------------

  if (assessmentQuery.isLoading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-40 w-full' />
        <Skeleton className='h-40 w-full' />
      </div>
    );
  }

  if (assessmentQuery.isError || !assessment) {
    return (
      <Alert>
        <AlertTriangle className='h-4 w-4' aria-hidden='true' />
        <AlertTitle>We couldn&apos;t open this assessment</AlertTitle>
        <AlertDescription className='space-y-3'>
          <p>
            It may not exist, or it may not be assigned to you. Please go back and pick an
            assessment from your list.
          </p>
          <Button asChild variant='outline' size='sm'>
            <Link href='/rcltp/student'>
              <ArrowLeft className='mr-2 h-4 w-4' /> Back to My Reading
            </Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const effectiveStatus = status ?? assessment.status;
  const isOpen = OPEN_STATUSES.includes(effectiveStatus);

  const typeLabel =
    assessment.assessment_type === 'cycle'
      ? `Cycle ${assessment.cycle_no ?? ''} assessment`
      : assessment.assessment_type === 'baseline'
        ? 'Baseline assessment'
        : 'Practice assessment';

  // -------------------------------------------------------------------------
  // Terminal / submitted — honest "awaiting scoring" (NEVER a fabricated score)
  // -------------------------------------------------------------------------

  if (!isOpen) {
    return (
      <div className='space-y-5'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <h1 className='text-xl font-semibold'>{typeLabel}</h1>
          <Button asChild variant='outline' size='sm' className='shrink-0 self-start sm:self-auto'>
            <Link href='/rcltp/student'>
              <ArrowLeft className='mr-2 h-4 w-4' /> My Reading
            </Link>
          </Button>
        </div>
        <Alert>
          <Clock className='h-4 w-4' aria-hidden='true' />
          <AlertTitle>Submitted — awaiting scoring</AlertTitle>
          <AlertDescription>
            Your assessment has been submitted and is queued for scoring. Your reading band and
            detailed report will appear once scoring is enabled — we only ever show validated
            results, never an estimated or placeholder score.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Open sitting — read → record → answer → submit
  // -------------------------------------------------------------------------

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <h1 className='text-xl font-semibold'>{typeLabel}</h1>
          {starting ? (
            <Badge variant='outline' className='gap-1'>
              <Loader2 className='h-3 w-3 animate-spin' /> Opening…
            </Badge>
          ) : (
            <Badge variant={effectiveStatus === 'recorded' ? 'secondary' : 'default'}>
              {effectiveStatus === 'recorded' ? 'Recorded' : 'In progress'}
            </Badge>
          )}
        </div>
        <Button asChild variant='ghost' size='sm'>
          <Link href='/rcltp/student'>
            <ArrowLeft className='mr-2 h-4 w-4' /> My Reading
          </Link>
        </Button>
      </div>

      {/* 1. READ */}
      <section className='space-y-3'>
        <SectionHeader step={1} icon={BookOpen} title='Read the passage' hint='Read it aloud, clearly.' />
        {passageQuery.isLoading ? (
          <Skeleton className='h-40 w-full' />
        ) : passageQuery.isError || !passageQuery.data ? (
          <Alert>
            <AlertTriangle className='h-4 w-4' aria-hidden='true' />
            <AlertDescription>
              The reading passage for this assessment couldn&apos;t be loaded. You can still answer
              any questions below, or come back later.
            </AlertDescription>
          </Alert>
        ) : (
          <article className='rounded-lg border bg-card p-5'>
            <h3 className='mb-2 text-base font-semibold'>{passageQuery.data.title}</h3>
            <div className='whitespace-pre-wrap text-[15px] leading-7 text-foreground'>
              {passageQuery.data.body}
            </div>
          </article>
        )}
      </section>

      <Separator />

      {/* 2. RECORD (Part A) */}
      <section className='space-y-3'>
        <SectionHeader
          step={2}
          icon={Mic}
          title='Record your reading'
          hint='Optional — tap record, read aloud, then save.'
        />
        <VoiceRecorder
          assessmentId={assessmentId}
          disabled={submitting}
          onRecorded={() => setStatus('recorded')}
        />
      </section>

      <Separator />

      {/* 3. ANSWER (Part B) */}
      <section className='space-y-3'>
        <SectionHeader
          step={3}
          icon={ListChecks}
          title='Answer the questions'
          hint={
            questions.length > 0
              ? `${answeredCount} of ${questions.length} answered`
              : undefined
          }
        />
        {questionsQuery.isLoading ? (
          <Skeleton className='h-40 w-full' />
        ) : (
          <PartBAnswers
            questions={questions}
            answers={answers}
            onChange={setAnswer}
            disabled={submitting}
          />
        )}
      </section>

      {/* Actions */}
      <div className='sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur'>
        {questions.length > 0 && (
          <Button
            variant='outline'
            onClick={saveProgress}
            disabled={saving || submitting || starting}
          >
            {saving ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
            Save progress
          </Button>
        )}
        <Button onClick={() => setConfirmOpen(true)} disabled={submitting || starting}>
          <Send className='mr-2 h-4 w-4' /> Submit assessment
        </Button>
      </div>

      {/* Submit confirmation */}
      <Dialog open={confirmOpen} onOpenChange={(v) => !submitting && setConfirmOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit this assessment?</DialogTitle>
            <DialogDescription>
              Once you submit, you can&apos;t change your recording or answers. It will be queued for
              scoring.
            </DialogDescription>
          </DialogHeader>
          {questions.length > 0 && answeredCount < questions.length && (
            <Alert>
              <AlertTriangle className='h-4 w-4' aria-hidden='true' />
              <AlertDescription>
                You&apos;ve answered {answeredCount} of {questions.length} questions. You can still
                submit, but unanswered questions can&apos;t be changed afterwards.
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Keep working
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <CheckCircle2 className='mr-2 h-4 w-4' />
              )}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
