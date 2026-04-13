// lib/services/health/health-sports-service.ts
// Service for Sports & Fitness section — profiles, credits, scholarships, training, permissions
// Based on JKKN Institutions Comprehensive Sports Policy
// Created: 2026-04-13

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  HealthSportsProfile, HealthFitnessTest, HealthTrainingLog,
  HealthSportsCredit, HealthSportsScholarship, HealthTournamentPermission,
  HealthSportsInjury, HealthSportsAchievement,
} from '@/types/health-sports';

const supabase = createClientSupabaseClient();

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
        step1_sports_coordinator_status: 'pending', step2_hod_status: 'pending',
        step3_principal_status: 'pending', step4_pe_director_status: 'pending',
      }).select('*').single();
    if (error) throw error;
    return data;
  }

  static async approvePermissionStep(id: string, step: 1 | 2 | 3 | 4, approvedBy: string, notes?: string): Promise<void> {
    const field = `step${step}_${['sports_coordinator', 'hod', 'principal', 'pe_director'][step - 1]}_status`;
    const update: any = {
      [field]: 'approved',
      [`step${step}_approved_by`]: approvedBy,
      [`step${step}_approved_at`]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (notes) update[`step${step}_notes`] = notes;
    // If this is step 4 (final), mark overall as approved
    if (step === 4) update.overall_status = 'approved';
    await (supabase as any).from('health_tournament_permissions').update(update).eq('id', id);
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
