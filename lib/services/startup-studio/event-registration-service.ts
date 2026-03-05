import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventRegistration,
  CreateRegistrationDto,
  CreateTeamMemberDto,
  EventTeamMember,
  PaginatedRegistrations,
  RegistrationFilters,
  ValidationResult,
} from '@/types/startup-studio';

export class EventRegistrationService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async validateRegistration(eventId: string, userId: string, members: CreateTeamMemberDto[]): Promise<ValidationResult> {
    const { data: event, error: eventError } = await this.supabase
      .from('startup_events')
      .select('id, status, registration_deadline, config')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return { valid: false, error: 'Event not found' };
    }
    if (event.status !== 'registration_open') {
      return { valid: false, error: 'Registration is not open for this event' };
    }
    if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
      return { valid: false, error: 'Registration deadline has passed' };
    }

    const maxSize = event.config?.team_max_size || 5;
    if (members.length > maxSize) {
      return { valid: false, error: `Maximum ${maxSize} team members allowed` };
    }

    const { data: existing } = await this.supabase
      .from('event_registrations')
      .select('id, team_name')
      .eq('event_id', eventId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (existing) {
      return { valid: false, error: `You already registered team "${existing.team_name}" for this event` };
    }

    const memberEmails = members.map(m => m.email);
    if (memberEmails.length > 0) {
      const { data: existingMembers } = await this.supabase
        .from('event_team_members')
        .select('email, registration:event_registrations!inner(event_id)')
        .in('email', memberEmails);

      const conflicting = (existingMembers || []).filter(
        (m: any) => m.registration?.event_id === eventId
      );
      if (conflicting.length > 0) {
        const emails = conflicting.map((m: any) => m.email).join(', ');
        return { valid: false, error: `Some members are already registered with another team: ${emails}` };
      }
    }

    return { valid: true };
  }

  static async registerTeam(dto: CreateRegistrationDto, userId: string): Promise<EventRegistration> {
    const validation = await this.validateRegistration(dto.event_id, userId, dto.members);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const { data: profile } = await this.supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role')
      .eq('id', userId)
      .single();

    // Super admins may not have institution_id — allow DTO override or first available
    let institutionId = profile?.institution_id || dto.institution_id;
    if (!institutionId) {
      const isSuperAdmin = profile?.is_super_admin || profile?.role === 'super_admin' || profile?.role === 'admin' || profile?.role === 'administrator';
      if (isSuperAdmin) {
        // Fallback: get first institution
        const { data: firstInst } = await this.supabase
          .from('institutions')
          .select('id')
          .limit(1)
          .single();
        institutionId = firstInst?.id;
      }
      if (!institutionId) {
        throw new Error('Your profile is not linked to an institution');
      }
    }

    const { data: registration, error: regError } = await this.supabase
      .from('event_registrations')
      .insert({
        event_id: dto.event_id,
        team_name: dto.team_name,
        problem_idea: dto.problem_idea,
        owner_id: userId,
        institution_id: institutionId,
      })
      .select()
      .single();

    if (regError) {
      console.error('[startup/registration] registerTeam insert failed:', regError);
      throw regError;
    }

    if (dto.members.length > 0) {
      const membersToInsert = dto.members.map(m => ({
        registration_id: registration.id,
        email: m.email,
        full_name: m.full_name || null,
        student_id: m.student_id || null,
        has_laptop: m.has_laptop || false,
      }));

      const { error: membersError } = await this.supabase
        .from('event_team_members')
        .insert(membersToInsert);

      if (membersError) {
        console.error('[startup/registration] insertMembers failed:', membersError);
      }
    }

    return registration as unknown as EventRegistration;
  }

  static async getRegistrations(filters: RegistrationFilters): Promise<EventRegistration[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids TS infinite type instantiation with nested Supabase selects
    let query: any = this.supabase
      .from('event_registrations')
      .select(`
        *,
        owner:profiles!event_registrations_owner_id_fkey(id, full_name, email, avatar_url),
        institution:institutions(id, name),
        team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id)
      `)
      .eq('event_id', filters.event_id)
      .order('created_at', { ascending: true });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.checked_in !== undefined) query = query.eq('checked_in', filters.checked_in);
    if (filters.lovable_verified !== undefined) query = query.eq('lovable_verified', filters.lovable_verified);
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.search) {
      query = query.or(`team_name.ilike.%${filters.search}%,problem_idea.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/registration] getRegistrations failed:', error);
      throw error;
    }
    return (data || []) as unknown as EventRegistration[];
  }

  static async getRegistrationsPaginated(filters: RegistrationFilters): Promise<PaginatedRegistrations> {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids TS infinite type instantiation with nested Supabase selects
    let query: any = this.supabase
      .from('event_registrations')
      .select(`
        *,
        owner:profiles!event_registrations_owner_id_fkey(id, full_name, email, avatar_url),
        institution:institutions(id, name),
        team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id)
      `, { count: 'exact' })
      .eq('event_id', filters.event_id)
      .order('created_at', { ascending: true })
      .range(from, to);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.checked_in !== undefined) query = query.eq('checked_in', filters.checked_in);
    if (filters.lovable_verified !== undefined) query = query.eq('lovable_verified', filters.lovable_verified);
    if (filters.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters.search) {
      query = query.or(`team_name.ilike.%${filters.search}%,problem_idea.ilike.%${filters.search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('[startup/registration] getRegistrationsPaginated failed:', error);
      throw error;
    }

    const totalItems = count || 0;
    return {
      data: (data || []) as unknown as EventRegistration[],
      pagination: {
        page,
        limit,
        total_items: totalItems,
        total_pages: Math.ceil(totalItems / limit),
      },
    };
  }

  static async getMyRegistration(eventId: string, userId: string): Promise<EventRegistration | null> {
    const { data, error } = await this.supabase
      .from('event_registrations')
      .select(`
        *,
        owner:profiles!event_registrations_owner_id_fkey(id, full_name, email),
        institution:institutions(id, name),
        team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id),
        venue_allocations:event_team_venue_allocations(
          id, day_type,
          venue_assignment:event_venue_assignments(
            id, manual_name, manual_building, manual_room, day_type, capacity_override,
            resource:resources(id, name, building_number, room_number),
            staff_assignments:event_staff_assignments(
              id, role,
              staff:staff(id, first_name, last_name, email)
            )
          )
        ),
        submission:event_submissions(*)
      `)
      .eq('event_id', eventId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[startup/registration] getMyRegistration failed:', error);
      throw error;
    }
    return data as unknown as EventRegistration | null;
  }

  static async addMember(registrationId: string, member: CreateTeamMemberDto): Promise<EventTeamMember> {
    const { data, error } = await this.supabase
      .from('event_team_members')
      .insert({
        registration_id: registrationId,
        email: member.email,
        full_name: member.full_name || null,
        student_id: member.student_id || null,
        has_laptop: member.has_laptop || false,
      })
      .select()
      .single();

    if (error) {
      console.error('[startup/registration] addMember failed:', error);
      throw error;
    }
    return data as unknown as EventTeamMember;
  }

  static async removeMember(memberId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      console.error('[startup/registration] removeMember failed:', error);
      throw error;
    }
  }

  static async toggleCheckIn(registrationId: string, userId: string, checked_in: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('event_registrations')
      .update({
        checked_in,
        checked_in_at: checked_in ? new Date().toISOString() : null,
        checked_in_by: checked_in ? userId : null,
        status: checked_in ? 'checked_in' : 'registered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      console.error('[startup/registration] toggleCheckIn failed:', error);
      throw error;
    }
  }

  static async toggleLovableVerified(registrationId: string, userId: string, verified: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('event_registrations')
      .update({
        lovable_verified: verified,
        lovable_verified_at: verified ? new Date().toISOString() : null,
        lovable_verified_by: verified ? userId : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId);

    if (error) {
      console.error('[startup/registration] toggleLovableVerified failed:', error);
      throw error;
    }
  }

  static async lookupMemberByEmail(email: string): Promise<{ profile_id: string; full_name: string; student_id?: string } | null> {
    const { data } = await this.supabase
      .from('profiles')
      .select('id, full_name, learner_id')
      .eq('email', email)
      .maybeSingle();

    if (!data) return null;
    return {
      profile_id: data.id,
      full_name: data.full_name || '',
      student_id: data.learner_id || undefined,
    };
  }
}
