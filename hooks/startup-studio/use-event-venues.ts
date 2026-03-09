import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventVenueService } from '@/lib/services/startup-studio/event-venue-service';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CreateVenueDto, UpdateVenueDto, DayType, StaffRole, MarkAttendanceDto, EventTeamAttendance } from '@/types/startup-studio';

// Guards against Next.js 15 Dynamic Route Prefetching placeholders like "%%drp:id:abc%%"
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUUID = (id: string | undefined | null): boolean => !!id && !id.includes('%%drp:') && UUID_REGEX.test(id);

export function useVenue(venueId: string) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-venue', venueId],
    queryFn: () => EventVenueService.getVenueById(venueId),
    enabled: !authLoading && isValidUUID(venueId),
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useEventVenues(eventId: string, dayType?: DayType) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-venues', eventId, dayType],
    queryFn: () => EventVenueService.getVenues(eventId, dayType),
    enabled: !authLoading && isValidUUID(eventId),
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useAddVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateVenueDto) => EventVenueService.addVenue(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-venues'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event-stats'] });
      toast.success('Venue added');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to add venue'),
  });
}

export function useUpdateVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ venueId, dto }: { venueId: string; dto: UpdateVenueDto }) =>
      EventVenueService.updateVenue(venueId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-venues'] });
      toast.success('Venue updated');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to update venue'),
  });
}

export function useRemoveVenue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (venueId: string) => EventVenueService.removeVenue(venueId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-venues'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event-stats'] });
      toast.success('Venue removed');
    },
    onError: () => toast.error('Failed to remove venue'),
  });
}

export function useAssignStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      eventId,
      venueAssignmentId,
      staffId,
      role,
      dayType,
    }: {
      eventId: string;
      venueAssignmentId: string;
      staffId: string;
      role: StaffRole;
      dayType: DayType;
    }) => EventVenueService.assignStaff(eventId, venueAssignmentId, staffId, role, dayType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-venues'] });
      queryClient.invalidateQueries({ queryKey: ['event-venue'] });
      toast.success('Staff assigned');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to assign staff'),
  });
}

export function useRemoveStaff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => EventVenueService.removeStaff(assignmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-venues'] });
      queryClient.invalidateQueries({ queryKey: ['event-venue'] });
      toast.success('Staff removed');
    },
    onError: () => toast.error('Failed to remove staff'),
  });
}

export function useAutoAllocateTeams() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ eventId, dayType }: { eventId: string; dayType: DayType }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventVenueService.autoAllocateTeams(eventId, dayType, profile.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['event-venues'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      const parts: string[] = [];
      if (data.allocated > 0) parts.push(`${data.allocated} same-institution`);
      if (data.overflow > 0) parts.push(`${data.overflow} overflow`);
      const total = data.allocated + data.overflow;
      if (total === 0) {
        toast.success('All teams already allocated');
      } else if (data.unallocated > 0) {
        toast.success(`Allocated ${total} teams (${parts.join(', ')}) — ${data.unallocated} unallocated (no venue capacity)`);
      } else {
        toast.success(`Allocated ${total} teams (${parts.join(', ')})`);
      }
    },
    onError: (error: any) => toast.error(error.message || 'Failed to auto-allocate teams'),
  });
}

export function useManualAllocate() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({
      eventId,
      registrationId,
      venueAssignmentId,
      dayType,
    }: {
      eventId: string;
      registrationId: string;
      venueAssignmentId: string;
      dayType: DayType;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventVenueService.manualAllocate(eventId, registrationId, venueAssignmentId, dayType, profile.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-venues'] });
      queryClient.invalidateQueries({ queryKey: ['event-venue'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Team allocated to venue');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to allocate team'),
  });
}

export function useRemoveAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allocationId: string) => EventVenueService.removeAllocation(allocationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-venues'] });
      queryClient.invalidateQueries({ queryKey: ['event-venue'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Allocation removed');
    },
    onError: () => toast.error('Failed to remove allocation'),
  });
}

export function useStaffList(institutionId?: string, departmentId?: string) {
  return useQuery({
    queryKey: ['staff-list', institutionId, departmentId],
    queryFn: () => EventVenueService.getStaffList(institutionId, departmentId),
    staleTime: 60 * 1000,
    retry: 3,
  });
}

export function useEventAttendanceMap(eventId: string, dayType: DayType) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-attendance-map', eventId, dayType],
    queryFn: () => EventVenueService.getEventAttendanceMap(eventId, dayType),
    enabled: !authLoading && isValidUUID(eventId),
    staleTime: 10 * 1000,
    retry: 3,
  });
}

export function useAllVenuesForFaculty(eventId: string, dayType?: DayType) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-venues-faculty', eventId, dayType],
    queryFn: () => EventVenueService.getAllVenuesForFaculty(eventId, dayType),
    enabled: !authLoading && isValidUUID(eventId),
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useStaffVenues(eventId: string, staffEmail: string, dayType?: DayType) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['event-venues-staff', eventId, staffEmail, dayType],
    queryFn: () => EventVenueService.getVenuesForStaff(eventId, staffEmail, dayType),
    enabled: !authLoading && isValidUUID(eventId) && !!staffEmail,
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useVenueAttendance(eventId: string, venueAssignmentId: string, dayType: DayType) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['venue-attendance', eventId, venueAssignmentId, dayType],
    queryFn: () => EventVenueService.getVenueAttendance(eventId, venueAssignmentId, dayType),
    enabled: !authLoading && isValidUUID(eventId) && isValidUUID(venueAssignmentId),
    staleTime: 10 * 1000,
    retry: 3,
  });
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (dto: MarkAttendanceDto) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventVenueService.markAttendance(dto, profile.id);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['venue-attendance', variables.event_id] });
      toast.success('Attendance marked');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to mark attendance'),
  });
}

/** Fetch department & semester for a set of registration IDs (used in venue detail page). */
export function useTeamAcademicDetails(registrationIds: string[]) {
  return useQuery({
    queryKey: ['team-academic-details', ...registrationIds.sort()],
    queryFn: () => EventVenueService.getTeamAcademicDetails(registrationIds),
    enabled: registrationIds.length > 0,
    staleTime: 60 * 1000,
  });
}

// Fetches venue allocations for a specific registration (team).
// Used by team members (non-leaders) who don't have an event_registrations row
// of their own — they only have a registration_id via their team membership.
// RLS: event_team_venue_allocations allows SELECT for all authenticated users.
export function useRegistrationVenueAllocations(registrationId: string | null | undefined) {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['registration-venue-allocations', registrationId],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('event_team_venue_allocations')
        .select(`
          id, day_type,
          venue_assignment:event_venue_assignments(
            id, manual_name, manual_building, manual_room, day_type, capacity_override,
            resource:resources(id, name, building_number, room_number),
            staff_assignments:event_staff_assignments(
              id, role,
              staff:staff(id, first_name, last_name, email)
            )
          )
        `)
        .eq('registration_id', registrationId!);

      if (error) {
        console.error('[startup/venues] useRegistrationVenueAllocations failed:', error);
        throw error;
      }
      return (data ?? []) as any[];
    },
    enabled: !authLoading && isValidUUID(registrationId),
    staleTime: 15 * 1000,
    retry: 2,
  });
}
