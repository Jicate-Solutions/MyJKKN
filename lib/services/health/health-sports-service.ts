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
// Tournament permission — two-party approval (2026-07-30)
//
// The Physical Director FILES for the whole squad; the PRINCIPAL approves.
// `step3_principal_*` is THE approval step. Steps 1 (sports coordinator),
// 2 (HOD) and 4 (PE director) are not part of the path and carry the explicit
// status 'not_required' — never 'approved', which would fabricate an approval
// nobody gave, and never 'pending', which would read as awaited forever.
//
// These widened shapes live here rather than in types/health-sports.ts so the
// 'not_required' state and the squad-roster fields stay scoped to this flow.
// ----------------------------------------------------------------------------

/** Step status including the "nobody approves this step" state. */
export type TournamentStepStatus = ApprovalStatus | 'not_required';

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
  justification: string | null;
  members: TournamentSquadMember[];
}

/**
 * Steps nobody decides. Written explicitly on every insert so a row is never
 * born claiming an approval it does not have, and never sits pending on a step
 * that has no approver.
 */
const UNUSED_STEP_STATUSES = {
  step1_sports_coordinator_status: 'not_required' as const,
  step2_hod_status: 'not_required' as const,
  step4_pe_director_status: 'not_required' as const,
};

const PERMISSION_SELECT =
  '*, learners_profiles!health_tournament_permissions_learner_id_fkey(id, first_name, last_name, roll_number, institution_id)';

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
        // Only the Principal decides. The other three steps are stamped
        // not_required rather than pending — see UNUSED_STEP_STATUSES.
        ...UNUSED_STEP_STATUSES,
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
    const { data, error } = await (supabase as any)
      .from('health_tournament_permissions').insert({
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
        ...UNUSED_STEP_STATUSES,
        step3_principal_status: 'pending',
      }).select(PERMISSION_SELECT).single();
    if (error) throw error;
    return data as TournamentPermissionRecord;
  }

  /**
   * Requests the signed-in approver still has to decide.
   *
   * Row visibility is RLS's job — `health_tournament_permissions_approver`
   * admits a caller holding `health.sports.approve`. This filter is only about
   * WHICH stage, never about WHO.
   */
  static async getPermissionsAwaitingApproval(): Promise<TournamentPermissionRecord[]> {
    const { data, error } = await (supabase as any)
      .from('health_tournament_permissions').select(PERMISSION_SELECT)
      .eq('step3_principal_status', 'pending')
      .order('start_date', { ascending: true });
    if (error) throw error;
    return (data || []) as TournamentPermissionRecord[];
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

  /** Requests already decided, newest decision first. */
  static async getDecidedPermissions(
    decision: 'approved' | 'rejected'
  ): Promise<TournamentPermissionRecord[]> {
    const { data, error } = await (supabase as any)
      .from('health_tournament_permissions').select(PERMISSION_SELECT)
      .eq('step3_principal_status', decision)
      .order('step3_approved_at', { ascending: false });
    if (error) throw error;
    return (data || []) as TournamentPermissionRecord[];
  }

  /**
   * Record an approver's decision on one step.
   *
   * `decision` defaults to 'approved' so the original call shape still means
   * what it meant. `overall_status` follows step 3 because step 3 is the only
   * step anyone decides: a rejection ends the request immediately, and an
   * approval completes it — the old code only ever completed at step 4, which
   * no longer has an approver.
   */
  static async approvePermissionStep(
    id: string,
    step: 1 | 2 | 3 | 4,
    approvedBy: string,
    notes?: string,
    decision: 'approved' | 'rejected' = 'approved'
  ): Promise<void> {
    const field = `step${step}_${['sports_coordinator', 'hod', 'principal', 'pe_director'][step - 1]}_status`;
    const update: any = {
      [field]: decision,
      [`step${step}_approved_by`]: approvedBy,
      [`step${step}_approved_at`]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (notes) update[`step${step}_notes`] = notes;
    if (decision === 'rejected') update.overall_status = 'rejected';
    else if (step === 3) update.overall_status = 'approved';
    const { error } = await (supabase as any)
      .from('health_tournament_permissions').update(update).eq('id', id);
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
    const term = query.trim();
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
