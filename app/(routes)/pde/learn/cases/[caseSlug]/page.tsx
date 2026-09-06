/**
 * /pde/learn/cases/[caseSlug] — Clinical case attempt page (student-facing).
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
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { CaseAttempt } from './_components/CaseAttempt';
import { OverdueClosedState } from './_components/OverdueClosedState';
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
// Attempt-cap resolution — two sources, the per-case number wins.
//
//   1. pde_assessments.max_attempts — the number the Senior Learner typed for
//      THIS case. Authoritative whenever it is a positive whole number.
//   2. platform policy clinical_reasoning.lifetime_attempts_per_case — the
//      fallback for cases that set no per-case number.
//   3. 5 — last-resort default (matches the platform_policies seed).
//
// Only (2) was read before, so a case capped at 3 still rendered "Attempt 1 of
// 5 · 5 attempts remaining" and offered a learner attempts the Senior Learner
// never granted. The resolved value is what flows into bundle.attemptsCap, so
// the counter, the remaining-attempts text and the cap-reached screen all agree.
// ──────────────────────────────────────────────────────────────────────────────
async function readPolicyAttemptsCap(supabase: any): Promise<number> {
  const { data, error } = await supabase.rpc('fn_get_policy_clinical_reasoning', {
    p_key: 'lifetime_attempts_per_case',
  });
  if (error || data === null || data === undefined) return 5;
  const n = typeof data === 'number' ? data : Number(data);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** null unless `value` is a positive whole number — 0, NULL and junk all fall back. */
function positiveIntOrNull(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
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
    redirect(`/auth/login?next=/pde/learn/cases/${caseSlug}`);
  }

  // ---- 1. Assessment ----
  // `caseSlug` is the assessment UUID per spec-vs-reality note above.
  const sb = supabase as any;
  const { data: assessment, error: aErr } = await sb
    .from('pde_assessments')
    .select('id, title, description, course_id, lesson_id, version, time_limit_minutes, max_attempts, status, assessment_type, visibility_mode')
    .eq('id', caseSlug)
    .eq('assessment_type', 'clinical_case')
    .maybeSingle();

  if (aErr || !assessment) {
    // The row is hidden from this learner. Tell apart "locked to a class you're
    // not in" from "doesn't exist" so we show a clear message, not a bare 404
    // (CLAUDE.md rule #27 — permission failures must be explicit, never silent).
    const svc = createServiceRoleClient();
    const { data: exists } = await svc
      .from('pde_assessments')
      .select('id, status, visibility_mode')
      .eq('id', caseSlug)
      .eq('assessment_type', 'clinical_case')
      .maybeSingle();
    if (exists && exists.status === 'published' && exists.visibility_mode === 'class_only') {
      return (
        <ContentLayout>
          <div className="mx-auto max-w-2xl py-12 px-4">
            <h1 className="text-xl font-semibold">This case isn&apos;t assigned to you</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your Senior Learner has limited this case to specific sections. If you think you
              should have access, ask them to assign it to your section.
            </p>
          </div>
        </ContentLayout>
      );
    }
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

  // ---- 3. Questions (server-projected: the answer key never leaves the DB) ----
  // The learner no longer holds SELECT on pde_assessment_questions (see the
  // pde_questions_read RLS policy). fn_pde_get_case_questions is a SECURITY
  // DEFINER RPC that gates on published+enrolled (or staff/creator) and returns
  // only the learner-safe projection: options with `is_correct` stripped,
  // metadata with ground_truth/key_concepts removed, and NO correct_answer or
  // expected_regions. This is the only learner path to a case's questions, so
  // the key is structurally unreachable from the browser — not merely absent
  // from this payload. Objective marking is server-side (fn_pde_mark_objective
  // for MCQ; /api/pde/clinical-reasoning/mark-image-tag for image_tag).
  const { data: qData } = await sb.rpc('fn_pde_get_case_questions', {
    p_assessment_id: assessment.id,
  });
  const questions: ClinicalQuestion[] = Array.isArray(qData)
    ? (qData as ClinicalQuestion[])
    : [];

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
  // Per-case number first; the policy RPC is only consulted when the case set none.
  const perCaseCap = positiveIntOrNull(assessment.max_attempts);
  const attemptsCap = perCaseCap ?? (await readPolicyAttemptsCap(supabase));

  const bestSubmission: ClinicalSubmissionSummary | null = prior.length
    ? prior.reduce<ClinicalSubmissionSummary | null>((best, cur) => {
        const s = cur.final_score ?? cur.auto_score ?? 0;
        const bs = best ? (best.final_score ?? best.auto_score ?? 0) : -1;
        return s > bs ? cur : best;
      }, null)
    : null;

  // ---- 5. Snapshot roll_number for audit + learner's section for the overdue gate ----
  // Lookup is best-effort — null is fine if the learner row doesn't exist yet.
  let rollNumberSnapshot: string | null = null;
  let learnerSectionId: string | null = null;
  {
    const { data: prof } = await sb
      .from('profiles')
      .select('learner_id')
      .eq('id', user.id)
      .maybeSingle();
    if (prof?.learner_id) {
      const { data: lp } = await sb
        .from('learners_profiles')
        .select('roll_number, section_id')
        .eq('id', prof.learner_id)
        .maybeSingle();
      rollNumberSnapshot = lp?.roll_number ?? null;
      learnerSectionId = lp?.section_id ?? null;
    }
  }

  // ---- 6. Overdue hard-block — LOCKED (class_only) cases only (Decision 3) ----
  // When a class_only case's assignment deadline for the learner's section has
  // passed, block a NEW attempt. Rationale + boundaries:
  //   • open cases are never blocked — an assigned learner must not be MORE
  //     restricted than any enrolled learner opening the same open case.
  //   • mid-attempt is untouched: no submission row exists until the learner
  //     finishes (see CaseAttempt.finalSubmit), and this guard only runs on page
  //     load — a learner already answering can still complete and submit.
  //   • completed work stays reviewable via the summary link below.
  // A learner in a non-assigned section never reaches here (the class_only case
  // is hidden by pde_assess_read → the "isn't assigned to you" branch above).
  let overdueLocked = false;
  if (assessment.visibility_mode === 'class_only' && learnerSectionId) {
    // Unique(assessment_id, section_id) ⇒ at most one row; RLS lets a learner
    // read their own section's assignment (pde_case_assign_read learner branch).
    const { data: asg } = await sb
      .from('pde_case_assignments')
      .select('due_at')
      .eq('assessment_id', assessment.id)
      .eq('section_id', learnerSectionId)
      .maybeSingle();
    if (asg?.due_at && new Date(asg.due_at).getTime() < Date.now()) {
      overdueLocked = true;
    }
  }

  if (overdueLocked) {
    return (
      <ContentLayout>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Learn', href: '/learn/quests' },
            { label: 'Clinical Cases', href: '/pde/learn/cases' },
            { label: assessment.title },
          ]}
        />
        <OverdueClosedState
          caseTitle={assessment.title}
          caseSlug={assessment.id}
          bestSubmission={bestSubmission}
        />
      </ContentLayout>
    );
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
          { label: 'Clinical Cases', href: '/pde/learn/cases' },
          { label: assessment.title },
        ]}
      />
      <CaseAttempt bundle={bundle} rollNumberSnapshot={rollNumberSnapshot} />
    </ContentLayout>
  );
}
