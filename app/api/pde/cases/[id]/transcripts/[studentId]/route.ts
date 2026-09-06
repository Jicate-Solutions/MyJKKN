// app/api/pde/cases/[id]/transcripts/[studentId]/route.ts
// Per-student transcript drill for a clinical case.
//
// GET /api/pde/cases/[id]/transcripts/[studentId]  → ClinicalCaseSubmissionTranscript[]

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type {
  ClinicalCaseSubmissionTranscript,
  ClinicalQuestionType,
  OSCEDomain,
} from '@/types/pde';
import { toAnswersArray } from '@/lib/pde/answers-shape';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; studentId: string }> }
) {
  await connection();
  try {
    const { id: caseId, studentId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify case + scope
    const { data: caseRow } = await (supabase as any)
      .from('pde_assessments')
      .select('id, title, vac_courses(institution_id)')
      .eq('id', caseId)
      .eq('assessment_type', 'clinical_case')
      .single();
    if (!caseRow) return NextResponse.json({ error: 'Case not found' }, { status: 404 });

    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('institution_id, role')
      .eq('id', user.id)
      .single();
    const isSuper = profile?.role === 'super_admin' || profile?.role === 'platform_admin';
    const caseInstitution = (caseRow as any).vac_courses?.institution_id;
    if (!isSuper && profile?.institution_id && caseInstitution && profile.institution_id !== caseInstitution) {
      return NextResponse.json({ error: 'Forbidden — institution scope mismatch' }, { status: 403 });
    }

    // Learner. learners_profiles stores first_name/last_name — there is no
    // full_name column, and selecting one made PostgREST reject the whole query
    // (42703), which is why this route returned 500 on every call.
    const { data: learner } = await (supabase as any)
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .eq('id', studentId)
      .single();

    const learnerName =
      [learner?.first_name, learner?.last_name].filter(Boolean).join(' ').trim() || 'Unknown';

    // All submissions for this case + learner.
    // NOTE: `metadata` was selected here but does not exist on pde_submissions
    // (the second half of the 42703) — and was never read below. Per-domain
    // scores are derived from answers[].domain_score further down.
    const { data: subs, error: sErr } = await (supabase as any)
      .from('pde_submissions')
      .select('id, attempt_number, started_at, completed_at, auto_score, final_score, passed, answers, assessment_version')
      .eq('assessment_id', caseId)
      .eq('learner_id', studentId)
      .order('attempt_number', { ascending: true });
    if (sErr) throw sErr;

    // Questions (snapshot — current case version). For prior-version submissions we still
    // map by question_id, but text/order_index may have drifted; the frontend should note this.
    const { data: questions } = await (supabase as any)
      .from('pde_assessment_questions')
      .select('id, question_text, question_type, order_index, metadata')
      .eq('assessment_id', caseId)
      .order('order_index', { ascending: true });

    const qById = new Map<string, any>((questions || []).map((q: any) => [q.id, q]));

    const transcripts: ClinicalCaseSubmissionTranscript[] = (subs || []).map((s: any) => {
      const answers = toAnswersArray(s.answers);
      const perDomain: Record<string, { sum: number; count: number }> = {};
      const mappedAnswers = answers.map((a: any) => {
        const q = qById.get(a.question_id);
        const domain = (q?.metadata?.osce_domain as OSCEDomain) || 'data_gathering';
        const domainScore = typeof a.domain_score === 'number' ? a.domain_score : null;
        if (domainScore !== null) {
          perDomain[domain] = perDomain[domain] || { sum: 0, count: 0 };
          perDomain[domain].sum += domainScore;
          perDomain[domain].count += 1;
        }
        return {
          question_id: a.question_id,
          question_text: q?.question_text || '(question removed in newer version)',
          question_type: (q?.question_type as ClinicalQuestionType) || 'free_text_socratic',
          question_order: q?.order_index ?? 0,
          osce_domain: domain,
          learner_answer: a.selected_answer || a.text_answer || a.answer || '',
          ai_feedback: a.ai_feedback || null,
          domain_score: domainScore,
        };
      });
      const perDomainScores = Object.fromEntries(
        Object.entries(perDomain).map(([k, v]) => [k, v.sum / v.count])
      ) as Record<OSCEDomain, number>;
      return {
        submission_id: s.id,
        learner_id: studentId,
        learner_name: learnerName,
        learner_roll_number: learner?.roll_number,
        attempt_number: s.attempt_number,
        started_at: s.started_at,
        completed_at: s.completed_at,
        auto_score: s.auto_score,
        final_score: s.final_score,
        passed: s.passed,
        assessment_version: s.assessment_version || 1,
        answers: mappedAnswers,
        per_domain_scores: perDomainScores,
      };
    });

    return NextResponse.json({ data: transcripts });
  } catch (e: any) {
    console.error('GET /api/pde/cases/[id]/transcripts/[studentId] error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
