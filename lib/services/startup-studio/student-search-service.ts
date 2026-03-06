import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { StudentSearchFilters, StudentSearchResult } from '@/types/startup-studio';

export class StudentSearchService {
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  /**
   * Search learners_profiles with cascading hierarchy filters.
   * Returns students with their auth profile_id resolved via profiles.learner_id.
   * Two-step: (1) fetch matching learners, (2) resolve profile_ids.
   */
  static async searchStudents(filters: StudentSearchFilters): Promise<StudentSearchResult[]> {
    // Step 1: Build learners query with hierarchy filters
    let query = this.supabase
      .from('learners_profiles')
      .select(`
        id,
        first_name,
        last_name,
        college_email,
        student_email,
        roll_number,
        institution_id,
        institution:institutions(id, name),
        degree:degrees(id, degree_name),
        department:departments(id, department_name),
        program:programs(id, program_name),
        semester:semesters(id, semester_name)
      `)
      .eq('lifecycle_status', 'active')
      .order('first_name', { ascending: true })
      .limit(100);

    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.degree_id)      query = query.eq('degree_id', filters.degree_id);
    if (filters.department_id)  query = query.eq('department_id', filters.department_id);
    if (filters.program_id)     query = query.eq('program_id', filters.program_id);
    if (filters.semester_id)    query = query.eq('semester_id', filters.semester_id);

    if (filters.search) {
      const s = `%${filters.search}%`;
      query = query.or(`first_name.ilike.${s},last_name.ilike.${s},roll_number.ilike.${s}`);
    }

    const { data: learners, error } = await query;
    if (error) {
      console.error('[startup/student-search] searchStudents failed:', error);
      throw error;
    }
    if (!learners || learners.length === 0) return [];

    // Step 2: Resolve auth profile_ids for these learners
    const learnerIds = learners.map((l: any) => l.id);
    const { data: profileLinks } = await this.supabase
      .from('profiles')
      .select('id, learner_id')
      .in('learner_id', learnerIds);

    const profileMap: Record<string, string> = {};
    (profileLinks || []).forEach((p: any) => {
      if (p.learner_id) profileMap[p.learner_id] = p.id;
    });

    // Step 3: Exclude students already accepted in a team for this event
    const excludedProfileIds = await this.getAlreadyTeamedProfileIds(filters.event_id);

    return learners
      .filter((l: any) => {
        const pid = profileMap[l.id];
        return !pid || !excludedProfileIds.has(pid);
      })
      .map((l: any) => ({
        learner_id: l.id,
        profile_id: profileMap[l.id] || null,
        first_name: l.first_name,
        last_name: l.last_name,
        college_email: l.college_email,
        student_email: l.student_email,
        roll_number: l.roll_number,
        institution_id: l.institution_id,
        institution_name: l.institution?.name || null,
        degree_name: l.degree?.degree_name || null,
        department_name: l.department?.department_name || null,
        program_name: l.program?.program_name || null,
        semester_name: l.semester?.semester_name || null,
      })) as StudentSearchResult[];
  }

  /**
   * Returns a Set of profile_ids that are already accepted members
   * (or owners) of any team for the given event.
   */
  private static async getAlreadyTeamedProfileIds(eventId: string): Promise<Set<string>> {
    const result = new Set<string>();

    // Step 1: Get all registration IDs for this event (and collect owners in one query)
    const { data: eventRegs } = await this.supabase
      .from('event_registrations')
      .select('id, owner_id')
      .eq('event_id', eventId);

    const registrationIds = (eventRegs || []).map((r: any) => r.id);

    // Add all team owners for this event
    (eventRegs || []).forEach((r: any) => {
      if (r.owner_id) result.add(r.owner_id);
    });

    // Step 2: Find accepted members within those registrations
    if (registrationIds.length > 0) {
      const { data: accepted, error: acceptedError } = await this.supabase
        .from('event_team_members')
        .select('profile_id')
        .in('registration_id', registrationIds)
        .eq('status', 'accepted')
        .not('profile_id', 'is', null);

      if (acceptedError) {
        console.error('[startup/student-search] getAlreadyTeamedProfileIds (members) failed:', acceptedError);
      }
      (accepted || []).forEach((m: any) => {
        if (m.profile_id) result.add(m.profile_id);
      });
    }

    return result;
  }

  /**
   * Load cascading dropdown options for the search filters.
   * Each level filters based on the level above.
   */
  static async getFilterOptions(filters: {
    institution_id?: string;
    degree_id?: string;
    department_id?: string;
    program_id?: string;
  }) {
    const [institutions, degrees, departments, programs, semesters] = await Promise.all([
      // Institutions — always load all
      this.supabase
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name'),

      // Degrees — filter by institution if set
      filters.institution_id
        ? this.supabase
            .from('degrees')
            .select('id, degree_name')
            .eq('institution_id', filters.institution_id)
            .eq('is_active', true)
            .order('degree_order')
        : { data: [] },

      // Departments — filter by institution + degree if set
      filters.institution_id && filters.degree_id
        ? this.supabase
            .from('departments')
            .select('id, department_name')
            .eq('institution_id', filters.institution_id)
            .eq('degree_id', filters.degree_id)
            .eq('is_active', true)
            .order('department_order')
        : { data: [] },

      // Programs — filter by dept if set
      filters.department_id
        ? this.supabase
            .from('programs')
            .select('id, program_name')
            .eq('department_id', filters.department_id)
            .eq('is_active', true)
            .order('program_name')
        : { data: [] },

      // Semesters — filter by program if set
      filters.program_id
        ? this.supabase
            .from('semesters')
            .select('id, semester_name, semester_code')
            .eq('program_id', filters.program_id)
            .eq('is_active', true)
            .order('semester_name')
        : { data: [] },
    ]);

    return {
      institutions: (institutions.data || []) as Array<{ id: string; name: string }>,
      degrees: (degrees.data || []) as Array<{ id: string; degree_name: string }>,
      departments: (departments.data || []) as Array<{ id: string; department_name: string }>,
      programs: (programs.data || []) as Array<{ id: string; program_name: string }>,
      semesters: (semesters.data || []) as Array<{ id: string; semester_name: string; semester_code: string }>,
    };
  }
}
