// lib/services/health/health-sports-service.ts
// Service for Sports & Fitness section — profiles, credits, scholarships, training, permissions
// Based on JKKN Institutions Comprehensive Sports Policy
// Created: 2026-04-13

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  HealthSportsProfile, HealthFitnessTest, HealthTrainingLog,
  HealthSportsCredit, HealthSportsScholarship, HealthTournamentPermission,
  HealthSportsInjury, HealthSportsAchievement,
  ApprovalStatus, SportLevel,
} from '@/types/health-sports';

const supabase = createClientSupabaseClient();

// ----------------------------------------------------------------------------
// Tournament permission — PER-COLLEGE approval (2026-07-30, Director D6)
//
// The Physical Director FILES for the whole squad; each participating college's
// PRINCIPAL approves their own learners. A mixed-college squad is allowed
// (FORZAHS is a Paramedical event, so Pharmacy + Nursing + Allied Health can
// travel together), so the decision cannot live in a single `step3_principal_*`
// column set — it lives in health_tournament_permission_approvals, one row per
// (request, college). The request is approved only when EVERY row is approved.
//
// `step3_principal_*` and `overall_status` are now DERIVED mirrors maintained by
// a database trigger. Nothing in this file writes them, and the database
// actively rejects any attempt to: an approval can only come from the approvals
// table. Steps 1 (sports coordinator), 2 (HOD) and 4 (PE director) have no
// approver and carry 'not_required'.
//
// These widened shapes live here rather than in types/health-sports.ts so the
// 'not_required' state and the squad-roster fields stay scoped to this flow.
// ----------------------------------------------------------------------------

/**
 * Step status including the "nobody approves this step" state, and D13's
 * "the colleges decided and disagreed" state.
 *
 * 'partially_approved' reaches the Principal step because the derived
 * `step3_principal_status` mirror now carries the same verdict as
 * `overall_status` — showing a partly-approved trip as plain 'approved' there
 * would be exactly the over-report D13 exists to prevent.
 */
export type TournamentStepStatus =
  | ApprovalStatus
  | 'not_required'
  | 'partially_approved';

/** One college's decision on one request (D6). */
export interface TournamentCollegeApproval {
  approval_id: string;
  permission_id: string;
  institution_id: string;
  institution_name: string | null;
  status: 'pending' | 'approved' | 'rejected';
  approved_at: string | null;
  notes: string | null;
  last_nudged_at: string | null;
  /** The parent request's derived status, so a cancelled trip never reads as awaited. */
  overall_status?: string;
  cancelled_at?: string | null;
}

/** A squad member as the SIGNED-IN caller is allowed to see them (D6). */
export interface TournamentVisibleSquadMember {
  learner_id: string;
  name: string | null;
  roll_number: string | null;
  sport: string | null;
  institution_id: string | null;
  institution_name: string | null;
}

/**
 * One participating learner on a squad request.
 *
 * Stored inside `team_members` (jsonb). `learner_id` is carried on EVERY member
 * so each participant stays individually recoverable later — accreditation
 * needs per-learner participation, not an opaque squad blob. `roll_number` and
 * `sport` are denormalised on purpose: a squad spans several sports (Men:
 * Volleyball, Basketball; Women: Kho-kho, Chess on the paper letter this
 * replaces) and the roster must stay readable even if a learner record moves.
 */
export interface TournamentSquadMember {
  learner_id: string;
  name: string;
  roll_number: string | null;
  sport: string | null;
}

/** A permission row as this flow reads and writes it. */
export interface TournamentPermissionRecord
  extends Omit<
    HealthTournamentPermission,
    | 'team_members'
    | 'step1_sports_coordinator_status'
    | 'step2_hod_status'
    | 'step4_pe_director_status'
  > {
  team_members: TournamentSquadMember[];
  step1_sports_coordinator_status: TournamentStepStatus;
  step2_hod_status: TournamentStepStatus;
  step4_pe_director_status: TournamentStepStatus;
  /** profiles.id of the team member who filed for the squad. NULL when a learner filed for themselves. */
  filed_by_profile_id: string | null;
  step3_approved_by: string | null;
  step3_approved_at: string | null;
  step3_notes: string | null;
  travel_details: string | null;
  /** D10 — set when the trip was called off. The record is kept; it just counts for nothing. */
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  /** Present when the query embedded the nominated learner. */
  learners_profiles?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    roll_number: string | null;
    institution_id: string | null;
  } | null;
}

/** A learner offered by the squad picker. */
export interface SquadCandidate {
  id: string;
  first_name: string | null;
  last_name: string | null;
  roll_number: string | null;
}

/** Everything the Physical Director enters once for the whole squad. */
export interface SquadRequestInput {
  tournament_name: string;
  tournament_level: SportLevel;
  sport: string;
  start_date: string;
  end_date: string;
  travel_required: boolean;
  travel_details: string | null;
  /** D14 — the OUTSIDE institution hosting the tournament. NULL = held at JKKN. */
  host_institution: string | null;
  justification: string | null;
  members: TournamentSquadMember[];
}

/**
 * Does this PostgREST failure mean the column simply does not exist yet?
 *
 * Migrations in this repo are Director-gated FILES that neither merge nor
 * deploy applies, so a UI that writes a new column can ship days before the
 * column is there. PostgREST answers such a write with PGRST204 ("Could not
 * find the '<column>' column ... in the schema cache"). Callers use this to
 * retry once WITHOUT the column, so the live form keeps working in the gap
 * instead of breaking until someone applies the migration.
 *
 * Deliberately narrow — the PostgREST code AND the column name must BOTH match.
 * A PGRST204 without a readable message naming this column returns false, so an
 * unrelated schema-cache failure is surfaced to the caller rather than silently
 * retried with the value dropped. Losing the host quietly is worse than saying
 * what actually went wrong.
 */
export function isMissingColumnError(err: unknown, column: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code !== 'PGRST204') return false;
  return typeof e.message === 'string' && e.message.includes(column);
}

/**
 * The steps nobody decides are DELIBERATELY NOT NAMED on insert.
 *
 * Writing 'not_required' here would break the learner request form that works
 * on production today: the CHECK constraints are still
 * pending|approved|rejected until the migration in this PR is applied, so the
 * insert would fail with 23514 the moment this code shipped. Omitting the
 * columns lets the column DEFAULT decide — 'pending' before the migration,
 * 'not_required' after it — so the code cannot disagree with the constraint in
 * either direction. Code that never names a value can never contradict a CHECK.
 */
const PERMISSION_SELECT =
  '*, learners_profiles!health_tournament_permissions_learner_id_fkey(id, first_name, last_name, roll_number, institution_id)';

/**
 * Make a typed search term safe to interpolate into a PostgREST `.or()` string.
 *
 * `.or()` takes ONE string whose grammar uses `,` to separate conditions and
 * `()` to group them, so a learner typing `Kumar, R` or a name containing `)`
 * produces a filter PostgREST parses as syntax and rejects with a 400 — the
 * picker just breaks, with no clue why. `.` and `%` matter too: `.` separates
 * column.operator.value and `%` is the LIKE wildcard.
 *
 * Dropped rather than escaped: PostgREST's quoting rules differ per position
 * and none of these characters carries meaning in a name search, so removing
 * them narrows nothing a user would notice while making the string
 * unambiguous.
 */
function sanitiseOrFilterTerm(query: string): string {
  return query.replace(/[(),.*%\\"']/g, ' ').replace(/\s+/g, ' ').trim();
}

export class HealthSportsService {
  // --------------------------------------------------------------------------
  // Sports Profile
  // --------------------------------------------------------------------------

  static async getOrCreateSportsProfile(learnerId: string): Promise<HealthSportsProfile> {
    const { data: existing } = await (supabase as any)
      .from('health_sports_profiles').select('*').eq('learner_id', learnerId).maybeSingle();
    if (existing) return existing;
    const { data, error } = await (supabase as any)
      .from('health_sports_profiles').insert({ learner_id: learnerId }).select('*').single();
    if (error) throw error;
    return data;
  }

  static async updateSportsProfile(learnerId: string, updates: Partial<HealthSportsProfile>): Promise<HealthSportsProfile> {
    const { data, error } = await (supabase as any)
      .from('health_sports_profiles').update({ ...updates, updated_at: new Date().toISOString() })
      .eq('learner_id', learnerId).select('*').single();
    if (error) throw error;
    return data;
  }

  // --------------------------------------------------------------------------
  // Fitness Tests
  // --------------------------------------------------------------------------

  static async getFitnessTests(learnerId: string): Promise<HealthFitnessTest[]> {
    const { data } = await (supabase as any)
      .from('health_fitness_tests').select('*').eq('learner_id', learnerId)
      .order('test_date', { ascending: false }).limit(10);
    return data || [];
  }

  static async submitFitnessTest(learnerId: string, test: Partial<HealthFitnessTest>): Promise<HealthFitnessTest> {
    // Auto-calculate BMI if height and weight provided
    let bmi: number | null = null;
    if (test.height_cm && test.weight_kg && test.height_cm > 0) {
      bmi = Math.round((test.weight_kg / ((test.height_cm / 100) ** 2)) * 10) / 10;
    }
    // Auto-calculate VO2 max from beep test (Leger formula approximation)
    let vo2_max: number | null = null;
    if (test.beep_test_level) {
      vo2_max = Math.round((18.043461 + (3.238462 * test.beep_test_level) - (0.014636 * test.beep_test_level * test.beep_test_level)) * 10) / 10;
    }
    // Auto-calculate fitness category from composite score
    const fitnessScore = test.fitness_score || null;
    let fitnessCategory: string | null = null;
    if (fitnessScore !== null) {
      if (fitnessScore >= 80) fitnessCategory = 'excellent';
      else if (fitnessScore >= 65) fitnessCategory = 'good';
      else if (fitnessScore >= 50) fitnessCategory = 'average';
      else if (fitnessScore >= 35) fitnessCategory = 'below_average';
      else fitnessCategory = 'poor';
    }

    const { data, error } = await (supabase as any)
      .from('health_fitness_tests').insert({
        ...test, learner_id: learnerId, bmi, vo2_max_estimated: vo2_max,
        fitness_category: fitnessCategory,
      }).select('*').single();
    if (error) throw error;
    return data;
  }

  // --------------------------------------------------------------------------
  // Training Log
  // --------------------------------------------------------------------------

  static async getTrainingLogs(learnerId: string, days: number = 30): Promise<HealthTrainingLog[]> {
    const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
    const { data } = await (supabase as any)
      .from('health_training_logs').select('*').eq('learner_id', learnerId)
      .gte('training_date', since).order('training_date', { ascending: false });
    return data || [];
  }

  static async addTrainingLog(learnerId: string, log: Partial<HealthTrainingLog>): Promise<HealthTrainingLog> {
    const { data, error } = await (supabase as any)
      .from('health_training_logs').upsert({
        ...log, learner_id: learnerId,
        training_date: log.training_date || new Date().toISOString().split('T')[0],
      }, { onConflict: 'learner_id,training_date,sport,training_type' }).select('*').single();
    if (error) throw error;
    return data;
  }

  static async getWeeklyTrainingSummary(learnerId: string): Promise<{ total_minutes: number; sessions: number; sports: string[] }> {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const { data } = await (supabase as any)
      .from('health_training_logs').select('duration_minutes, sport').eq('learner_id', learnerId)
      .gte('training_date', weekAgo);
    const logs = data || [];
    return {
      total_minutes: logs.reduce((s: number, l: any) => s + (l.duration_minutes || 0), 0),
      sessions: logs.length,
      sports: Array.from(new Set(logs.map((l: any) => String(l.sport)))),
    };
  }

  // --------------------------------------------------------------------------
  // Sports Credits (45h = 1 credit per JKKN policy)
  // --------------------------------------------------------------------------

  static async getSportsCredits(learnerId: string): Promise<HealthSportsCredit[]> {
    const { data } = await (supabase as any)
      .from('health_sports_credits').select('*').eq('learner_id', learnerId)
      .order('created_at', { ascending: false });
    return data || [];
  }

  static async getCurrentSemesterCredits(learnerId: string, semester: string): Promise<HealthSportsCredit | null> {
    const { data } = await (supabase as any)
      .from('health_sports_credits').select('*').eq('learner_id', learnerId)
      .eq('semester', semester).maybeSingle();
    return data;
  }

  // --------------------------------------------------------------------------
  // Scholarships
  // --------------------------------------------------------------------------

  static async getScholarship(learnerId: string): Promise<HealthSportsScholarship | null> {
    const { data } = await (supabase as any)
      .from('health_sports_scholarships').select('*').eq('learner_id', learnerId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data;
  }

  // --------------------------------------------------------------------------
  // Tournament Permissions
  // --------------------------------------------------------------------------

  static async getPermissions(learnerId: string): Promise<HealthTournamentPermission[]> {
    const { data } = await (supabase as any)
      .from('health_tournament_permissions').select('*').eq('learner_id', learnerId)
      .order('created_at', { ascending: false });
    return data || [];
  }

  static async submitPermissionRequest(learnerId: string, request: Partial<HealthTournamentPermission>): Promise<HealthTournamentPermission> {
    const { data, error } = await (supabase as any)
      .from('health_tournament_permissions').insert({
        ...request, learner_id: learnerId, overall_status: 'pending',
        // Steps 1/2/4 are left to their column defaults on purpose — see the
        // note above PERMISSION_SELECT. Naming them here is what would break
        // this form on production before the migration is applied.
        step3_principal_status: 'pending',
      }).select('*').single();
    if (error) throw error;
    return data;
  }

  /**
   * File one request covering a whole squad.
   *
   * The Physical Director enters the tournament once and selects every
   * participating learner. `learner_id` (NOT NULL on the table) holds the
   * nominated lead learner; `team_members` holds the COMPLETE roster including
   * that lead, so no participant is reachable only through the row's own
   * foreign key.
   */
  static async fileSquadPermissionRequest(
    filedByProfileId: string,
    input: SquadRequestInput
  ): Promise<TournamentPermissionRecord> {
    if (input.members.length === 0) {
      throw new Error('Select at least one participating learner before filing.');
    }
    const payload = {
      learner_id: input.members[0].learner_id,
      filed_by_profile_id: filedByProfileId,
      tournament_name: input.tournament_name,
      tournament_level: input.tournament_level,
      sport: input.sport,
      start_date: input.start_date,
      end_date: input.end_date,
      travel_required: input.travel_required,
      travel_details: input.travel_details,
      justification: input.justification,
      team_members: input.members,
      overall_status: 'pending',
      step3_principal_status: 'pending',
    };

    const { data, error } = await (supabase as any)
      .from('health_tournament_permissions')
      .insert({ ...payload, host_institution: input.host_institution })
      .select(PERMISSION_SELECT).single();

    if (error) {
      // D14 deploy-order safety: the `host_institution` column ships in a
      // Director-gated migration that merge and deploy do not apply. Losing the
      // host is far better than losing the whole request, so file it without.
      if (!isMissingColumnError(error, 'host_institution')) throw error;
      const retry = await (supabase as any)
        .from('health_tournament_permissions')
        .insert(payload).select(PERMISSION_SELECT).single();
      if (retry.error) throw retry.error;
      return retry.data as TournamentPermissionRecord;
    }
    return data as TournamentPermissionRecord;
  }

  /**
   * The approval rows the signed-in caller may actually decide — their OWN
   * college's and no other (D6).
   *
   * Deliberately an RPC and not a filtered table read. Whether a caller may act
   * for a college depends on their role's institution_scope AND their
   * user_institution_access grants, neither of which the browser can evaluate,
   * so a client-side filter would either under-show or — as the previous
   * version of this feature did — show another college's request and leave the
   * separation to the UI.
   */
  static async getMyCollegeApprovals(): Promise<TournamentCollegeApproval[]> {
    const { data, error } = await (supabase as any).rpc('fn_health_tournament_my_approvals');
    if (error) throw error;
    return (data || []) as TournamentCollegeApproval[];
  }

  /** Full records for a set of requests. RLS decides which of them come back. */
  static async getPermissionsByIds(ids: string[]): Promise<TournamentPermissionRecord[]> {
    if (ids.length === 0) return [];
    const { data, error } = await (supabase as any)
      .from('health_tournament_permissions').select(PERMISSION_SELECT)
      .in('id', ids)
      .order('start_date', { ascending: true });
    if (error) throw error;
    return (data || []) as TournamentPermissionRecord[];
  }

  /** Every college's decision on one request, for the "who are we waiting on" strip. */
  static async getCollegeApprovals(permissionIds: string[]): Promise<TournamentCollegeApproval[]> {
    if (permissionIds.length === 0) return [];
    const { data, error } = await (supabase as any)
      .from('health_tournament_permission_approvals')
      .select('id, permission_id, institution_id, status, approved_at, notes, last_nudged_at, institutions(name)')
      .in('permission_id', permissionIds);
    if (error) throw error;
    return ((data || []) as any[]).map((r) => ({
      approval_id: r.id,
      permission_id: r.permission_id,
      institution_id: r.institution_id,
      institution_name: r.institutions?.name ?? null,
      status: r.status,
      approved_at: r.approved_at,
      notes: r.notes,
      last_nudged_at: r.last_nudged_at,
    })) as TournamentCollegeApproval[];
  }

  /**
   * The squad as the SIGNED-IN caller may see it (D6).
   *
   * An approver gets only their own college's learners. RLS is row-scoped and
   * cannot hand two Principals different `team_members` from the same row, so
   * the roster is read through the database rather than off the record.
   */
  static async getVisibleSquad(permissionId: string): Promise<TournamentVisibleSquadMember[]> {
    const { data, error } = await (supabase as any)
      .rpc('fn_health_tournament_visible_squad', { p_permission_id: permissionId });
    if (error) throw error;
    return (data || []) as TournamentVisibleSquadMember[];
  }

  /** Requests this team member filed on a squad's behalf, newest first. */
  static async getPermissionsFiledBy(profileId: string): Promise<TournamentPermissionRecord[]> {
    const { data, error } = await (supabase as any)
      .from('health_tournament_permissions').select(PERMISSION_SELECT)
      .eq('filed_by_profile_id', profileId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as TournamentPermissionRecord[];
  }

  /**
   * Is there any role at all that grants the approval permission?
   *
   * A filed request with nobody able to approve it waits forever with no
   * visible reason — the exact silent failure CLAUDE.md #27 forbids. This is a
   * TRUE/FALSE signal, not a headcount: `custom_roles` is readable by any
   * authenticated caller, so a `false` here really does mean no role grants it.
   * Holder counts live in `user_roles`, which only admins can read, so this
   * deliberately does not claim to know how many people hold the role.
   */
  static async anyRoleGrantsTournamentApproval(): Promise<boolean> {
    const { data, error } = await (supabase as any)
      .from('custom_roles').select('role_key, permissions').eq('is_active', true);
    if (error) throw error;
    return (data || []).some(
      (r: { permissions: Record<string, unknown> | null }) =>
        r.permissions?.['health.sports.approve'] === true ||
        r.permissions?.['health.sports.approve'] === 'true'
    );
  }

  /**
   * Record one college's decision (D6).
   *
   * Writes the approvals row and NOTHING else. `overall_status` and the
   * `step3_*` mirror are derived by the database, which becomes 'approved' only
   * once EVERY participating college has approved — and which rejects any
   * attempt to write them from here. The approver's identity is stamped from
   * `auth.uid()` server-side, so it cannot be supplied or forged by the client.
   */
  static async decideCollegeApproval(
    approvalId: string,
    decision: 'approved' | 'rejected',
    notes?: string
  ): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_tournament_permission_approvals')
      .update({ status: decision, notes: notes?.trim() || null })
      .eq('id', approvalId);
    if (error) throw error;
  }

  /**
   * D9 — send a reminder to a college that has not decided.
   *
   * This is the ONLY remedy for a late decision. Nothing anywhere approves on a
   * Principal's behalf: a fabricated approval in the record is worse than a
   * late one. Rate-limited server-side to one per college per 12 hours, and it
   * fails loudly rather than quietly reaching nobody when that college has no
   * approver at all.
   */
  static async nudgeApprover(permissionId: string, institutionId: string): Promise<number> {
    const { data, error } = await (supabase as any)
      .rpc('fn_health_tournament_nudge_approver', {
        p_permission_id: permissionId,
        p_institution_id: institutionId,
      });
    if (error) throw error;
    return typeof data === 'number' ? data : 0;
  }

  /**
   * D10 — call a trip off, or put it back on.
   *
   * The record is KEPT either way: the approval trail is audit evidence. A
   * cancelled request counts for nothing in participation or accreditation
   * reads, and reinstating restores its REAL state rather than a remembered
   * approval.
   */
  static async setPermissionCancelled(
    permissionId: string,
    cancelled: boolean,
    reason?: string
  ): Promise<void> {
    const { error } = await (supabase as any)
      .rpc('fn_health_tournament_set_cancelled', {
        p_permission_id: permissionId,
        p_cancelled: cancelled,
        p_reason: reason?.trim() || null,
      });
    if (error) throw error;
  }

  /**
   * Learners the Physical Director can put in a squad.
   *
   * Scoped to one institution in the query AND by `learners_profiles` RLS.
   * Returns [] for a caller whose role lacks a learner-read permission — the
   * caller must say so on screen rather than show an empty list (CLAUDE.md #27).
   */
  static async searchSquadCandidates(
    institutionId: string | null,
    query: string
  ): Promise<SquadCandidate[]> {
    const term = sanitiseOrFilterTerm(query);
    if (term.length < 2) return [];
    let q = (supabase as any)
      .from('learners_profiles')
      .select('id, first_name, last_name, roll_number')
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,roll_number.ilike.%${term}%`)
      .order('first_name', { ascending: true })
      .limit(25);
    if (institutionId) q = q.eq('institution_id', institutionId);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []) as SquadCandidate[];
  }

  // --------------------------------------------------------------------------
  // Injuries
  // --------------------------------------------------------------------------

  static async getInjuries(learnerId: string): Promise<HealthSportsInjury[]> {
    const { data } = await (supabase as any)
      .from('health_sports_injuries').select('*').eq('learner_id', learnerId)
      .order('injury_date', { ascending: false });
    return data || [];
  }

  static async addInjury(learnerId: string, injury: Partial<HealthSportsInjury>): Promise<HealthSportsInjury> {
    const { data, error } = await (supabase as any)
      .from('health_sports_injuries').insert({ ...injury, learner_id: learnerId }).select('*').single();
    if (error) throw error;
    return data;
  }

  // --------------------------------------------------------------------------
  // Achievements
  // --------------------------------------------------------------------------

  static async getAchievements(learnerId: string): Promise<HealthSportsAchievement[]> {
    const { data } = await (supabase as any)
      .from('health_sports_achievements').select('*').eq('learner_id', learnerId)
      .order('achievement_date', { ascending: false });
    return data || [];
  }

  static async addAchievement(learnerId: string, achievement: Partial<HealthSportsAchievement>): Promise<HealthSportsAchievement> {
    const { data, error } = await (supabase as any)
      .from('health_sports_achievements').insert({ ...achievement, learner_id: learnerId }).select('*').single();
    if (error) throw error;
    return data;
  }

  static async updateAchievement(id: string, updates: Partial<HealthSportsAchievement>): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_sports_achievements').update(updates).eq('id', id);
    if (error) throw error;
  }

  static async deleteAchievement(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_sports_achievements').delete().eq('id', id);
    if (error) throw error;
  }

  // --------------------------------------------------------------------------
  // Update + Delete: Training Logs
  // --------------------------------------------------------------------------

  static async updateTrainingLog(id: string, updates: Partial<HealthTrainingLog>): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_training_logs').update(updates).eq('id', id);
    if (error) throw error;
  }

  static async deleteTrainingLog(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_training_logs').delete().eq('id', id);
    if (error) throw error;
  }

  // --------------------------------------------------------------------------
  // Update + Delete: Injuries
  // --------------------------------------------------------------------------

  static async updateInjury(id: string, updates: Partial<HealthSportsInjury>): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_sports_injuries').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  }

  static async deleteInjury(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_sports_injuries').delete().eq('id', id);
    if (error) throw error;
  }

  // --------------------------------------------------------------------------
  // Update + Delete: Fitness Tests
  // --------------------------------------------------------------------------

  static async updateFitnessTest(id: string, updates: Partial<HealthFitnessTest>): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_fitness_tests').update(updates).eq('id', id);
    if (error) throw error;
  }

  static async deleteFitnessTest(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('health_fitness_tests').delete().eq('id', id);
    if (error) throw error;
  }
}
