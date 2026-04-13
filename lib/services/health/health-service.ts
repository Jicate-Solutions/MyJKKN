// lib/services/health/health-service.ts
// Core service for the Health Module — profile CRUD, daily logs, streaks, leaderboards.
// Created: 2026-04-12

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  HealthProfile,
  HealthDailyLog,
  HealthStreak,
  HealthDashboardData,
  HealthProfileFormData,
  MoodCheckinData,
  LeaderboardEntry,
  LeaderboardType,
  LeaderboardPeriod,
} from '@/types/health';
import { CONSENT_VERSION } from '@/types/health';

const supabase = createClientSupabaseClient();

export class HealthService {
  // --------------------------------------------------------------------------
  // Consent
  // --------------------------------------------------------------------------

  static async hasConsented(learnerId: string): Promise<boolean> {
    const { data } = await (supabase as any)
      .from('health_consents')
      .select('id')
      .eq('learner_id', learnerId)
      .eq('consent_version', CONSENT_VERSION)
      .is('withdrawn_at', null)
      .maybeSingle();
    return !!data;
  }

  static async giveConsent(learnerId: string): Promise<void> {
    await (supabase as any)
      .from('health_consents')
      .upsert(
        { learner_id: learnerId, consent_version: CONSENT_VERSION, consented_at: new Date().toISOString() },
        { onConflict: 'learner_id,consent_version' }
      );
  }

  // --------------------------------------------------------------------------
  // Profile
  // --------------------------------------------------------------------------

  static async getOrCreateProfile(learnerId: string, institutionId?: string): Promise<HealthProfile> {
    const { data: existing } = await (supabase as any)
      .from('health_profiles')
      .select('*')
      .eq('learner_id', learnerId)
      .maybeSingle();

    if (existing) return existing;

    // Auto-populate blood_group from learners_profiles if available
    const { data: learner } = await (supabase as any)
      .from('learners_profiles')
      .select('blood_group, institution_id')
      .eq('id', learnerId)
      .maybeSingle();

    const { data: created, error } = await (supabase as any)
      .from('health_profiles')
      .insert({
        learner_id: learnerId,
        institution_id: institutionId || learner?.institution_id,
        blood_group: learner?.blood_group || null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return created;
  }

  static async updateProfile(learnerId: string, data: Partial<HealthProfileFormData>): Promise<HealthProfile> {
    const updateData: any = { ...data, updated_at: new Date().toISOString() };

    // Check if profile is now "complete"
    if (data.blood_group && data.emergency_contact_phone) {
      updateData.profile_completed = true;
    }

    const { data: updated, error } = await (supabase as any)
      .from('health_profiles')
      .update(updateData)
      .eq('learner_id', learnerId)
      .select('*')
      .single();

    if (error) throw error;
    return updated;
  }

  // --------------------------------------------------------------------------
  // Daily Log
  // --------------------------------------------------------------------------

  static async getTodayLog(learnerId: string): Promise<HealthDailyLog | null> {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await (supabase as any)
      .from('health_daily_logs')
      .select('*')
      .eq('learner_id', learnerId)
      .eq('log_date', today)
      .maybeSingle();
    return data;
  }

  static async upsertMoodCheckin(learnerId: string, checkin: MoodCheckinData): Promise<HealthDailyLog> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await (supabase as any)
      .from('health_daily_logs')
      .upsert(
        {
          learner_id: learnerId,
          log_date: today,
          mood: checkin.mood,
          sleep_quality: checkin.sleep_quality,
          stress_level: checkin.stress_level,
          mood_note: checkin.mood_note || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'learner_id,log_date' }
      )
      .select('*')
      .single();

    if (error) throw error;

    // Update mood streak
    await this.updateStreak(learnerId, 'mood');
    return data;
  }

  static async updateSteps(learnerId: string, stepCount: number): Promise<HealthDailyLog> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await (supabase as any)
      .from('health_daily_logs')
      .upsert(
        {
          learner_id: learnerId,
          log_date: today,
          step_count: stepCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'learner_id,log_date' }
      )
      .select('*')
      .single();

    if (error) throw error;
    if (stepCount > 0) await this.updateStreak(learnerId, 'steps');
    return data;
  }

  static async updateWater(learnerId: string, glasses: number): Promise<HealthDailyLog> {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await (supabase as any)
      .from('health_daily_logs')
      .upsert(
        {
          learner_id: learnerId,
          log_date: today,
          water_glasses: glasses,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'learner_id,log_date' }
      )
      .select('*')
      .single();

    if (error) throw error;
    if (glasses > 0) await this.updateStreak(learnerId, 'water');
    return data;
  }

  // --------------------------------------------------------------------------
  // Streaks
  // --------------------------------------------------------------------------

  static async getStreaks(learnerId: string): Promise<HealthStreak[]> {
    const { data } = await (supabase as any)
      .from('health_streaks')
      .select('*')
      .eq('learner_id', learnerId);
    return data || [];
  }

  static async updateStreak(learnerId: string, streakType: 'mood' | 'steps' | 'water'): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    const { data: existing } = await (supabase as any)
      .from('health_streaks')
      .select('*')
      .eq('learner_id', learnerId)
      .eq('streak_type', streakType)
      .maybeSingle();

    if (!existing) {
      await (supabase as any).from('health_streaks').insert({
        learner_id: learnerId,
        streak_type: streakType,
        current_streak: 1,
        longest_streak: 1,
        last_logged_date: today,
        total_days_logged: 1,
      });
      return;
    }

    if (existing.last_logged_date === today) return; // Already logged today

    const isConsecutive = existing.last_logged_date === yesterday;
    const newStreak = isConsecutive ? existing.current_streak + 1 : 1;
    const newLongest = Math.max(newStreak, existing.longest_streak);

    await (supabase as any)
      .from('health_streaks')
      .update({
        current_streak: newStreak,
        longest_streak: newLongest,
        last_logged_date: today,
        total_days_logged: existing.total_days_logged + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  }

  // --------------------------------------------------------------------------
  // Weekly Data
  // --------------------------------------------------------------------------

  static async getWeeklyLogs(learnerId: string): Promise<HealthDailyLog[]> {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const { data } = await (supabase as any)
      .from('health_daily_logs')
      .select('*')
      .eq('learner_id', learnerId)
      .gte('log_date', weekAgo)
      .order('log_date', { ascending: true });
    return data || [];
  }

  // --------------------------------------------------------------------------
  // Update Goals (step goal, water goal)
  // --------------------------------------------------------------------------

  static async updateGoals(learnerId: string, stepGoal?: number, waterGoal?: number): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const updates: any = { updated_at: new Date().toISOString() };
    if (stepGoal !== undefined) updates.step_goal = stepGoal;
    if (waterGoal !== undefined) updates.water_goal = waterGoal;

    await (supabase as any)
      .from('health_daily_logs')
      .upsert({ learner_id: learnerId, log_date: today, ...updates }, { onConflict: 'learner_id,log_date' });
  }

  // --------------------------------------------------------------------------
  // Delete Health Profile (data deletion right per DPDP Act)
  // --------------------------------------------------------------------------

  static async deleteAllHealthData(learnerId: string): Promise<void> {
    // Delete in order of dependencies
    await (supabase as any).from('health_daily_logs').delete().eq('learner_id', learnerId);
    await (supabase as any).from('health_streaks').delete().eq('learner_id', learnerId);
    await (supabase as any).from('health_profiles').delete().eq('learner_id', learnerId);
    await (supabase as any).from('health_consents').delete().eq('learner_id', learnerId);
  }

  // --------------------------------------------------------------------------
  // Dashboard Composite
  // --------------------------------------------------------------------------

  static async getDashboardData(learnerId: string, institutionId?: string): Promise<HealthDashboardData> {
    const [hasConsented, profile, todayLog, streaks, weeklyLogs] = await Promise.all([
      this.hasConsented(learnerId),
      this.getOrCreateProfile(learnerId, institutionId),
      this.getTodayLog(learnerId),
      this.getStreaks(learnerId),
      this.getWeeklyLogs(learnerId),
    ]);

    const weeklySteps = weeklyLogs.map((l) => ({ date: l.log_date, steps: l.step_count }));
    const weeklyMood = weeklyLogs.map((l) => ({ date: l.log_date, mood: l.mood }));

    // Get institution name
    let institutionName: string | null = null;
    if (profile.institution_id) {
      const { data: inst } = await (supabase as any)
        .from('institutions')
        .select('name')
        .eq('id', profile.institution_id)
        .maybeSingle();
      institutionName = inst?.name || null;
    }

    return {
      profile,
      todayLog,
      streaks,
      weeklySteps,
      weeklyMood,
      leaderboardRank: null, // Computed separately for performance
      institutionName,
      hasConsented,
    };
  }

  // --------------------------------------------------------------------------
  // Leaderboard
  // --------------------------------------------------------------------------

  static async getLeaderboard(
    type: LeaderboardType,
    institutionId?: string,
    limit: number = 50
  ): Promise<LeaderboardEntry[]> {
    if (type === 'mood_streak') {
      let query = (supabase as any)
        .from('health_streaks')
        .select('learner_id, current_streak, learners_profiles!learner_id(first_name, last_name, institution_id, institutions!institution_id(name))')
        .eq('streak_type', 'mood')
        .gt('current_streak', 0)
        .order('current_streak', { ascending: false })
        .limit(limit);

      if (institutionId) {
        query = query.eq('learners_profiles.institution_id', institutionId);
      }

      const { data } = await query;
      return (data || []).map((row: any, idx: number) => ({
        learner_id: row.learner_id,
        learner_name: `${row.learners_profiles?.first_name || ''} ${(row.learners_profiles?.last_name || '')[0] || ''}.`.trim(),
        institution_name: row.learners_profiles?.institutions?.name || '',
        value: row.current_streak,
        rank: idx + 1,
      }));
    }

    // Water consistency — count of days with water_glasses >= water_goal in last 7 days
    if (type === 'water_consistency') {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const { data } = await (supabase as any).rpc('health_water_leaderboard', {
        p_since: weekAgo,
        p_institution_id: institutionId || null,
        p_limit: limit,
      });
      return data || [];
    }

    return [];
  }
}
