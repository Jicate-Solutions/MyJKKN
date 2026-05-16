/**
 * HR — Promotion Workflow Service (T5.2)
 *
 * Reads policy: hr.promotion_policy (platform_policies row, scope=institution,
 * seeded by PR #904 / migration 20260609_hr_governance_part2_seeds.sql).
 *
 * Per `reference_platform_policies_director_view_pattern.md` (canonical 3-layer
 * pattern): policy ROW → fn_get_policy reader → admin UI for editing. This
 * service is the CONSUMER of that policy at runtime.
 *
 * State machine:
 *   submitted → sedc_scored → director_decided → approved | rejected
 *   (applicant can withdraw at any non-terminal state)
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ----------------------------------------------------------------------------
// Policy shape (hr.promotion_policy JSONB)
// ----------------------------------------------------------------------------
export interface PromotionPolicy {
  max_merit_points: number;                  // default 50
  merit_score_formula: string;               // default 'appraisal_score / 10'
  sedc_score_normalization_allowed: boolean; // default true
  delay_lookback_years: number;              // default 5
  api_score_required: boolean;
  seniority_tiebreaker: boolean;
  is_reward_incentive_growth: boolean;
  qualification_points_max: number;          // default 10
  qualification_point_scale: {
    masters_completed: number;               // 4
    graduation_pg_diploma_min_1yr: number;   // 3
    diploma_iti_min_1yr: number;             // 2
    training_per_5_days: number;             // 1
    book_publication: number;                // 2
    article_publication: number;             // 1
  };
}

const POLICY_DEFAULTS: PromotionPolicy = {
  max_merit_points: 50,
  merit_score_formula: 'appraisal_score / 10',
  sedc_score_normalization_allowed: true,
  delay_lookback_years: 5,
  api_score_required: true,
  seniority_tiebreaker: true,
  is_reward_incentive_growth: true,
  qualification_points_max: 10,
  qualification_point_scale: {
    masters_completed: 4,
    graduation_pg_diploma_min_1yr: 3,
    diploma_iti_min_1yr: 2,
    training_per_5_days: 1,
    book_publication: 2,
    article_publication: 1,
  },
};

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------
export type PromotionStatus =
  | 'submitted'
  | 'sedc_scored'
  | 'director_decided'
  | 'approved'
  | 'rejected'
  | 'withdrawn';

export type PromotionEventType =
  | 'submitted'
  | 'sedc_scored'
  | 'sedc_rescored'
  | 'director_approved'
  | 'director_rejected'
  | 'revision_requested'
  | 'withdrawn';

export interface PromotionEvidence {
  masters_completed?: boolean;
  graduation_pg_diploma?: boolean;
  diploma_iti?: boolean;
  training_days?: number;
  book_publications?: number;
  article_publications?: number;
  narrative?: string;
}

export interface PromotionApplication {
  id: string;
  staff_id: string;
  hr_organization_id: string;
  institution_id: string;
  from_designation_id: string | null;
  from_designation_name: string;
  to_designation_id: string | null;
  to_designation_name: string;
  merit_score: number | null;
  qualification_points: number | null;
  commitment_points: number | null;
  total_score: number | null;
  evidence_jsonb: PromotionEvidence;
  status: PromotionStatus;
  submitted_at: string;
  sedc_reviewed_at: string | null;
  director_approved_at: string | null;
  sedc_reviewed_by: string | null;
  director_approved_by: string | null;
  decision_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromotionApplicationInsert {
  staff_id: string;
  hr_organization_id: string;
  institution_id: string;
  from_designation_id?: string | null;
  from_designation_name: string;
  to_designation_id?: string | null;
  to_designation_name: string;
  evidence_jsonb?: PromotionEvidence;
}

export interface PromotionDecision {
  id: string;
  application_id: string;
  event_type: PromotionEventType;
  merit_score_snapshot: number | null;
  qualification_points_snapshot: number | null;
  commitment_points_snapshot: number | null;
  notes: string | null;
  actor_id: string;
  actor_role: string | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Policy reader
// ----------------------------------------------------------------------------
/**
 * Read hr.promotion_policy via fn_get_policy. Resolution priority:
 * user > institution > role > global. Falls back to POLICY_DEFAULTS if the
 * RPC returns nothing or errors.
 */
export async function getPromotionPolicy(
  supabase: SupabaseClient,
  institutionId: string | null
): Promise<PromotionPolicy> {
  try {
    const { data, error } = await supabase.rpc('fn_get_policy', {
      p_key: 'hr.promotion_policy',
      p_scope_id: institutionId ?? null,
    });
    if (error || !data || typeof data !== 'object') return POLICY_DEFAULTS;
    return { ...POLICY_DEFAULTS, ...(data as Partial<PromotionPolicy>) };
  } catch {
    return POLICY_DEFAULTS;
  }
}

// ----------------------------------------------------------------------------
// Scoring
// ----------------------------------------------------------------------------
/**
 * Compute merit score for a staff member.
 *
 * Per policy formula `appraisal_score / 10`, capped at `max_merit_points`.
 * Reads the last `delay_lookback_years` worth of performance reviews — if no
 * reviews exist (or table doesn't exist in this env), returns 0 and the SEDC
 * reviewer enters a manual override on the detail page.
 *
 * Note: hr_performance_reviews is a T5.1 table; the table may not exist yet
 * in every environment. The function tolerates that by checking for table
 * existence via the .single().error path and returning 0.
 */
export async function calculateMeritScore(
  supabase: SupabaseClient,
  staffId: string,
  policy: PromotionPolicy
): Promise<{ score: number; review_count: number; lookback_years: number }> {
  const lookbackYears = policy.delay_lookback_years;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - lookbackYears);
  const cutoffIso = cutoff.toISOString();

  // We probe the table; if it errors with relation-not-found, we return 0.
  const probe = await (supabase as any)
    .from('hr_performance_reviews')
    .select('appraisal_score, review_period_end')
    .eq('staff_id', staffId)
    .gte('review_period_end', cutoffIso)
    .limit(50);

  if (probe.error) {
    // Table missing in this env (pre-T5.1). Score remains 0 — SEDC enters
    // override manually on the detail page.
    return { score: 0, review_count: 0, lookback_years: lookbackYears };
  }

  const rows: Array<{ appraisal_score: number | null }> = probe.data ?? [];
  if (rows.length === 0) {
    return { score: 0, review_count: 0, lookback_years: lookbackYears };
  }

  // Formula: appraisal_score / 10, averaged across reviews. (Per-review max
  // appraisal is typically 100, giving max 10 points per review; we average
  // and then cap at max_merit_points.)
  const sum = rows.reduce((acc, r) => acc + (r.appraisal_score ?? 0), 0);
  const avg = sum / rows.length;
  const raw = avg / 10;
  const capped = Math.min(raw, policy.max_merit_points);

  return {
    score: Math.round(capped * 100) / 100,
    review_count: rows.length,
    lookback_years: lookbackYears,
  };
}

/**
 * Compute qualification points from the applicant's evidence.
 *
 * Sums each line item against the policy's `qualification_point_scale`,
 * capped at `qualification_points_max`.
 */
export function calculateQualificationPoints(
  evidence: PromotionEvidence,
  policy: PromotionPolicy
): { score: number; breakdown: Record<string, number> } {
  const scale = policy.qualification_point_scale;
  const breakdown: Record<string, number> = {};

  if (evidence.masters_completed) breakdown.masters_completed = scale.masters_completed;
  if (evidence.graduation_pg_diploma)
    breakdown.graduation_pg_diploma_min_1yr = scale.graduation_pg_diploma_min_1yr;
  if (evidence.diploma_iti) breakdown.diploma_iti_min_1yr = scale.diploma_iti_min_1yr;
  if (evidence.training_days && evidence.training_days > 0) {
    breakdown.training = Math.floor(evidence.training_days / 5) * scale.training_per_5_days;
  }
  if (evidence.book_publications && evidence.book_publications > 0) {
    breakdown.book_publications = evidence.book_publications * scale.book_publication;
  }
  if (evidence.article_publications && evidence.article_publications > 0) {
    breakdown.article_publications =
      evidence.article_publications * scale.article_publication;
  }

  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const capped = Math.min(raw, policy.qualification_points_max);
  return { score: Math.round(capped * 100) / 100, breakdown };
}

// ----------------------------------------------------------------------------
// State machine — valid transitions
// ----------------------------------------------------------------------------
const VALID_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
  submitted: ['sedc_scored', 'withdrawn'],
  sedc_scored: ['director_decided', 'submitted', 'withdrawn'], // can be sent back to applicant
  director_decided: ['approved', 'rejected'],
  approved: [],
  rejected: [],
  withdrawn: [],
};

export function canTransition(from: PromotionStatus, to: PromotionStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// ----------------------------------------------------------------------------
// CRUD
// ----------------------------------------------------------------------------
export class PromotionService {
  /** List applications. Filter by status / staff / hr_organization. */
  static async list(
    supabase: SupabaseClient,
    filters: {
      status?: PromotionStatus | PromotionStatus[];
      staff_id?: string;
      hr_organization_id?: string;
      institution_id?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ data: PromotionApplication[]; total: number }> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 25;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = (supabase as any)
      .from('hr_promotion_applications')
      .select('*', { count: 'exact' })
      .order('submitted_at', { ascending: false })
      .range(from, to);

    if (filters.staff_id) q = q.eq('staff_id', filters.staff_id);
    if (filters.hr_organization_id) q = q.eq('hr_organization_id', filters.hr_organization_id);
    if (filters.institution_id) q = q.eq('institution_id', filters.institution_id);
    if (filters.status) {
      if (Array.isArray(filters.status)) q = q.in('status', filters.status);
      else q = q.eq('status', filters.status);
    }

    const { data, count, error } = await q;
    if (error) throw error;
    return { data: (data ?? []) as PromotionApplication[], total: count ?? 0 };
  }

  static async getById(
    supabase: SupabaseClient,
    id: string
  ): Promise<PromotionApplication | null> {
    const { data, error } = await (supabase as any)
      .from('hr_promotion_applications')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as PromotionApplication) ?? null;
  }

  /** Submit a new promotion application. Inserts row + 'submitted' decision. */
  static async submit(
    supabase: SupabaseClient,
    payload: PromotionApplicationInsert,
    actorId: string
  ): Promise<PromotionApplication> {
    const insertRow = {
      ...payload,
      evidence_jsonb: payload.evidence_jsonb ?? {},
      status: 'submitted' as PromotionStatus,
      created_by: actorId,
      updated_by: actorId,
    };

    const { data, error } = await (supabase as any)
      .from('hr_promotion_applications')
      .insert(insertRow)
      .select()
      .single();
    if (error) throw error;

    // Audit row
    await (supabase as any).from('hr_promotion_decisions').insert({
      application_id: (data as { id: string }).id,
      event_type: 'submitted',
      actor_id: actorId,
      actor_role: 'applicant',
    });

    return data as PromotionApplication;
  }

  /** SEDC scores the application. Sets merit / qual / commit + flips status. */
  static async sedcScore(
    supabase: SupabaseClient,
    applicationId: string,
    scores: {
      merit_score: number;
      qualification_points: number;
      commitment_points: number;
      notes?: string;
    },
    actorId: string
  ): Promise<PromotionApplication> {
    const current = await this.getById(supabase, applicationId);
    if (!current) throw new Error('Application not found');
    if (
      current.status !== 'submitted' &&
      current.status !== 'sedc_scored' // allow re-score
    ) {
      throw new Error(
        `Cannot SEDC-score from status '${current.status}' — only 'submitted' or 'sedc_scored' (re-score)`
      );
    }

    const isRescore = current.status === 'sedc_scored';
    const now = new Date().toISOString();

    const { data, error } = await (supabase as any)
      .from('hr_promotion_applications')
      .update({
        merit_score: scores.merit_score,
        qualification_points: scores.qualification_points,
        commitment_points: scores.commitment_points,
        status: 'sedc_scored',
        sedc_reviewed_at: now,
        sedc_reviewed_by: actorId,
        updated_by: actorId,
      })
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;

    await (supabase as any).from('hr_promotion_decisions').insert({
      application_id: applicationId,
      event_type: isRescore ? 'sedc_rescored' : 'sedc_scored',
      merit_score_snapshot: scores.merit_score,
      qualification_points_snapshot: scores.qualification_points,
      commitment_points_snapshot: scores.commitment_points,
      notes: scores.notes ?? null,
      actor_id: actorId,
      actor_role: 'sedc_reviewer',
    });

    return data as PromotionApplication;
  }

  /** Director approves or rejects the scored application. Terminal. */
  static async directorDecide(
    supabase: SupabaseClient,
    applicationId: string,
    decision: 'approved' | 'rejected',
    notes: string | null,
    actorId: string
  ): Promise<PromotionApplication> {
    const current = await this.getById(supabase, applicationId);
    if (!current) throw new Error('Application not found');
    if (current.status !== 'sedc_scored') {
      throw new Error(
        `Cannot Director-decide from status '${current.status}' — only 'sedc_scored'`
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await (supabase as any)
      .from('hr_promotion_applications')
      .update({
        status: decision,
        director_approved_at: now,
        director_approved_by: actorId,
        decision_notes: notes,
        updated_by: actorId,
      })
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;

    await (supabase as any).from('hr_promotion_decisions').insert({
      application_id: applicationId,
      event_type: decision === 'approved' ? 'director_approved' : 'director_rejected',
      notes,
      actor_id: actorId,
      actor_role: 'director',
    });

    return data as PromotionApplication;
  }

  /** Applicant withdraws their application before terminal states. */
  static async withdraw(
    supabase: SupabaseClient,
    applicationId: string,
    notes: string | null,
    actorId: string
  ): Promise<PromotionApplication> {
    const current = await this.getById(supabase, applicationId);
    if (!current) throw new Error('Application not found');
    if (current.status === 'approved' || current.status === 'rejected' || current.status === 'withdrawn') {
      throw new Error(`Cannot withdraw from terminal status '${current.status}'`);
    }

    const { data, error } = await (supabase as any)
      .from('hr_promotion_applications')
      .update({
        status: 'withdrawn',
        decision_notes: notes,
        updated_by: actorId,
      })
      .eq('id', applicationId)
      .select()
      .single();
    if (error) throw error;

    await (supabase as any).from('hr_promotion_decisions').insert({
      application_id: applicationId,
      event_type: 'withdrawn',
      notes,
      actor_id: actorId,
      actor_role: 'applicant',
    });

    return data as PromotionApplication;
  }

  /** Read the full decision history for an application (audit trail). */
  static async getDecisions(
    supabase: SupabaseClient,
    applicationId: string
  ): Promise<PromotionDecision[]> {
    const { data, error } = await (supabase as any)
      .from('hr_promotion_decisions')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as PromotionDecision[];
  }
}
