// lib/services/cohort-core/alumni-mentor-service.ts
// Cohort Core — M7.4 alumni→mentor flywheel service.
//
// Reads v_cohort_alumni_mentor_pool (graduated members eligible as mentors) and
// enrols a chosen alum as a mentor for a future cohort. The ENROL write goes
// through CohortService.createMembership (member_type='staff', role='mentor') so
// it inherits that path's D9 identity validation + RLS — NOT a new DEFINER RPC.
//
// CLIENT-ONLY — session-scoped browser Supabase client (RLS enforced). The view
// is security_invoker, so the pool a caller sees is already scoped to cohorts
// they can read.
// Connected to:
//   supabase/migrations/20260731095000_cohort_alumni_mentor.sql
//   lib/services/cohort-core/cohort-service.ts (createMembership)
//   hooks/cohort-core/useMoat.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { CohortService } from '@/lib/services/cohort-core/cohort-service';
import type {
  AlumniMentorPoolEntry,
  CohortMembership,
} from '@/lib/types/cohort-core';

export interface AlumniMentorFilters {
  kind?: string;
  institution_id?: string;
  source_cohort_id?: string;
}

export class AlumniMentorService {
  private static supabase = createClientSupabaseClient();

  /** Graduated members eligible as mentors for a future cohort. */
  static async getPool(
    filters: AlumniMentorFilters = {}
  ): Promise<AlumniMentorPoolEntry[]> {
    try {
      let query = (this.supabase as any)
        .from('v_cohort_alumni_mentor_pool')
        .select('*');
      if (filters.kind) query = query.eq('kind', filters.kind);
      if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
      if (filters.source_cohort_id) query = query.eq('source_cohort_id', filters.source_cohort_id);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('AlumniMentorService: getPool error:', error);
      return [];
    }
  }

  /**
   * Enrol an alum (an existing person, by profile id) as a MENTOR of a target
   * cohort. Routes through CohortService.createMembership so the D9 identity
   * guard + membership RLS apply. The caller resolves which human to make a
   * mentor (a graduated 'team' member_ref is a team, not a person — hence an
   * explicit profileId here rather than reusing the pool row's member_ref).
   */
  static async enrollAsMentor(
    targetCohortId: string,
    alumProfileId: string,
    joinedBy?: string
  ): Promise<CohortMembership> {
    return CohortService.createMembership({
      cohort_id: targetCohortId,
      member_type: 'staff',
      member_ref: alumProfileId,
      role: 'mentor',
      status: 'active',
      joined_by: joinedBy ?? null,
      config: { source: 'alumni_flywheel' },
    });
  }
}
