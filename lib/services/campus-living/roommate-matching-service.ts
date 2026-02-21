import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  HostelRoommatePreference,
  CreateHostelRoommatePreferenceDTO,
} from '@/types/campus-living';

interface CompatibilityScore {
  learnerId: string;
  score: number;
  matchDetails: Record<string, number>;
}

export class RoommateMatchingService {
  // ── List all preferences ──────────────────────────────────────────
  static async getPreferences(
    institutionId: string,
    academicYearId?: string,
    page = 1,
    pageSize = 50
  ) {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('hostel_roommate_preferences')
        .select('*', { count: 'exact' })
        .eq('institution_id', institutionId);

      if (academicYearId) query = query.eq('academic_year_id', academicYearId);

      const from = (page - 1) * pageSize;
      query = query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/roommate', 'Failed to fetch preferences', error);
        throw error;
      }
      return { data: data as HostelRoommatePreference[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/roommate', 'Unexpected error in getPreferences', error);
      throw error;
    }
  }

  // ── Get preference for a learner ──────────────────────────────────
  static async getPreference(learnerId: string, academicYearId: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_roommate_preferences')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('academic_year_id', academicYearId)
        .maybeSingle();

      if (error) {
        logger.error('campus-living/roommate', 'Failed to fetch preference', error);
        throw error;
      }
      return data as HostelRoommatePreference | null;
    } catch (error) {
      logger.error('campus-living/roommate', 'Unexpected error in getPreference', error);
      throw error;
    }
  }

  // ── Get preference by ID ──────────────────────────────────────────
  static async getPreferenceById(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_roommate_preferences')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        logger.error('campus-living/roommate', 'Failed to fetch preference by id', error);
        throw error;
      }
      return data as HostelRoommatePreference;
    } catch (error) {
      logger.error('campus-living/roommate', 'Unexpected error in getPreferenceById', error);
      throw error;
    }
  }

  // ── Create or update preference ───────────────────────────────────
  static async savePreference(payload: CreateHostelRoommatePreferenceDTO) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_roommate_preferences')
        .upsert(payload, { onConflict: 'learner_id,academic_year_id' })
        .select()
        .single();

      if (error) {
        logger.error('campus-living/roommate', 'Failed to save preference', error);
        throw error;
      }
      return data as HostelRoommatePreference;
    } catch (error) {
      logger.error('campus-living/roommate', 'Unexpected error in savePreference', error);
      throw error;
    }
  }

  // ── Update preference ─────────────────────────────────────────────
  static async updatePreference(id: string, payload: Partial<CreateHostelRoommatePreferenceDTO>) {
    try {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('hostel_roommate_preferences')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('campus-living/roommate', 'Failed to update preference', error);
        throw error;
      }
      return data as HostelRoommatePreference;
    } catch (error) {
      logger.error('campus-living/roommate', 'Unexpected error in updatePreference', error);
      throw error;
    }
  }

  // ── Delete preference ─────────────────────────────────────────────
  static async deletePreference(id: string) {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('hostel_roommate_preferences')
        .delete()
        .eq('id', id);

      if (error) {
        logger.error('campus-living/roommate', 'Failed to delete preference', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/roommate', 'Unexpected error in deletePreference', error);
      throw error;
    }
  }

  // ── Compute compatibility score between two learners ──────────────
  static computeCompatibility(
    prefA: HostelRoommatePreference,
    prefB: HostelRoommatePreference
  ): CompatibilityScore {
    const matchDetails: Record<string, number> = {};
    let totalScore = 0;
    let totalWeight = 0;

    // Sleep schedule (weight 20)
    const sleepWeight = 20;
    totalWeight += sleepWeight;
    if (prefA.sleep_schedule && prefB.sleep_schedule) {
      matchDetails.sleep_schedule = prefA.sleep_schedule === prefB.sleep_schedule ? sleepWeight : 0;
    } else {
      matchDetails.sleep_schedule = sleepWeight * 0.5; // neutral if not set
    }
    totalScore += matchDetails.sleep_schedule;

    // Study habits (weight 15)
    const studyWeight = 15;
    totalWeight += studyWeight;
    if (prefA.study_habits && prefB.study_habits) {
      matchDetails.study_habits = prefA.study_habits === prefB.study_habits ? studyWeight : 0;
    } else {
      matchDetails.study_habits = studyWeight * 0.5;
    }
    totalScore += matchDetails.study_habits;

    // Cleanliness (weight 20)
    const cleanWeight = 20;
    totalWeight += cleanWeight;
    if (prefA.cleanliness_level && prefB.cleanliness_level) {
      matchDetails.cleanliness = prefA.cleanliness_level === prefB.cleanliness_level ? cleanWeight : cleanWeight * 0.3;
    } else {
      matchDetails.cleanliness = cleanWeight * 0.5;
    }
    totalScore += matchDetails.cleanliness;

    // Noise tolerance (weight 20)
    const noiseWeight = 20;
    totalWeight += noiseWeight;
    if (prefA.noise_tolerance && prefB.noise_tolerance) {
      matchDetails.noise_tolerance = prefA.noise_tolerance === prefB.noise_tolerance ? noiseWeight : noiseWeight * 0.3;
    } else {
      matchDetails.noise_tolerance = noiseWeight * 0.5;
    }
    totalScore += matchDetails.noise_tolerance;

    // Visitor frequency (weight 10)
    const visitorWeight = 10;
    totalWeight += visitorWeight;
    if (prefA.visitor_frequency && prefB.visitor_frequency) {
      matchDetails.visitor_frequency = prefA.visitor_frequency === prefB.visitor_frequency ? visitorWeight : visitorWeight * 0.3;
    } else {
      matchDetails.visitor_frequency = visitorWeight * 0.5;
    }
    totalScore += matchDetails.visitor_frequency;

    // Smoker matching (weight 15 - important dealbreaker)
    const smokerWeight = 15;
    totalWeight += smokerWeight;
    matchDetails.smoking = prefA.is_smoker === prefB.is_smoker ? smokerWeight : 0;
    totalScore += matchDetails.smoking;

    // Preferred roommate bonus
    if (prefA.preferred_roommates?.includes(prefB.learner_id) || prefB.preferred_roommates?.includes(prefA.learner_id)) {
      totalScore = Math.min(totalScore + 20, totalWeight);
      matchDetails.preferred_bonus = 20;
    }

    // Avoid roommate penalty
    if (prefA.avoid_roommates?.includes(prefB.learner_id) || prefB.avoid_roommates?.includes(prefA.learner_id)) {
      totalScore = 0;
      matchDetails.avoid_penalty = -totalWeight;
    }

    const score = totalWeight > 0 ? Math.round((totalScore / totalWeight) * 100) : 50;

    return {
      learnerId: prefB.learner_id,
      score,
      matchDetails,
    };
  }

  // ── Find compatible roommates for a learner ───────────────────────
  static async findCompatibleRoommates(
    learnerId: string,
    institutionId: string,
    academicYearId: string,
    limit = 10
  ): Promise<CompatibilityScore[]> {
    try {
      // Get the learner's preferences
      const learnerPref = await this.getPreference(learnerId, academicYearId);
      if (!learnerPref) {
        logger.warn('campus-living/roommate', 'No preferences found for learner', { learnerId });
        return [];
      }

      // Get all other preferences for the same academic year
      const supabase = createClientSupabaseClient();
      const { data: allPrefs, error } = await supabase
        .from('hostel_roommate_preferences')
        .select('*')
        .eq('institution_id', institutionId)
        .eq('academic_year_id', academicYearId)
        .neq('learner_id', learnerId);

      if (error) {
        logger.error('campus-living/roommate', 'Failed to fetch preferences for matching', error);
        throw error;
      }

      // Score each potential roommate
      const scores = (allPrefs ?? [])
        .map((pref) => this.computeCompatibility(learnerPref, pref as HostelRoommatePreference))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return scores;
    } catch (error) {
      logger.error('campus-living/roommate', 'Unexpected error in findCompatibleRoommates', error);
      throw error;
    }
  }
}
