import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventVenueAssignment,
  EventStaffAssignment,
  CreateVenueDto,
  UpdateVenueDto,
  DayType,
  StaffRole,
} from '@/types/startup-studio';

export class EventVenueService {
  // Typed as any because startup-studio tables are not yet in generated database types
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  static async getVenues(eventId: string, dayType?: DayType): Promise<EventVenueAssignment[]> {
    let query = this.supabase
      .from('event_venue_assignments')
      .select(`
        *,
        institution:institutions(id, name),
        staff_assignments:event_staff_assignments(id, staff_id, role, day_type, staff:staff(id, first_name, last_name, email)),
        team_allocations:event_team_venue_allocations(id, registration_id, registration:event_registrations(id, team_name, institution_id, institution:institutions(id, name), team_members:event_team_members(id, is_leader, learner:learners_profiles(id, department:departments(id, department_name), semester:semesters(id, semester_name)))))
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (dayType) {
      query = query.eq('day_type', dayType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/venues] getVenues failed:', error);
      throw error;
    }
    return (data || []) as unknown as EventVenueAssignment[];
  }

  static async addVenue(dto: CreateVenueDto): Promise<EventVenueAssignment> {
    const { data, error } = await this.supabase
      .from('event_venue_assignments')
      .insert({
        event_id: dto.event_id,
        day_type: dto.day_type,
        institution_id: dto.institution_id,
        resource_id: dto.resource_id || null,
        manual_name: dto.manual_name || null,
        manual_building: dto.manual_building || null,
        manual_room: dto.manual_room || null,
        capacity_override: dto.capacity_override || null,
      })
      .select()
      .single();

    if (error) {
      console.error('[startup/venues] addVenue failed:', error);
      throw error;
    }
    return data as unknown as EventVenueAssignment;
  }

  static async updateVenue(venueId: string, dto: UpdateVenueDto): Promise<EventVenueAssignment> {
    const update: Record<string, any> = {};
    if (dto.institution_id !== undefined) update.institution_id = dto.institution_id;
    if (dto.manual_name !== undefined) update.manual_name = dto.manual_name || null;
    if (dto.manual_building !== undefined) update.manual_building = dto.manual_building || null;
    if (dto.manual_room !== undefined) update.manual_room = dto.manual_room || null;
    if (dto.capacity_override !== undefined) update.capacity_override = dto.capacity_override ?? null;

    const { data, error } = await this.supabase
      .from('event_venue_assignments')
      .update(update)
      .eq('id', venueId)
      .select()
      .single();

    if (error) {
      console.error('[startup/venues] updateVenue failed:', error);
      throw error;
    }
    return data as unknown as EventVenueAssignment;
  }

  static async removeVenue(venueId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_venue_assignments')
      .delete()
      .eq('id', venueId);

    if (error) {
      console.error('[startup/venues] removeVenue failed:', error);
      throw error;
    }
  }

  static async assignStaff(
    eventId: string,
    venueAssignmentId: string,
    staffId: string,
    role: StaffRole,
    dayType: DayType
  ): Promise<EventStaffAssignment> {
    const { data, error } = await this.supabase
      .from('event_staff_assignments')
      .insert({
        event_id: eventId,
        venue_assignment_id: venueAssignmentId,
        staff_id: staffId,
        role,
        day_type: dayType,
      })
      .select()
      .single();

    if (error) {
      console.error('[startup/venues] assignStaff failed:', error);
      throw error;
    }
    return data as unknown as EventStaffAssignment;
  }

  static async removeStaff(assignmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_staff_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) {
      console.error('[startup/venues] removeStaff failed:', error);
      throw error;
    }
  }

  static async autoAllocateTeams(
    eventId: string,
    dayType: DayType,
    userId: string
  ): Promise<{ allocated: number; overflow: number; unallocated: number }> {
    // Fetch venues, registrations, and existing allocations in parallel
    const [
      { data: venues, error: venuesError },
      { data: registrations, error: regError },
      { data: existingAllocations, error: allocError },
    ] = await Promise.all([
      this.supabase
        .from('event_venue_assignments')
        .select('id, institution_id, capacity_override')
        .eq('event_id', eventId)
        .eq('day_type', dayType),
      this.supabase
        .from('event_registrations')
        .select('id, institution_id')
        .eq('event_id', eventId),
      this.supabase
        .from('event_team_venue_allocations')
        .select('id, registration_id, venue_assignment_id')
        .eq('event_id', eventId)
        .eq('day_type', dayType),
    ]);

    if (venuesError) {
      console.error('[startup/venues] autoAllocateTeams getVenues failed:', venuesError);
      throw venuesError;
    }
    if (regError) {
      console.error('[startup/venues] autoAllocateTeams getRegistrations failed:', regError);
      throw regError;
    }
    if (allocError) {
      console.error('[startup/venues] autoAllocateTeams getExisting failed:', allocError);
      throw allocError;
    }

    // Track which teams are already placed
    const allocatedRegIds = new Set((existingAllocations || []).map((a: any) => a.registration_id));
    let remainingRegs = (registrations || []).filter((r: any) => !allocatedRegIds.has(r.id));

    // Track live allocation counts per venue (updated as we build toInsert)
    const venueAllocCounts: Record<string, number> = {};
    for (const alloc of existingAllocations || []) {
      venueAllocCounts[(alloc as any).venue_assignment_id] =
        (venueAllocCounts[(alloc as any).venue_assignment_id] || 0) + 1;
    }

    const toInsert: Array<{
      event_id: string;
      registration_id: string;
      venue_assignment_id: string;
      day_type: DayType;
      allocated_by: string;
    }> = [];

    // Helper: remaining capacity for a venue
    const remainingCapacity = (v: any) =>
      Math.max(0, (v.capacity_override || 0) - (venueAllocCounts[v.id] || 0));

    const placeTeam = (regId: string, venue: any) => {
      toInsert.push({
        event_id: eventId,
        registration_id: regId,
        venue_assignment_id: venue.id,
        day_type: dayType,
        allocated_by: userId,
      });
      venueAllocCounts[venue.id] = (venueAllocCounts[venue.id] || 0) + 1;
    };

    // ── PASS 1: Same-institution matching ──────────────────────────────────
    // Allocate each team to a venue belonging to the same institution.
    // Venues with the most remaining capacity are preferred so space is used evenly.
    const stillUnallocated: typeof remainingRegs = [];

    for (const reg of remainingRegs) {
      const sameInstVenues = (venues || [])
        .filter((v: any) => v.institution_id === reg.institution_id && remainingCapacity(v) > 0)
        .sort((a: any, b: any) => remainingCapacity(b) - remainingCapacity(a));

      if (sameInstVenues.length > 0) {
        placeTeam(reg.id, sameInstVenues[0]);
      } else {
        stillUnallocated.push(reg);
      }
    }

    // ── PASS 2: Overflow — any venue with remaining capacity ───────────────
    // Teams that had no same-institution venue (or all were full) are placed
    // in any venue that still has space, prioritising venues with most capacity.
    let overflowCount = 0;

    for (const reg of stillUnallocated) {
      const anyVenue = (venues || [])
        .filter((v: any) => remainingCapacity(v) > 0)
        .sort((a: any, b: any) => remainingCapacity(b) - remainingCapacity(a));

      if (anyVenue.length > 0) {
        placeTeam(reg.id, anyVenue[0]);
        overflowCount++;
      }
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await this.supabase
        .from('event_team_venue_allocations')
        .insert(toInsert);

      if (insertError) {
        console.error('[startup/venues] autoAllocateTeams insert failed:', insertError);
        throw insertError;
      }
    }

    const totalAllocated = toInsert.length;
    return {
      allocated: totalAllocated - overflowCount,  // same-institution placements
      overflow: overflowCount,                      // cross-institution overflow placements
      unallocated: remainingRegs.length - totalAllocated,
    };
  }

  static async manualAllocate(
    eventId: string,
    registrationId: string,
    venueAssignmentId: string,
    dayType: DayType,
    userId: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('event_team_venue_allocations')
      .insert({
        event_id: eventId,
        registration_id: registrationId,
        venue_assignment_id: venueAssignmentId,
        day_type: dayType,
        allocated_by: userId,
      });

    if (error) {
      console.error('[startup/venues] manualAllocate failed:', error);
      throw error;
    }
  }

  static async removeAllocation(allocationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('event_team_venue_allocations')
      .delete()
      .eq('id', allocationId);

    if (error) {
      console.error('[startup/venues] removeAllocation failed:', error);
      throw error;
    }
  }

  static async getStaffList(institutionId?: string, departmentId?: string): Promise<Array<{ id: string; first_name: string; last_name: string; email: string; department_id: string | null }>> {
    let query = this.supabase
      .from('staff')
      .select('id, first_name, last_name, email, department_id')
      .eq('is_active', true)
      .order('first_name');

    if (institutionId) query = query.eq('institution_id', institutionId);
    if (departmentId)  query = query.eq('department_id', departmentId);

    const { data, error } = await query;
    if (error) {
      console.error('[startup/venues] getStaffList failed:', error);
      throw error;
    }
    return (data || []) as Array<{ id: string; first_name: string; last_name: string; email: string; department_id: string | null }>;
  }

  static async getVenuesForStaff(eventId: string, staffEmail: string, dayType?: DayType): Promise<EventVenueAssignment[]> {
    // Look up staff record by email
    const { data: staffRecord, error: staffError } = await this.supabase
      .from('staff')
      .select('id')
      .eq('email', staffEmail)
      .maybeSingle();

    if (staffError) {
      console.error('[startup/venues] getVenuesForStaff staff lookup failed:', staffError);
      throw staffError;
    }
    if (!staffRecord) return [];

    // Get venue IDs where this staff member is assigned
    let assignmentQuery = this.supabase
      .from('event_staff_assignments')
      .select('venue_assignment_id')
      .eq('event_id', eventId)
      .eq('staff_id', staffRecord.id);

    if (dayType) {
      assignmentQuery = assignmentQuery.eq('day_type', dayType);
    }

    const { data: assignments, error: assignError } = await assignmentQuery;
    if (assignError) {
      console.error('[startup/venues] getVenuesForStaff assignments failed:', assignError);
      throw assignError;
    }
    if (!assignments || assignments.length === 0) return [];

    const venueIds = [...new Set(assignments.map((a: any) => a.venue_assignment_id))];

    // Fetch full venue data for those IDs (same joins as getVenues)
    let query = this.supabase
      .from('event_venue_assignments')
      .select(`
        *,
        institution:institutions(id, name),
        staff_assignments:event_staff_assignments(id, staff_id, role, day_type, staff:staff(id, first_name, last_name, email)),
        team_allocations:event_team_venue_allocations(id, registration_id, registration:event_registrations(id, team_name, institution_id, institution:institutions(id, name), team_members:event_team_members(id, is_leader, learner:learners_profiles(id, department:departments(id, department_name), semester:semesters(id, semester_name)))))
      `)
      .in('id', venueIds)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (dayType) {
      query = query.eq('day_type', dayType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/venues] getVenuesForStaff venues failed:', error);
      throw error;
    }
    return (data || []) as unknown as EventVenueAssignment[];
  }

  // All venues for the event — used by faculty who can mark attendance for any venue
  // (same join shape as getVenuesForStaff so StaffVenueCard renders without changes)
  static async getAllVenuesForFaculty(eventId: string, dayType?: DayType): Promise<EventVenueAssignment[]> {
    let query = this.supabase
      .from('event_venue_assignments')
      .select(`
        *,
        institution:institutions(id, name),
        staff_assignments:event_staff_assignments(id, staff_id, role, day_type, staff:staff(id, first_name, last_name, email)),
        team_allocations:event_team_venue_allocations(id, registration_id, registration:event_registrations(id, team_name, institution_id, institution:institutions(id, name), team_members:event_team_members(id, is_leader, learner:learners_profiles(id, department:departments(id, department_name), semester:semesters(id, semester_name)))))
      `)
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (dayType) {
      query = query.eq('day_type', dayType);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/venues] getAllVenuesForFaculty failed:', error);
      throw error;
    }
    return (data || []) as unknown as EventVenueAssignment[];
  }

  static async getVenueAttendance(
    eventId: string,
    venueAssignmentId: string,
    dayType: DayType
  ): Promise<import('@/types/startup-studio').EventTeamAttendance[]> {
    const { data, error } = await this.supabase
      .from('event_team_attendance')
      .select(`
        *,
        registration:event_registrations(id, team_name, institution_id),
        marker:profiles!event_team_attendance_marked_by_fkey(id, full_name, email)
      `)
      .eq('event_id', eventId)
      .eq('venue_assignment_id', venueAssignmentId)
      .eq('day_type', dayType)
      .order('marked_at', { ascending: true });

    if (error) {
      console.error('[startup/venues] getVenueAttendance failed:', error);
      throw error;
    }
    return (data || []) as unknown as import('@/types/startup-studio').EventTeamAttendance[];
  }

  static async getEventAttendanceMap(
    eventId: string,
    dayType: DayType
  ): Promise<Record<string, { present: number; absent: number; late: number; excused: number; total: number }>> {
    const { data, error } = await this.supabase
      .from('event_team_attendance')
      .select('venue_assignment_id, status')
      .eq('event_id', eventId)
      .eq('day_type', dayType);

    if (error) {
      console.error('[startup/venues] getEventAttendanceMap failed:', error);
      throw error;
    }

    const map: Record<string, { present: number; absent: number; late: number; excused: number; total: number }> = {};
    for (const record of data || []) {
      const key = record.venue_assignment_id;
      if (!map[key]) map[key] = { present: 0, absent: 0, late: 0, excused: 0, total: 0 };
      map[key][record.status as 'present' | 'absent' | 'late' | 'excused']++;
      map[key].total++;
    }
    return map;
  }

  static async getVenueById(venueId: string): Promise<EventVenueAssignment | null> {
    const { data, error } = await this.supabase
      .from('event_venue_assignments')
      .select(`
        *,
        institution:institutions(id, name),
        staff_assignments:event_staff_assignments(id, staff_id, role, day_type, staff:staff(id, first_name, last_name, email)),
        team_allocations:event_team_venue_allocations(id, registration_id, registration:event_registrations(id, team_name, institution_id, institution:institutions(id, name), team_members:event_team_members(id, is_leader, learner:learners_profiles(id, department:departments(id, department_name), semester:semesters(id, semester_name)))))
      `)
      .eq('id', venueId)
      .maybeSingle();

    if (error) {
      console.error('[startup/venues] getVenueById failed:', error);
      throw error;
    }
    return data as unknown as EventVenueAssignment | null;
  }

  static async markAttendance(
    dto: import('@/types/startup-studio').MarkAttendanceDto,
    userId: string
  ): Promise<import('@/types/startup-studio').EventTeamAttendance> {
    const { data, error } = await this.supabase
      .from('event_team_attendance')
      .upsert(
        {
          event_id: dto.event_id,
          registration_id: dto.registration_id,
          venue_assignment_id: dto.venue_assignment_id,
          day_type: dto.day_type,
          status: dto.status,
          notes: dto.notes || null,
          marked_by: userId,
          marked_at: new Date().toISOString(),
        },
        { onConflict: 'event_id,registration_id,day_type' }
      )
      .select()
      .single();

    if (error) {
      console.error('[startup/venues] markAttendance failed:', error);
      throw error;
    }
    return data as unknown as import('@/types/startup-studio').EventTeamAttendance;
  }
}
