import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  EventVenueAssignment,
  EventStaffAssignment,
  CreateVenueDto,
  DayType,
  StaffRole,
} from '@/types/startup-studio';

export class EventVenueService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async getVenues(eventId: string, dayType?: DayType): Promise<EventVenueAssignment[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- avoids TS infinite type instantiation with nested Supabase selects
    let query: any = this.supabase
      .from('event_venue_assignments')
      .select(`
        *,
        institution:institutions(id, name),
        staff_assignments:event_staff_assignments(id, staff_id, role, day_type, staff:staff(id, first_name, last_name, email)),
        team_allocations:event_team_venue_allocations(id, registration_id, registration:event_registrations(id, team_name, institution_id))
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
  ): Promise<{ allocated: number; unallocated: number }> {
    // Get all venues for this event + day_type
    const { data: venues, error: venuesError } = await this.supabase
      .from('event_venue_assignments')
      .select('id, institution_id, capacity_override')
      .eq('event_id', eventId)
      .eq('day_type', dayType);

    if (venuesError) {
      console.error('[startup/venues] autoAllocateTeams getVenues failed:', venuesError);
      throw venuesError;
    }

    // Get all registrations for this event
    const { data: registrations, error: regError } = await this.supabase
      .from('event_registrations')
      .select('id, institution_id')
      .eq('event_id', eventId);

    if (regError) {
      console.error('[startup/venues] autoAllocateTeams getRegistrations failed:', regError);
      throw regError;
    }

    // Get existing allocations for this event + day_type
    const { data: existingAllocations, error: allocError } = await this.supabase
      .from('event_team_venue_allocations')
      .select('id, registration_id, venue_assignment_id')
      .eq('event_id', eventId)
      .eq('day_type', dayType);

    if (allocError) {
      console.error('[startup/venues] autoAllocateTeams getExisting failed:', allocError);
      throw allocError;
    }

    const allocatedRegIds = new Set((existingAllocations || []).map(a => a.registration_id));
    const unallocatedRegs = (registrations || []).filter(r => !allocatedRegIds.has(r.id));

    // Count current allocations per venue
    const venueAllocCounts: Record<string, number> = {};
    for (const alloc of existingAllocations || []) {
      venueAllocCounts[alloc.venue_assignment_id] = (venueAllocCounts[alloc.venue_assignment_id] || 0) + 1;
    }

    const toInsert: Array<{
      event_id: string;
      registration_id: string;
      venue_assignment_id: string;
      day_type: DayType;
      allocated_by: string;
    }> = [];

    for (const reg of unallocatedRegs) {
      // Find a venue matching institution_id with remaining capacity
      const matchingVenue = (venues || []).find(v => {
        if (v.institution_id !== reg.institution_id) return false;
        const currentCount = venueAllocCounts[v.id] || 0;
        const capacity = v.capacity_override || 0;
        return capacity > currentCount;
      });

      if (matchingVenue) {
        toInsert.push({
          event_id: eventId,
          registration_id: reg.id,
          venue_assignment_id: matchingVenue.id,
          day_type: dayType,
          allocated_by: userId,
        });
        venueAllocCounts[matchingVenue.id] = (venueAllocCounts[matchingVenue.id] || 0) + 1;
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

    return {
      allocated: toInsert.length,
      unallocated: unallocatedRegs.length - toInsert.length,
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

  static async getStaffList(institutionId?: string): Promise<Array<{ id: string; first_name: string; last_name: string; email: string; department_id: string | null }>> {
    let query = this.supabase
      .from('staff')
      .select('id, first_name, last_name, email, department_id');

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[startup/venues] getStaffList failed:', error);
      throw error;
    }
    return (data || []) as Array<{ id: string; first_name: string; last_name: string; email: string; department_id: string | null }>;
  }
}
