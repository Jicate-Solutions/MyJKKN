/**
 * /pde/learn/cases/[caseSlug]/summary/[attemptId] — Post-case review.
 *
 * Server component. Loads the single pde_submissions row + the original
 * questions + (when Agent E lands) the OSCE domain scores from
 * evidence_urls / metadata. Renders all answers + AI feedback for review.
 *
 * AICBL → PDE Clinical Reasoning sprint, Agent C (commit h).
 */

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import type {
  ClinicalAnswerEnvelope,
  ClinicalQuestion,
} from '@/types/pde-clinical-reasoning';
import type { FinalizeAttemptDomainScore } from '@/hooks/pde/use-clinical-reasoning';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Case Summary',
  description: 'Review your clinical-case attempt.',
};

interface SummaryPageProps {
  params: Promise<{ caseSlug: string; attemptId: string }>;
}

function prettify(d: string): string {
  return d.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function SummaryPage({ params }: SummaryPageProps) {
  const { caseSlug, attemptId } = await params;
  const supabase = await createClient();
  const sb = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/auth/login?next=/pde/learn/cases/${caseSlug}/summary/${attemptId}`);
  }

  const { data: submission, error } = await sb
    .from('pde_submissions')
    .select(
      'id, assessment_id, learner_id, attempt_number, started_at, completed_at, answers, evidence_urls, auto_score, final_score, passed, time_spent_seconds, assessment_version'
    )
    .eq('id', attemptId)
    .maybeSingle();

  if (error || !submission) notFound();
  if (submission.learner_id !== user.id) {
    // RLS should already prevent this, but be loud rather than silent.
    notFound();
  }
  if (submission.assessment_id !== caseSlug) {
    notFound();
  }

  const { data: assessment } = await sb
    .from('pde_assessments')
    .select('id, title, description')
    .eq('id', submission.assessment_id)
    .maybeSingle();

  // Post-attempt review renders the model answers / correct options, so it needs
  // the answer key. The learner no longer holds SELECT on pde_assessment_questions
  // (see the pde_questions_read RLS tighten); the key comes from the SECURITY
  // DEFINER review RPC, which returns the full question rows ONLY to a learner
  // with a completed submission for this case (ownership already checked above),
  // or to staff/creator. This closes the direct-table read while preserving the
  // legitimate post-attempt review.
  const { data: qData } = await sb.rpc('fn_pde_get_answer_key_for_review', {
    p_assessment_id: submission.assessment_id,
  });
  const questions: ClinicalQuestion[] = Array.isArray(qData)
    ? (qData as ClinicalQuestion[])
    : [];

  // Answers shape varies — pre-scoring it's ClinicalAnswerEnvelope[],
  // post-scoring (Agent E's /score write-back) it's wrapped as
  // { items: ClinicalAnswerEnvelope[], osce_score: OsceScore }.
  const rawAnswers = submission.answers;
  const answers: ClinicalAnswerEnvelope[] = Array.isArray(rawAnswers)
    ? (rawAnswers as ClinicalAnswerEnvelope[])
    : Array.isArray((rawAnswers as { items?: unknown })?.items)
      ? ((rawAnswers as { items: ClinicalAnswerEnvelope[] }).items)
      : [];

  const osceScore = !Array.isArray(rawAnswers) && rawAnswers && typeof rawAnswers === 'object'
    ? (rawAnswers as { osce_score?: { percentage?: number; domain_scores?: FinalizeAttemptDomainScore[] } }).osce_score
    : undefined;

  // The detailed OSCE rubric score is the score that counts: it is what feeds
  // the learner's skill record, and it is the one that survives in
  // answers.osce_score even when the write-back of final_score to
  // pde_submissions does not land. final_score was tried FIRST here, so an
  // attempt whose write-back was a no-op showed the naive client-side value
  // (100% for an attempt that answered 2 of 7 questions) instead of the real 36%.
  // final_score / auto_score stay the fallback for attempts with no rubric score,
  // and this ordering is safe once the write-back is fixed — both then agree.
  const rubricScore =
    typeof osceScore?.percentage === 'number' && Number.isFinite(osceScore.percentage)
      ? osceScore.percentage
      : null;
  const score = rubricScore ?? submission.final_score ?? submission.auto_score ?? null;

  // Coverage signal: the score tile on its own gave no hint that most of the
  // case was skipped. Counted exactly the way the per-question "No answer
  // recorded" note below is decided, so the tile and the list always agree.
  const totalQuestions = questions.length;
  const answeredCount = questions.filter((q) =>
    answers.some((a) => a.question_id === q.id)
  ).length;

  const minutes = Math.round((submission.time_spent_seconds ?? 0) / 60);

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Clinical Cases', href: '/pde/learn/cases' },
          { label: assessment?.title ?? 'Case', href: `/pde/learn/cases/${caseSlug}` },
          { label: `Attempt #${submission.attempt_number}` },
        ]}
      />

      <div className="mx-auto mt-4 max-w-4xl px-4 sm:px-6">
        <header className="rounded-lg border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold sm:text-2xl">
                {assessment?.title ?? 'Case'} — Attempt #{submission.attempt_number}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Completed{' '}
                {submission.completed_at
                  ? new Date(submission.completed_at).toLocaleString()
                  : 'in progress'}{' '}
                · {minutes} min
              </p>
            </div>
            {score !== null ? (
              <div className="rounded-md bg-muted px-4 py-3 text-center">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Score</div>
                <div className="text-2xl font-semibold">{Math.round(Number(score))}%</div>
              </div>
            ) : null}
          </div>

          {totalQuestions > 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Answered{' '}
              <strong className="font-medium text-foreground">
                {answeredCount} of {totalQuestions}
              </strong>{' '}
              questions
              {answeredCount < totalQuestions ? ' — the rest were left blank.' : '.'}
            </p>
          ) : null}

          {osceScore?.domain_scores && osceScore.domain_scores.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {osceScore.domain_scores.map((d) => {
                const pct = d.max_score > 0 ? (d.score / d.max_score) * 100 : 0;
                return (
                  <div key={d.domain_key} className="rounded-md bg-background px-3 py-2 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {prettify(d.domain_label || d.domain_key)}
                    </div>
                    <div className="text-base font-semibold">{Math.round(pct)}%</div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </header>

        <section className="mt-6 space-y-4">
          {questions.map((q, idx) => {
            const ans = answers.find((a) => a.question_id === q.id);
            return (
              <article key={q.id} className="rounded-lg border bg-card p-4 sm:p-6">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Question {idx + 1} · {q.metadata?.osce_domain?.replace(/_/g, ' ') ?? '—'}
                </div>
                <h2 className="mt-1 text-base font-semibold sm:text-lg">{q.question_text}</h2>

                {ans?.question_type === 'free_text_socratic' ? (
                  <>
                    <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm">
                      <div className="text-xs font-medium text-muted-foreground">Your answer</div>
                      <div className="mt-1 whitespace-pre-wrap">{ans.answer_text}</div>
                    </div>
                    {ans.coach_feedback ? (
                      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                        <div className="text-xs font-semibold">Coach</div>
                        <div className="mt-1 whitespace-pre-wrap">{ans.coach_feedback}</div>
                      </div>
                    ) : null}
                    {q.metadata?.ground_truth ? (
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                          Show model answer
                        </summary>
                        <div className="mt-2 rounded-md border border-dashed px-3 py-2 text-muted-foreground">
                          {q.metadata.ground_truth}
                        </div>
                      </details>
                    ) : null}
                  </>
                ) : null}

                {ans?.question_type === 'mcq_warmup' ? (
                  <div className="mt-3 text-sm">
                    {(q.options ?? []).map((o) => {
                      const isLearner = ans.selected_option_id === o.id;
                      const isCorrect = q.correct_answer
                        ? o.id === q.correct_answer
                        : !!o.is_correct;
                      const tone = isCorrect
                        ? 'border-emerald-300 bg-emerald-50'
                        : isLearner
                          ? 'border-red-300 bg-red-50'
                          : '';
                      return (
                        <div
                          key={o.id}
                          className={`mb-1.5 rounded-md border px-3 py-1.5 ${tone}`}
                        >
                          {o.text}
                          {isLearner ? <span className="ml-2 text-xs font-medium">(your pick)</span> : null}
                          {isCorrect ? (
                            <span className="ml-2 text-xs font-medium text-emerald-700">(correct)</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {ans?.question_type === 'image_tag' ? (
                  <div className="mt-3 text-sm">
                    Region score:{' '}
                    <strong>{Math.round(Number(ans.region_score ?? 0))}%</strong>
                    {ans.click_point ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (clicked at {Math.round(ans.click_point.x)},{' '}
                        {Math.round(ans.click_point.y)})
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {!ans ? (
                  <p className="mt-3 text-sm italic text-muted-foreground">
                    No answer recorded for this question.
                  </p>
                ) : null}
              </article>
            );
          })}
        </section>

        <footer className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/pde/learn/cases/${caseSlug}`}
            className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Try another attempt
          </Link>
          <Link
            href="/pde/learn/cases"
            className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Back to clinical cases
          </Link>
        </footer>
      </div>
    </ContentLayout>
  );
}
