// Service for the "learner hostelite" surface on /campus-living/residents.
//
// Source of truth: `learners_profiles.accommodation_type` (the admission-time
// classification). This is intentionally separate from `hostel_allocations`
// (the operational block/room/bed binding) because a learner can be classified
// as HOSTEL in admission but not yet allocated a bed — common on prod today
// (718 flagged hostelites, 0 allocations).
//
// Wardens use this service to: list the cohort, remove a wrongly-flagged
// learner (→ accommodation_type='DAY SCHOLAR'), and add a day-scholar to the
// hostel (→ accommodation_type='HOSTEL'). Per-row allocation edits live in
// the allocations service (not this one).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  LearnerHostelite,
  LearnerHostelitesFilters,
  LearnerHostelType,
} from '@/types/campus-living';

const LEARNER_SELECT = [
  'id',
  'first_name',
  'last_name',
  'student_email',
  'college_email',
  'roll_number',
  'gender',
  'father_name',
  'mother_name',
  'accommodation_type',
  'hostel_type',
  'hostel_fee',
  'dayscholar_fee',
  'institution_id',
  'department_id',
  'program_id',
].join(',');

export class LearnerHosteliteService {
  // ── List ──────────────────────────────────────────────────────────────
  //
  // institutionId:
  //   - undefined → super_admin view, no institution filter (same convention
  //     enforced across campus-living since the 2026-04-23 empty-UUID blitz —
  //     see memory/feedback_service_institution_id_signature_convention.md).
  //   - string    → filter to that institution only.
  static async listHostelites(
    institutionId: string | undefined,
    filters?: LearnerHostelitesFilters,
    page = 1,
    pageSize = 100,
  ): Promise<{ data: LearnerHostelite[]; count: number }> {
    try {
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('learners_profiles')
        .select(LEARNER_SELECT, { count: 'exact' })
        .eq('accommodation_type', 'HOSTEL');

      if (institutionId) query = query.eq('institution_id', institutionId);
      if (filters?.hostel_type)
        query = query.eq('hostel_type', filters.hostel_type);
      if (filters?.search) {
        const s = filters.search.trim();
        if (s) {
          query = query.or(
            `roll_number.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,student_email.ilike.%${s}%`,
          );
        }
      }

      const from = (page - 1) * pageSize;
      query = query.order('roll_number', { ascending: true }).range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) {
        logger.error('campus-living/learner-hostelite', 'listHostelites failed', error);
        throw error;
      }
      return { data: (data ?? []) as LearnerHostelite[], count: count ?? 0 };
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in listHostelites', error);
      throw error;
    }
  }

  // ── Remove from hostel ────────────────────────────────────────────────
  // Flips accommodation_type to 'DAY SCHOLAR'. Does NOT touch hostel_allocations
  // (caller is responsible for cancelling / vacating any active allocation via
  // the HostelAllocationService first; we leave that as an explicit step so
  // the audit trail stays clean).
  static async removeFromHostel(learnerId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const { error } = await supabase
        .from('learners_profiles')
        .update({ accommodation_type: 'DAY SCHOLAR' })
        .eq('id', learnerId);
      if (error) {
        logger.error('campus-living/learner-hostelite', 'removeFromHostel failed', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in removeFromHostel', error);
      throw error;
    }
  }

  // ── Add a learner to hostel ───────────────────────────────────────────
  // Sets accommodation_type='HOSTEL'. Optional hostel_type (AC / NON-AC).
  // Does NOT allocate a bed — that's a separate operation (New Allocation flow).
  static async addToHostel(
    learnerId: string,
    hostelType: LearnerHostelType = null,
  ): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();
      const payload: { accommodation_type: 'HOSTEL'; hostel_type?: LearnerHostelType } = {
        accommodation_type: 'HOSTEL',
      };
      if (hostelType) payload.hostel_type = hostelType;
      const { error } = await supabase
        .from('learners_profiles')
        .update(payload)
        .eq('id', learnerId);
      if (error) {
        logger.error('campus-living/learner-hostelite', 'addToHostel failed', error);
        throw error;
      }
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in addToHostel', error);
      throw error;
    }
  }

  // ── Search candidate learners for the "Add to Hostel" picker ─────────
  // Returns only learners who are NOT currently HOSTEL-flagged (so the list
  // doesn't include existing hostelites).
  static async searchCandidates(
    institutionId: string | undefined,
    search: string,
    limit = 20,
  ): Promise<LearnerHostelite[]> {
    try {
      const s = search.trim();
      if (s.length < 2) return [];
      const supabase = createClientSupabaseClient();
      let query = supabase
        .from('learners_profiles')
        .select(LEARNER_SELECT)
        .neq('accommodation_type', 'HOSTEL')
        .or(
          `roll_number.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,student_email.ilike.%${s}%`,
        )
        .limit(limit);
      if (institutionId) query = query.eq('institution_id', institutionId);
      const { data, error } = await query;
      if (error) {
        logger.error('campus-living/learner-hostelite', 'searchCandidates failed', error);
        throw error;
      }
      return (data ?? []) as LearnerHostelite[];
    } catch (error) {
      logger.error('campus-living/learner-hostelite', 'Unexpected error in searchCandidates', error);
      throw error;
    }
  }
}
