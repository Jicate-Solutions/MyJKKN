/**
 * /learn/pde/cases/[caseSlug] — Clinical case attempt page (student-facing).
 *
 * Server component. Loads the case bundle (assessment + lesson scenario +
 * questions + learner's attempt history), enforces the lifetime attempt cap,
 * and renders the client-side <CaseAttempt> orchestrator.
 *
 * Spec deviation: pde_assessments has no `slug` column on prod (verified
 * 2026-05-23 via information_schema). We accept the assessment.id (UUID)
 * as the [caseSlug] route segment, since assessment titles are not URL-safe.
 * Future-compatible if/when a slug column lands.
 *
 * AICBL → PDE Clinical Reasoning sprint, Agent C (commit b).
 */

import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { CaseAttempt } from './_components/CaseAttempt';
import type {
  ClinicalCaseBundle,
  ClinicalCaseScenario,
  ClinicalQuestion,
  ClinicalSubmissionSummary,
} from '@/types/pde-clinical-reasoning';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Clinical Case',
  description: 'Work through a clinical case with AI Socratic coaching.',
};

// ──────────────────────────────────────────────────────────────────────────────
// Policy reader — pulls lifetime_attempts_per_case via the RPC.
// Defaults to 5 if RPC unavailable (matches platform_policies seed).
// ──────────────────────────────────────────────────────────────────────────────
async function readAttemptsCap(supabase: any): Promise<number> {
  const { data, error } = await supabase.rpc('fn_get_policy_clinical_reasoning', {
    p_key: 'lifetime_attempts_per_case',
  });
  if (error || data === null || data === undefined) return 5;
  const n = typeof data === 'number' ? data : Number(data);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

interface CasePageProps {
  params: Promise<{ caseSlug: string }>;
}

export default async function CaseAttemptPage({ params }: CasePageProps) {
  const { caseSlug } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=/learn/pde/cases/${caseSlug}`);
  }

  // ---- 1. Assessment ----
  // `caseSlug` is the assessment UUID per spec-vs-reality note above.
  const sb = supabase as any;
  const { data: assessment, error: aErr } = await sb
    .from('pde_assessments')
    .select('id, title, description, course_id, lesson_id, version, time_limit_minutes, status, assessment_type')
    .eq('id', caseSlug)
    .eq('assessment_type', 'clinical_case')
    .maybeSingle();

  if (aErr || !assessment) {
    notFound();
  }
  if (assessment.status !== 'published') {
    return (
      <ContentLayout>
        <div className="mx-auto max-w-2xl py-12 px-4">
          <h1 className="text-xl font-semibold">This case is not yet available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The case is currently in <strong>{assessment.status}</strong> status. Please check back
            when your faculty publishes it.
          </p>
        </div>
      </ContentLayout>
    );
  }

  // ---- 2. Patient scenario from the linked vac_lessons row ----
  let scenario: ClinicalCaseScenario | null = null;
  if (assessment.lesson_id) {
    const { data: lesson } = await sb
      .from('vac_lessons')
      .select('case_scenario')
      .eq('id', assessment.lesson_id)
      .maybeSingle();
    scenario = (lesson?.case_scenario ?? null) as ClinicalCaseScenario | null;
  }
  if (!scenario) {
    return (
      <ContentLayout>
        <div className="mx-auto max-w-2xl py-12 px-4">
          <h1 className="text-xl font-semibold">Case scenario missing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This case is missing its patient scenario. Please contact your faculty.
          </p>
        </div>
      </ContentLayout>
    );
  }

  // ---- 3. Questions ----
  const { data: qRows } = await sb
    .from('pde_assessment_questions')
    .select(
      'id, assessment_id, question_type, question_text, question_media_url, options, correct_answer, order_index, metadata, expected_regions'
    )
    .eq('assessment_id', assessment.id)
    .order('order_index', { ascending: true });

  const questions: ClinicalQuestion[] = (qRows ?? []).filter(
    (q: any) => ['free_text_socratic', 'mcq_warmup', 'image_tag'].includes(q.question_type)
  );

  if (questions.length === 0) {
    return (
      <ContentLayout>
        <div className="mx-auto max-w-2xl py-12 px-4">
          <h1 className="text-xl font-semibold">No questions in this case</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This case has no clinical-reasoning questions yet. Please contact your faculty.
          </p>
        </div>
      </ContentLayout>
    );
  }

  // ---- 4. Attempt history + cap ----
  const { data: priorRows } = await sb
    .from('pde_submissions')
    .select('id, attempt_number, completed_at, auto_score, final_score, passed')
    .eq('assessment_id', assessment.id)
    .eq('learner_id', user.id)
    .order('attempt_number', { ascending: false });

  const prior: ClinicalSubmissionSummary[] = priorRows ?? [];
  const attemptsUsed = prior.length;
  const attemptsCap = await readAttemptsCap(supabase);

  const bestSubmission: ClinicalSubmissionSummary | null = prior.length
    ? prior.reduce<ClinicalSubmissionSummary | null>((best, cur) => {
        const s = cur.final_score ?? cur.auto_score ?? 0;
        const bs = best ? (best.final_score ?? best.auto_score ?? 0) : -1;
        return s > bs ? cur : best;
      }, null)
    : null;

  // ---- 5. Snapshot roll_number for audit (decision 4) ----
  // Lookup is best-effort — null is fine if the learner row doesn't exist yet.
  let rollNumberSnapshot: string | null = null;
  {
    const { data: prof } = await sb
      .from('profiles')
      .select('learner_id')
      .eq('id', user.id)
      .maybeSingle();
    if (prof?.learner_id) {
      const { data: lp } = await sb
        .from('learners_profiles')
        .select('roll_number')
        .eq('id', prof.learner_id)
        .maybeSingle();
      rollNumberSnapshot = lp?.roll_number ?? null;
    }
  }

  const bundle: ClinicalCaseBundle = {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      description: assessment.description,
      course_id: assessment.course_id,
      lesson_id: assessment.lesson_id,
      version: assessment.version,
      time_limit_minutes: assessment.time_limit_minutes,
    },
    scenario,
    questions,
    attemptsUsed,
    attemptsCap,
    bestSubmission,
    capReached: attemptsUsed >= attemptsCap,
    learnerProfileId: user.id,
  };

  return (
    <ContentLayout>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Clinical Cases', href: '/learn/pde/cases' },
          { label: assessment.title },
        ]}
      />
      <CaseAttempt bundle={bundle} rollNumberSnapshot={rollNumberSnapshot} />
    </ContentLayout>
  );
}
