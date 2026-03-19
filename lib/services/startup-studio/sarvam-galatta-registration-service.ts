import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  StudentAutoFillProfile,
  SarvamGalattaRegistrationDto,
  SarvamGalattaRegistration,
  SarvamGalattaStats,
  SarvamGalattaRegistrationFilters,
  SarvamGalattaPaginatedResult,
} from '@/types/sarvam-galatta';

const SARVAM_GALATTA_EVENT_ID = 'ad357482-7087-4390-ac75-ad4c13838d4f';

export class SarvamGalattaRegistrationService {
  // Typed as any — startup-studio tables not yet in generated database types
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  // ---------------------------------------------------------------
  // Fetch learner profile for auto-fill (5-table JOIN)
  // Returns null if user has no linked learner record
  // ---------------------------------------------------------------
  static async getLearnerAutoFill(userId: string): Promise<StudentAutoFillProfile | null> {
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('learner_id')
      .eq('id', userId)
      .maybeSingle();

    if (!profile?.learner_id) return null;

    const { data: learner, error } = await this.supabase
      .from('learners_profiles')
      .select(`
        id,
        first_name,
        last_name,
        institution_id,
        degree_id,
        department_id,
        program_id,
        semester_id,
        section_id,
        institutions ( name ),
        departments ( department_name ),
        programs ( program_name ),
        semesters ( semester_name ),
        sections ( section_name )
      `)
      .eq('id', profile.learner_id)
      .maybeSingle();

    if (error || !learner) return null;

    // Degree name requires separate query (no direct FK relation name available)
    let degree_name: string | null = null;
    if (learner.degree_id) {
      const { data: degree } = await this.supabase
        .from('degrees')
        .select('degree_name')
        .eq('id', learner.degree_id)
        .maybeSingle();
      degree_name = degree?.degree_name ?? null;
    }

    return {
      learner_id: learner.id,
      first_name: learner.first_name,
      last_name: learner.last_name ?? null,
      full_name: [learner.first_name, learner.last_name].filter(Boolean).join(' '),
      institution_id: learner.institution_id ?? null,
      institution_name: learner.institutions?.name ?? null,
      degree_id: learner.degree_id ?? null,
      degree_name,
      department_id: learner.department_id ?? null,
      department_name: learner.departments?.department_name ?? null,
      program_id: learner.program_id ?? null,
      program_name: learner.programs?.program_name ?? null,
      semester_id: learner.semester_id ?? null,
      semester_name: learner.semesters?.semester_name ?? null,
      section_id: learner.section_id ?? null,
      section_name: learner.sections?.section_name ?? null,
    };
  }

  // ---------------------------------------------------------------
  // Get student's own registration (returns null if not registered)
  // ---------------------------------------------------------------
  static async getMyRegistration(userId: string): Promise<SarvamGalattaRegistration | null> {
    const { data, error } = await this.supabase
      .from('sarvam_galatta_registrations')
      .select(`
        *,
        event_registrations!registration_id (
          owner_id,
          institution_id,
          team_name,
          team_code,
          status
        )
      `)
      .eq('event_id', SARVAM_GALATTA_EVENT_ID)
      .maybeSingle();

    if (error || !data) return null;

    const er = data.event_registrations;
    return {
      ...data,
      owner_id: er?.owner_id,
      institution_id: er?.institution_id,
      team_name: er?.team_name,
      team_code: er?.team_code,
      status: er?.status,
    };
  }

  // ---------------------------------------------------------------
  // Create registration — inserts event_registrations + sarvam_galatta_registrations
  // ---------------------------------------------------------------
  static async createRegistration(
    dto: SarvamGalattaRegistrationDto,
    userId: string
  ): Promise<SarvamGalattaRegistration> {
    // 1. Validate user role and learner profile
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('is_super_admin, role, learner_id, institution_id')
      .eq('id', userId)
      .single();

    const isSuperAdmin = profile?.is_super_admin || profile?.role === 'super_admin';
    const isStudent = profile?.role === 'student';

    if (!isStudent && !isSuperAdmin) {
      throw new Error('Only students can register for this event.');
    }

    if (isStudent && !profile?.learner_id) {
      throw new Error('Your profile is not linked to a learner record. Please contact admin.');
    }

    // 2. Check event deadline (superadmin bypasses)
    if (!isSuperAdmin) {
      const { data: event } = await this.supabase
        .from('startup_events')
        .select('registration_deadline, status')
        .eq('id', dto.event_id)
        .single();

      if (event?.status !== 'registration_open') {
        throw new Error('Registration is not currently open for this event.');
      }
      if (event?.registration_deadline && new Date(event.registration_deadline) < new Date()) {
        throw new Error('Registration deadline has passed.');
      }
    }

    // 3. Check for existing registration
    const existing = await this.getMyRegistration(userId);
    if (existing) {
      throw new Error('You have already registered for this event.');
    }

    // 4. Fetch learner profile for snapshot + institution_id
    const learnerProfile = profile?.learner_id
      ? await this.getLearnerAutoFill(userId)
      : null;

    // Resolve institution_id: learner → profile → event host (fallback chain)
    let institutionId = learnerProfile?.institution_id ?? profile?.institution_id ?? null;
    if (!institutionId) {
      const { data: event } = await this.supabase
        .from('startup_events')
        .select('host_institution_id')
        .eq('id', dto.event_id)
        .single();
      institutionId = event?.host_institution_id ?? null;
    }
    if (!institutionId) {
      // Last resort: first institution in system
      const { data: firstInst } = await this.supabase
        .from('institutions')
        .select('id')
        .limit(1)
        .single();
      institutionId = firstInst?.id ?? null;
    }
    if (!institutionId) {
      throw new Error('Could not determine institution. Please complete your learner profile.');
    }

    // 5. Generate team code and create event_registrations base record
    const { data: codeResult } = await this.supabase
      .rpc('generate_team_code', { p_event_id: dto.event_id, p_institution_id: institutionId });

    const { data: eventReg, error: regError } = await this.supabase
      .from('event_registrations')
      .insert({
        event_id: dto.event_id,
        team_name: dto.team_name,
        team_code: codeResult ?? null,
        owner_id: userId,
        institution_id: institutionId,
      })
      .select()
      .single();

    if (regError) {
      console.error('[startup/sarvam-galatta] event_registrations insert failed:', regError);
      throw new Error('Registration failed. Please try again.');
    }

    // 6. Insert sarvam_galatta_registrations extension record
    const now = new Date().toISOString();
    const { data: sgrData, error: sgrError } = await this.supabase
      .from('sarvam_galatta_registrations')
      .insert({
        event_id: dto.event_id,
        registration_id: eventReg.id,
        learner_id: profile.learner_id,
        snap_first_name: learnerProfile?.first_name ?? profile?.full_name?.split(' ')[0] ?? 'Student',
        snap_last_name: learnerProfile?.last_name ?? null,
        snap_institution_id: learnerProfile?.institution_id ?? null,
        snap_degree_id: learnerProfile?.degree_id ?? null,
        snap_department_id: learnerProfile?.department_id ?? null,
        snap_program_id: learnerProfile?.program_id ?? null,
        snap_semester_id: learnerProfile?.semester_id ?? null,
        snap_section_id: learnerProfile?.section_id ?? null,
        project_url: dto.project_url ?? null,
        github_url: dto.github_url ?? null,
        supabase_project_url: dto.supabase_project_url ?? null,
        gemini_api_key: dto.gemini_api_key ?? null,
        google_maps_api_key: dto.google_maps_api_key ?? null,
        submitted_at: now,
        last_edited_at: now,
      })
      .select()
      .single();

    if (sgrError) {
      // Rollback event_registrations if sarvam_galatta insert fails
      await this.supabase.from('event_registrations').delete().eq('id', eventReg.id);
      console.error('[startup/sarvam-galatta] sarvam_galatta_registrations insert failed:', sgrError);
      throw new Error('Registration failed while saving project details. Please try again.');
    }

    return {
      ...sgrData,
      owner_id: userId,
      institution_id: institutionId,
      team_name: dto.team_name,
      team_code: codeResult ?? null,
      status: 'registered',
    };
  }

  // ---------------------------------------------------------------
  // Update registration — only allowed before deadline (student)
  // ---------------------------------------------------------------
  static async updateRegistration(
    sarvamGalattaId: string,
    dto: Partial<Pick<SarvamGalattaRegistrationDto, 'team_name' | 'project_url' | 'github_url' | 'supabase_project_url' | 'gemini_api_key' | 'google_maps_api_key'>>,
    userId: string
  ): Promise<SarvamGalattaRegistration> {
    // Verify ownership
    const existing = await this.getMyRegistration(userId);
    if (!existing || existing.id !== sarvamGalattaId) {
      throw new Error('Registration not found or you do not have permission to edit it.');
    }

    // Check deadline (superadmin bypasses)
    const { data: profile } = await this.supabase
      .from('profiles')
      .select('is_super_admin, role')
      .eq('id', userId)
      .single();

    const isSuperAdmin = profile?.is_super_admin || profile?.role === 'super_admin';

    if (!isSuperAdmin) {
      const { data: event } = await this.supabase
        .from('startup_events')
        .select('registration_deadline')
        .eq('id', existing.event_id)
        .single();

      if (event?.registration_deadline && new Date(event.registration_deadline) < new Date()) {
        throw new Error('Registration deadline has passed. Edits are no longer allowed.');
      }
    }

    // Build update payload for sarvam_galatta_registrations
    const sgrUpdates: Record<string, unknown> = { last_edited_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    if (dto.project_url !== undefined)          sgrUpdates.project_url = dto.project_url || null;
    if (dto.github_url !== undefined)           sgrUpdates.github_url = dto.github_url || null;
    if (dto.supabase_project_url !== undefined) sgrUpdates.supabase_project_url = dto.supabase_project_url || null;
    if (dto.gemini_api_key !== undefined)       sgrUpdates.gemini_api_key = dto.gemini_api_key;
    if (dto.google_maps_api_key !== undefined)  sgrUpdates.google_maps_api_key = dto.google_maps_api_key || null;

    const { data: updated, error } = await this.supabase
      .from('sarvam_galatta_registrations')
      .update(sgrUpdates)
      .eq('id', sarvamGalattaId)
      .select()
      .single();

    if (error) {
      console.error('[startup/sarvam-galatta] update failed:', error);
      throw new Error('Failed to update registration. Please try again.');
    }

    // Also update team_name in event_registrations if provided
    if (dto.team_name && existing.registration_id) {
      await this.supabase
        .from('event_registrations')
        .update({ team_name: dto.team_name, updated_at: new Date().toISOString() })
        .eq('id', existing.registration_id);
    }

    return { ...existing, ...updated };
  }

  // ---------------------------------------------------------------
  // Admin: paginated list of all registrations with display names
  // ---------------------------------------------------------------
  static async getAllRegistrations(
    filters: SarvamGalattaRegistrationFilters
  ): Promise<SarvamGalattaPaginatedResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 25;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from('sarvam_galatta_registrations')
      .select(`
        *,
        event_registrations!registration_id (
          owner_id,
          institution_id,
          team_name,
          team_code,
          status,
          profiles!owner_id ( full_name, email )
        ),
        institutions:snap_institution_id ( name ),
        departments:snap_department_id ( department_name ),
        programs:snap_program_id ( program_name ),
        semesters:snap_semester_id ( semester_name )
      `, { count: 'exact' })
      .eq('event_id', filters.event_id)
      .order('submitted_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.institution_id) {
      query = query.eq('snap_institution_id', filters.institution_id);
    }

    if (filters.search) {
      query = query.or(
        `snap_first_name.ilike.%${filters.search}%,snap_last_name.ilike.%${filters.search}%,project_url.ilike.%${filters.search}%,github_url.ilike.%${filters.search}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[startup/sarvam-galatta] getAllRegistrations failed:', error);
      throw new Error('Failed to fetch registrations.');
    }

    const mapped: SarvamGalattaRegistration[] = (data ?? []).map((row: any) => {
      const er = row.event_registrations;
      return {
        ...row,
        owner_id: er?.owner_id,
        institution_id: er?.institution_id,
        team_name: er?.team_name,
        team_code: er?.team_code,
        status: er?.status,
        owner_full_name: er?.profiles?.full_name ?? null,
        owner_email: er?.profiles?.email ?? null,
        institution_name: row.institutions?.name ?? null,
        department_name: row.departments?.department_name ?? null,
        program_name: row.programs?.program_name ?? null,
        semester_name: row.semesters?.semester_name ?? null,
      };
    });

    return { data: mapped, total: count ?? 0, page, limit };
  }

  // ---------------------------------------------------------------
  // Admin: registration statistics
  // ---------------------------------------------------------------
  static async getStats(eventId: string): Promise<SarvamGalattaStats> {
    const { data: rows, error } = await this.supabase
      .from('sarvam_galatta_registrations')
      .select(`
        id,
        google_maps_api_key,
        snap_institution_id,
        snap_program_id,
        snap_semester_id,
        submitted_at,
        institutions:snap_institution_id ( name ),
        programs:snap_program_id ( program_name ),
        semesters:snap_semester_id ( semester_name )
      `)
      .eq('event_id', eventId);

    if (error) {
      console.error('[startup/sarvam-galatta] getStats failed:', error);
      throw new Error('Failed to fetch statistics.');
    }

    const total = rows?.length ?? 0;
    const with_maps_key = (rows ?? []).filter((r: any) => !!r.google_maps_api_key).length;

    // Group by institution
    const instMap = new Map<string, { institution_name: string; count: number }>();
    for (const row of rows ?? []) {
      if (!row.snap_institution_id) continue;
      const key = row.snap_institution_id;
      if (!instMap.has(key)) {
        instMap.set(key, { institution_name: row.institutions?.name ?? key, count: 0 });
      }
      instMap.get(key)!.count++;
    }

    // Group by program
    const progMap = new Map<string, { program_name: string; count: number }>();
    for (const row of rows ?? []) {
      if (!row.snap_program_id) continue;
      const key = row.snap_program_id;
      if (!progMap.has(key)) {
        progMap.set(key, { program_name: row.programs?.program_name ?? key, count: 0 });
      }
      progMap.get(key)!.count++;
    }

    // Group by semester
    const semMap = new Map<string, { semester_name: string; count: number }>();
    for (const row of rows ?? []) {
      if (!row.snap_semester_id) continue;
      const key = row.snap_semester_id;
      if (!semMap.has(key)) {
        semMap.set(key, { semester_name: row.semesters?.semester_name ?? key, count: 0 });
      }
      semMap.get(key)!.count++;
    }

    // Registrations per day
    const dayMap = new Map<string, number>();
    for (const row of rows ?? []) {
      const day = row.submitted_at?.substring(0, 10) ?? 'unknown';
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }

    return {
      total,
      with_maps_key,
      by_institution: Array.from(instMap.entries()).map(([id, v]) => ({
        institution_id: id,
        institution_name: v.institution_name,
        count: v.count,
      })),
      by_program: Array.from(progMap.entries()).map(([id, v]) => ({
        program_id: id,
        program_name: v.program_name,
        count: v.count,
      })),
      by_semester: Array.from(semMap.entries()).map(([id, v]) => ({
        semester_id: id,
        semester_name: v.semester_name,
        count: v.count,
      })),
      registrations_per_day: Array.from(dayMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    };
  }
}
