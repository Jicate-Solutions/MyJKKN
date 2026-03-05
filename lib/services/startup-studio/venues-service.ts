// lib/services/startup-studio/venues-service.ts
// CRUD operations for ss_event_venues, ss_venue_staff, and team venue allocations

import { BaseService } from '../base-service';

export class VenuesService extends BaseService {

  // Get all venues for an event day
  static async getEventVenues(eventId: string, dayType: string) {
    const { data, error } = await this.supabase
      .from('ss_event_venues')
      .select(`
        *,
        institution:institutions(id, name),
        resource:resources(id, name, building_number, room_number),
        staff:ss_venue_staff(id, user_id, role, user:profiles!user_id(id, full_name, email))
      `)
      .eq('event_id', eventId)
      .eq('day_type', dayType)
      .order('created_at');
    if (error) throw new Error(`Failed to fetch venues: ${error.message}`);

    // Also get team counts per venue
    const venueColumn = dayType === 'build_day' ? 'build_venue_id' : 'demo_venue_id';
    const { data: teams } = await this.supabase
      .from('ss_teams')
      .select('id, name, institution_id, build_venue_id, demo_venue_id')
      .eq('event_id', eventId);

    // Attach team counts to venues
    return (data || []).map(venue => ({
      ...venue,
      teams: (teams || []).filter((t: any) => t[venueColumn] === venue.id),
      team_count: (teams || []).filter((t: any) => t[venueColumn] === venue.id).length,
    }));
  }

  // Add a venue to an event day
  static async addEventVenue(input: {
    event_id: string;
    resource_id?: string;
    day_type: string;
    venue_name: string;
    institution_id?: string;
    capacity?: number;
    location_info?: string;
  }) {
    const { data, error } = await this.supabase
      .from('ss_event_venues')
      .insert({
        event_id: input.event_id,
        resource_id: input.resource_id || null,
        day_type: input.day_type,
        venue_name: input.venue_name,
        institution_id: input.institution_id || null,
        capacity: input.capacity || 50,
        location_info: input.location_info || null,
      })
      .select()
      .single();
    if (error) throw new Error(`Failed to add venue: ${error.message}`);
    return data;
  }

  // Remove a venue
  static async removeEventVenue(venueId: string) {
    // First unassign teams from this venue
    await this.supabase.from('ss_teams').update({ build_venue_id: null }).eq('build_venue_id', venueId);
    await this.supabase.from('ss_teams').update({ demo_venue_id: null }).eq('demo_venue_id', venueId);

    const { error } = await this.supabase
      .from('ss_event_venues')
      .delete()
      .eq('id', venueId);
    if (error) throw new Error(`Failed to remove venue: ${error.message}`);
  }

  // Assign mentors/judges to a venue (bulk upsert)
  static async assignStaff(venueId: string, userIds: string[], role: string) {
    const records = userIds.map(uid => ({
      venue_id: venueId,
      user_id: uid,
      role,
    }));
    const { data, error } = await this.supabase
      .from('ss_venue_staff')
      .upsert(records, { onConflict: 'venue_id,user_id' })
      .select();
    if (error) throw new Error(`Failed to assign staff: ${error.message}`);
    return data;
  }

  // Remove staff from venue
  static async removeStaff(venueId: string, userId: string) {
    const { error } = await this.supabase
      .from('ss_venue_staff')
      .delete()
      .eq('venue_id', venueId)
      .eq('user_id', userId);
    if (error) throw new Error(`Failed to remove staff: ${error.message}`);
  }

  // Allocate teams to a venue
  static async allocateTeams(venueId: string, teamIds: string[], dayType: string) {
    const column = dayType === 'build_day' ? 'build_venue_id' : 'demo_venue_id';
    const { error } = await this.supabase
      .from('ss_teams')
      .update({ [column]: venueId })
      .in('id', teamIds);
    if (error) throw new Error(`Failed to allocate teams: ${error.message}`);
  }

  // Remove team from venue
  static async removeTeamFromVenue(teamId: string, dayType: string) {
    const column = dayType === 'build_day' ? 'build_venue_id' : 'demo_venue_id';
    const { error } = await this.supabase
      .from('ss_teams')
      .update({ [column]: null })
      .eq('id', teamId);
    if (error) throw new Error(`Failed to remove team from venue: ${error.message}`);
  }

  // Auto-allocate teams to venues by institution match + capacity
  static async autoAllocateTeams(eventId: string, dayType: string) {
    // Get venues for this day
    const { data: venues } = await this.supabase
      .from('ss_event_venues')
      .select('id, institution_id, capacity')
      .eq('event_id', eventId)
      .eq('day_type', dayType)
      .eq('status', 'active');

    if (!venues?.length) throw new Error('No venues configured for this day');

    // Get unallocated teams
    const column = dayType === 'build_day' ? 'build_venue_id' : 'demo_venue_id';
    const { data: teams } = await this.supabase
      .from('ss_teams')
      .select('id, institution_id')
      .eq('event_id', eventId)
      .is(column, null);

    if (!teams?.length) return { allocated: 0, message: 'No unallocated teams' };

    // Track capacity usage
    const venueUsage: Record<string, number> = {};
    venues.forEach(v => { venueUsage[v.id] = 0; });

    // Count existing allocations
    const { data: existingTeams } = await this.supabase
      .from('ss_teams')
      .select('id, build_venue_id, demo_venue_id')
      .eq('event_id', eventId)
      .not(column, 'is', null);

    (existingTeams || []).forEach((t: any) => {
      const vid = dayType === 'build_day' ? t.build_venue_id : t.demo_venue_id;
      if (vid && venueUsage[vid] !== undefined) venueUsage[vid]++;
    });

    // Allocate: match by institution first, then fill remaining
    const allocations: { teamId: string; venueId: string }[] = [];
    const unmatched: string[] = [];

    for (const team of teams) {
      // Find venue matching team's institution with capacity
      const matchingVenue = venues.find(v =>
        v.institution_id === team.institution_id &&
        venueUsage[v.id] < (v.capacity || 50)
      );

      if (matchingVenue) {
        allocations.push({ teamId: team.id, venueId: matchingVenue.id });
        venueUsage[matchingVenue.id]++;
      } else {
        unmatched.push(team.id);
      }
    }

    // Distribute unmatched across any venue with capacity
    for (const teamId of unmatched) {
      const availableVenue = venues.find(v => venueUsage[v.id] < (v.capacity || 50));
      if (availableVenue) {
        allocations.push({ teamId, venueId: availableVenue.id });
        venueUsage[availableVenue.id]++;
      }
    }

    // Apply allocations in batches
    for (const alloc of allocations) {
      await this.supabase
        .from('ss_teams')
        .update({ [column]: alloc.venueId })
        .eq('id', alloc.teamId);
    }

    return { allocated: allocations.length, total: teams.length };
  }

  // Get venue stats
  static async getVenueStats(eventId: string, dayType: string) {
    const column = dayType === 'build_day' ? 'build_venue_id' : 'demo_venue_id';

    const { data: venues } = await this.supabase
      .from('ss_event_venues')
      .select('id, capacity')
      .eq('event_id', eventId)
      .eq('day_type', dayType);

    const { count: allocated } = await this.supabase
      .from('ss_teams')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .not(column, 'is', null);

    const { count: total } = await this.supabase
      .from('ss_teams')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId);

    const { count: staffCount } = await this.supabase
      .from('ss_venue_staff')
      .select('id', { count: 'exact', head: true })
      .in('venue_id', (venues || []).map(v => v.id));

    return {
      total_venues: venues?.length || 0,
      total_capacity: (venues || []).reduce((sum, v) => sum + (v.capacity || 0), 0),
      teams_allocated: allocated || 0,
      teams_unallocated: (total || 0) - (allocated || 0),
      staff_assigned: staffCount || 0,
    };
  }

  // Get available mentors/senior learners for assignment
  static async getAvailableMentors(eventId: string, search?: string) {
    let query = this.supabase
      .from('profiles')
      .select('id, full_name, email, institution_id, role')
      .or('role.eq.admin,role.eq.staff,role.eq.super_admin');

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data, error } = await query.order('full_name').limit(50);
    if (error) throw new Error(`Failed to fetch mentors: ${error.message}`);
    return data || [];
  }
}

export const venuesService = {
  getEventVenues: VenuesService.getEventVenues.bind(VenuesService),
  addEventVenue: VenuesService.addEventVenue.bind(VenuesService),
  removeEventVenue: VenuesService.removeEventVenue.bind(VenuesService),
  assignStaff: VenuesService.assignStaff.bind(VenuesService),
  removeStaff: VenuesService.removeStaff.bind(VenuesService),
  allocateTeams: VenuesService.allocateTeams.bind(VenuesService),
  removeTeamFromVenue: VenuesService.removeTeamFromVenue.bind(VenuesService),
  autoAllocateTeams: VenuesService.autoAllocateTeams.bind(VenuesService),
  getVenueStats: VenuesService.getVenueStats.bind(VenuesService),
  getAvailableMentors: VenuesService.getAvailableMentors.bind(VenuesService),
};
