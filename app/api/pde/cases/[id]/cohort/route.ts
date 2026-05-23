// app/api/pde/cases/[id]/cohort/route.ts
// Faculty cohort-level analytics for a clinical case.
//
// GET /api/pde/cases/[id]/cohort  → ClinicalCaseCohortStats

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { OSCEDomain } from '@/types/pde';

const DOMAINS: OSCEDomain[] = [
  'data_gathering',
  'hypothesis_generation',
  'management_planning',
  'patient_communication',
  'professionalism',
];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id: caseId } = await context.params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Case + scope check
    const { data: caseRow } = await (supabase as any)
      .from('pde_assessments')
      .select('id, title, course_id, pass_threshold, vac_courses(institution_id)')
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

    // Fetch all submissions for this assessment
    const { data: submissions, error: sErr } = await (supabase as any)
      .from('pde_submissions')
      .select('id, learner_id, attempt_number, final_score, auto_score, passed, completed_at, started_at')
      .eq('assessment_id', caseId);
    if (sErr) throw sErr;

    const rows = submissions || [];
    const totalAttempts = rows.length;
    const learners = new Set(rows.map((r: any) => r.learner_id));

    let scoreSum = 0;
    let scoreCount = 0;
    let passCount = 0;
    let passDenom = 0;
    const dist: Record<number, number> = {};

    rows.forEach((r: any) => {
      const score = r.final_score ?? r.auto_score;
      if (typeof score === 'number') {
        scoreSum += score;
        scoreCount += 1;
      }
      if (r.passed !== null) {
        passDenom += 1;
        if (r.passed) passCount += 1;
      }
      dist[r.attempt_number] = (dist[r.attempt_number] || 0) + 1;
    });

    // Per-student aggregation
    const learnerIds = Array.from(learners) as string[];
    let learnerProfiles: any[] = [];
    if (learnerIds.length) {
      const { data: lp } = await (supabase as any)
        .from('learners_profiles')
        .select('id, full_name, roll_number')
        .in('id', learnerIds);
      learnerProfiles = lp || [];
    }
    const lpById = new Map(learnerProfiles.map((p) => [p.id, p]));

    // Count grants per learner (from dedicated table; fall back to engagement events)
    let grantsCount: Record<string, number> = {};
    if (learnerIds.length) {
      const { data: gRows, error: gErr } = await (supabase as any)
        .from('pde_attempt_grants')
        .select('learner_id, attempts_granted')
        .eq('case_id', caseId)
        .in('learner_id', learnerIds);

      if (!gErr && gRows) {
        grantsCount = (gRows as any[]).reduce((acc, g) => {
          acc[g.learner_id] = (acc[g.learner_id] || 0) + (g.attempts_granted || 0);
          return acc;
        }, {} as Record<string, number>);
      } else {
        const { data: evRows } = await (supabase as any)
          .from('pde_engagement_events')
          .select('learner_id, metadata')
          .eq('event_type', 'attempt_grant')
          .in('learner_id', learnerIds);
        grantsCount = (evRows || []).reduce((acc: Record<string, number>, ev: any) => {
          if (ev.metadata?.case_id === caseId) {
            acc[ev.learner_id] = (acc[ev.learner_id] || 0) + (ev.metadata?.attempts_granted || 0);
          }
          return acc;
        }, {});
      }
    }

    const perLearner = new Map<string, {
      learner_id: string;
      learner_name: string;
      roll_number?: string;
      attempts_used: number;
      best_score: number | null;
      passed: boolean | null;
      last_attempt_at: string | null;
      granted_extra: number;
    }>();

    rows.forEach((r: any) => {
      const lpRow = lpById.get(r.learner_id);
      const cur = perLearner.get(r.learner_id) || {
        learner_id: r.learner_id,
        learner_name: lpRow?.full_name || 'Unknown',
        roll_number: lpRow?.roll_number,
        attempts_used: 0,
        best_score: null,
        passed: null,
        last_attempt_at: null,
        granted_extra: grantsCount[r.learner_id] || 0,
      };
      cur.attempts_used += 1;
      const score = r.final_score ?? r.auto_score;
      if (typeof score === 'number' && (cur.best_score === null || score > cur.best_score)) {
        cur.best_score = score;
      }
      if (r.passed) cur.passed = true;
      const ts = r.completed_at || r.started_at;
      if (ts && (!cur.last_attempt_at || ts > cur.last_attempt_at)) {
        cur.last_attempt_at = ts;
      }
      perLearner.set(r.learner_id, cur);
    });

    // Per-domain average (rough — pulls from pde_submissions.metadata.per_domain_scores if present)
    const domainTotals: Record<OSCEDomain, { sum: number; count: number }> = {} as any;
    DOMAINS.forEach((d) => (domainTotals[d] = { sum: 0, count: 0 }));

    // Optional: pull metadata for domain scores if column populated
    if (rows.length) {
      const { data: meta } = await (supabase as any)
        .from('pde_submissions')
        .select('id, metadata')
        .eq('assessment_id', caseId);
      (meta || []).forEach((m: any) => {
        const pd = m.metadata?.per_domain_scores;
        if (pd && typeof pd === 'object') {
          DOMAINS.forEach((d) => {
            if (typeof pd[d] === 'number') {
              domainTotals[d].sum += pd[d];
              domainTotals[d].count += 1;
            }
          });
        }
      });
    }

    const perDomainAverage: Record<OSCEDomain, number> = {} as any;
    let hasDomain = false;
    DOMAINS.forEach((d) => {
      if (domainTotals[d].count > 0) {
        perDomainAverage[d] = domainTotals[d].sum / domainTotals[d].count;
        hasDomain = true;
      } else {
        perDomainAverage[d] = 0;
      }
    });

    const cohort = {
      case_id: caseId,
      case_title: caseRow.title,
      total_attempts: totalAttempts,
      unique_learners: learners.size,
      average_score: scoreCount > 0 ? scoreSum / scoreCount : null,
      pass_rate: passDenom > 0 ? (passCount / passDenom) * 100 : null,
      attempt_distribution: Object.entries(dist)
        .map(([n, c]) => ({ attempt_number: Number(n), count: c as number }))
        .sort((a, b) => a.attempt_number - b.attempt_number),
      per_domain_average: hasDomain ? perDomainAverage : undefined,
      students: Array.from(perLearner.values()).sort((a, b) =>
        (a.learner_name || '').localeCompare(b.learner_name || '')
      ),
    };

    return NextResponse.json({ data: cohort });
  } catch (e: any) {
    console.error('GET /api/pde/cases/[id]/cohort error:', e);
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 });
  }
}
