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
  // Typed as any because startup-studio tables are not yet in generated database types
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  static async validateRegistration(eventId: string, userId: string): Promise<ValidationResult> {
    const [{ data: event, error: eventError }, { data: userProfile }] = await Promise.all([
      this.supabase.from('startup_events').select('id, status, registration_deadline, config').eq('id', eventId).single(),
      this.supabase.from('profiles').select('is_super_admin, role').eq('id', userId).maybeSingle(),
    ]);

    if (eventError || !event) {
      return { valid: false, error: 'Event not found' };
    }

    const isAdmin = userProfile?.is_super_admin || ['super_admin', 'admin', 'administrator'].includes(userProfile?.role || '');

    if (!isAdmin) {
      if (event.status !== 'registration_open') {
        return { valid: false, error: 'Registration is not open for this event' };
      }
      if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
        return { valid: false, error: 'Registration deadline has passed' };
      }
    }

    // Check if user already owns a team for this event
    const { data: existingOwner } = await this.supabase
      .from('event_registrations')
      .select('id, team_name')
      .eq('event_id', eventId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (existingOwner) {
      return { valid: false, error: `You already registered team "${existingOwner.team_name}" for this event` };
    }

    // Check if user is already an accepted member of another team for this event
    const { data: eventRegs } = await this.supabase
      .from('event_registrations')
      .select('id')
      .eq('event_id', eventId);

    const regIds = (eventRegs || []).map((r: any) => r.id);

    if (regIds.length > 0) {
      const { data: existingMember } = await this.supabase
        .from('event_team_members')
        .select('id')
        .in('registration_id', regIds)
        .eq('profile_id', userId)
        .eq('status', 'accepted')
        .maybeSingle();

      if (existingMember) {
        return { valid: false, error: 'You are already a member of another team for this event' };
      }
    }

    return { valid: true };
  }

  static async registerTeam(dto: CreateRegistrationDto, userId: string): Promise<EventRegistration> {
    const validation = await this.validateRegistration(dto.event_id, userId);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Note: dto.members is intentionally not processed here.
    // Team members are added post-registration via inviteMember().

    const { data: profile } = await this.supabase
      .from('profiles')
      .select('institution_id, is_super_admin, role, email, full_name, learner_id')
      .eq('id', userId)
      .single();

    let institutionId = profile?.institution_id || dto.institution_id;
    if (!institutionId) {
      const isSuperAdmin = profile?.is_super_admin || ['super_admin', 'admin', 'administrator'].includes(profile?.role);
      if (isSuperAdmin) {
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

    // Generate institution-wise team code via DB function (MAX-based, race-condition safe)
    // Retry up to 3 times on duplicate team code (23505) — extremely rare concurrent registrations
    let registration: any = null;
    let lastRegError: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: codeResult, error: codeError } = await this.supabase
        .rpc('generate_team_code', { p_event_id: dto.event_id, p_institution_id: institutionId });

      if (codeError) {
        console.error('[startup/registration] generate_team_code failed:', codeError);
      }

      const { data, error: regError } = await this.supabase
        .from('event_registrations')
        .insert({
          event_id: dto.event_id,
          team_name: dto.team_name,
          team_code: codeResult || null,
          problem_idea: dto.problem_idea || null,
          owner_id: userId,
          institution_id: institutionId,
        })
        .select()
        .single();

      if (!regError) {
        registration = data;
        break;
      }

      lastRegError = regError;
      // Retry only on duplicate team code — any other error is fatal
      if (regError.code !== '23505' || !regError.message?.includes('team_code')) {
        console.error('[startup/registration] registerTeam insert failed:', regError);
        throw new Error('Failed to create team registration. Please try again.');
      }
      console.warn(`[startup/registration] Duplicate team code on attempt ${attempt + 1}, retrying...`);
    }

    if (!registration) {
      console.error('[startup/registration] registerTeam failed after retries:', lastRegError);
      throw new Error('Failed to create team registration. Please try again.');
    }

    // Auto-add team leader as accepted member with is_leader=true
    const { error: leaderError } = await this.supabase
      .from('event_team_members')
      .insert({
        registration_id: registration.id,
        profile_id: userId,
        learner_id: profile?.learner_id || null,
        email: profile?.email || '',
        full_name: profile?.full_name || null,
        has_laptop: false,
        status: 'accepted',
        is_leader: true,
      });

    if (leaderError) {
      console.error('[startup/registration] auto-add leader failed:', leaderError);
    }

    return registration as unknown as EventRegistration;
  }

  static async getRegistrations(filters: RegistrationFilters): Promise<EventRegistration[]> {
    let query = this.supabase
      .from('event_registrations')
      .select(`
        *,
        owner:profiles!event_registrations_owner_id_fkey(id, full_name, email, avatar_url),
        institution:institutions(id, name),
        team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id, learner_id, status, is_leader, responded_at)
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

    let query = this.supabase
      .from('event_registrations')
      .select(`
        *,
        owner:profiles!event_registrations_owner_id_fkey(id, full_name, email, avatar_url),
        institution:institutions(id, name),
        team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id, learner_id, status, is_leader, responded_at)
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
        team_members:event_team_members(id, email, full_name, student_id, has_laptop, profile_id, learner_id, status, is_leader, responded_at),
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

  static async inviteMember(
    registrationId: string,
    eventId: string,
    student: { learner_id: string; profile_id: string | null; email: string; full_name?: string; roll_number?: string },
    invitedByProfileId: string
  ): Promise<EventTeamMember> {
    // Validate team size limit
    const { data: reg, error: regFetchError } = await this.supabase
      .from('event_registrations')
      .select('id, event:startup_events(config), team_members:event_team_members(id, status)')
      .eq('id', registrationId)
      .single();

    if (regFetchError || !reg) {
      throw new Error('Registration not found');
    }

    const maxSize: number = (reg as any)?.event?.config?.team_max_size || 5;
    const activeCount = ((reg as any)?.team_members || []).filter(
      (m: any) => m.status === 'accepted' || m.status === 'pending'
    ).length;
    if (activeCount >= maxSize) {
      throw new Error(`Team is full (max ${maxSize} members including leader)`);
    }

    // Validate invitee not already in another team for this event
    if (student.profile_id) {
      const { data: existingOwner } = await this.supabase
        .from('event_registrations')
        .select('id, team_name')
        .eq('event_id', eventId)
        .eq('owner_id', student.profile_id)
        .maybeSingle();

      if (existingOwner) {
        throw new Error(`This student is already a team leader for "${(existingOwner as any).team_name}"`);
      }

      // Check if already accepted/pending in any team for this event
      const { data: eventRegs } = await this.supabase
        .from('event_registrations')
        .select('id')
        .eq('event_id', eventId);

      const regIds = (eventRegs || []).map((r: any) => r.id);

      if (regIds.length > 0) {
        const { data: existingMember } = await this.supabase
          .from('event_team_members')
          .select('id, status')
          .in('registration_id', regIds)
          .eq('profile_id', student.profile_id)
          .in('status', ['pending', 'accepted'])
          .maybeSingle();

        if (existingMember) {
          const memberStatus = (existingMember as any).status;
          throw new Error(
            memberStatus === 'accepted'
              ? 'This student is already in another team for this event'
              : 'This student already has a pending invitation for this event'
          );
        }
      }
    }

    // Block only if the student is already an accepted member of this team.
    // Pending → re-invite is allowed (upsert resets the invitation).
    // Declined → re-invite is allowed (upsert creates a fresh pending invite).
    const { data: alreadyAccepted } = await this.supabase
      .from('event_team_members')
      .select('id')
      .eq('registration_id', registrationId)
      .eq('learner_id', student.learner_id)
      .eq('status', 'accepted')
      .maybeSingle();

    if (alreadyAccepted) {
      throw new Error('This student is already an accepted member of your team');
    }

    // Upsert on (registration_id, email) — handles re-inviting after a decline
    const { data, error } = await this.supabase
      .from('event_team_members')
      .upsert({
        registration_id: registrationId,
        profile_id: student.profile_id,
        learner_id: student.learner_id,
        email: student.email,
        full_name: student.full_name || null,
        student_id: student.roll_number || null,
        has_laptop: false,
        status: 'pending',
        is_leader: false,
        responded_at: null,
      }, { onConflict: 'registration_id,email' })
      .select()
      .single();

    if (error) {
      console.error('[startup/registration] inviteMember failed:', error);
      throw error;
    }
    return data as unknown as EventTeamMember;
  }

  static async respondToInvitation(
    memberId: string,
    profileId: string,
    accept: boolean
  ): Promise<void> {
    const { data: member, error: fetchError } = await this.supabase
      .from('event_team_members')
      .select('id, status, profile_id, registration_id')
      .eq('id', memberId)
      .single();

    if (fetchError || !member) {
      throw new Error('Invitation not found');
    }
    if ((member as any).profile_id !== profileId) {
      throw new Error('This invitation does not belong to you');
    }
    if ((member as any).status !== 'pending') {
      throw new Error('This invitation has already been responded to');
    }

    if (accept) {
      // Get the event_id for this registration
      const { data: reg } = await this.supabase
        .from('event_registrations')
        .select('event_id')
        .eq('id', (member as any).registration_id)
        .single();

      const eventId = (reg as any)?.event_id;

      if (eventId) {
        // One-team rule: check if invitee is already a team owner
        const { data: alreadyOwner } = await this.supabase
          .from('event_registrations')
          .select('id')
          .eq('event_id', eventId)
          .eq('owner_id', profileId)
          .maybeSingle();

        if (alreadyOwner) {
          throw new Error('You are already a team leader for this event');
        }

        // One-team rule: check if invitee is already accepted in another team
        const { data: eventRegs } = await this.supabase
          .from('event_registrations')
          .select('id')
          .eq('event_id', eventId);

        const regIds = (eventRegs || []).map((r: any) => r.id);

        if (regIds.length > 0) {
          const { data: alreadyMember } = await this.supabase
            .from('event_team_members')
            .select('id')
            .in('registration_id', regIds)
            .eq('profile_id', profileId)
            .eq('status', 'accepted')
            .neq('id', memberId)
            .maybeSingle();

          if (alreadyMember) {
            throw new Error('You are already part of another team for this event');
          }
        }
      }
    }

    const { error: updateError } = await this.supabase
      .from('event_team_members')
      .update({
        status: accept ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('id', memberId);

    if (updateError) {
      console.error('[startup/registration] respondToInvitation failed:', updateError);
      throw new Error('Failed to update invitation. Please try again.');
    }
  }

  static async getMyPendingInvitations(profileId: string): Promise<import('@/types/startup-studio').PendingInvitation[]> {
    const { data, error } = await this.supabase
      .rpc('get_my_pending_invitations', { p_profile_id: profileId });

    if (error) {
      console.error('[startup/registration] getMyPendingInvitations failed:', error);
      throw error;
    }

    return (data || []) as import('@/types/startup-studio').PendingInvitation[];
  }

  static async getMyAcceptedMembership(eventId: string, profileId: string) {
    return this.supabase.rpc('get_my_event_team', {
      p_profile_id: profileId,
      p_event_id: eventId,
    });
  }

  static async getMyTeamMembers(eventId: string, profileId: string) {
    return this.supabase.rpc('get_my_team_members', {
      p_profile_id: profileId,
      p_event_id: eventId,
    });
  }

  static async updateMemberLaptop(memberId: string, hasLaptop: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('event_team_members')
      .update({ has_laptop: hasLaptop })
      .eq('id', memberId);

    if (error) {
      console.error('[startup/registration] updateMemberLaptop failed:', error);
      throw new Error('Failed to update laptop status.');
    }
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

  static async updateRegistrationStatus(registrationId: string, status: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_registrations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', registrationId);

    if (error) {
      console.error('[startup/registration] updateRegistrationStatus failed:', error);
      throw new Error('Failed to update registration status. Please try again.');
    }
  }

  static async deleteRegistration(registrationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_registrations')
      .delete()
      .eq('id', registrationId);

    if (error) {
      console.error('[startup/registration] deleteRegistration failed:', error);
      throw new Error('Failed to delete registration. Please try again.');
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

  static async updateTeamName(registrationId: string, ownerId: string, teamName: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_registrations')
      .update({
        team_name: teamName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId)
      .eq('owner_id', ownerId);

    if (error) {
      console.error('[startup/registration] updateTeamName failed:', error);
      throw new Error('Failed to update team name. Please try again.');
    }
  }

  static async updateProblemIdea(registrationId: string, ownerId: string, problemIdea: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_registrations')
      .update({
        problem_idea: problemIdea || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrationId)
      .eq('owner_id', ownerId);

    if (error) {
      console.error('[startup/registration] updateProblemIdea failed:', error);
      throw new Error('Failed to update problem idea. Please try again.');
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
