import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { EventRegistrationService } from '@/lib/services/startup-studio/event-registration-service';
import { StudentSearchService } from '@/lib/services/startup-studio/student-search-service';
import { useAuth } from '@/hooks/use-auth';
import type { CreateRegistrationDto, RegistrationFilters, StudentSearchFilters } from '@/types/startup-studio';

export function useEventRegistrations(filters: RegistrationFilters) {
  return useQuery({
    queryKey: ['event-registrations', filters],
    queryFn: () => EventRegistrationService.getRegistrations(filters),
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useEventRegistrationsPaginated(filters: RegistrationFilters) {
  return useQuery({
    queryKey: ['event-registrations-paginated', filters],
    queryFn: () => EventRegistrationService.getRegistrationsPaginated(filters),
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useMyRegistration(eventId: string | undefined) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-registration', eventId, profile?.id],
    queryFn: () => {
      if (!eventId || !profile?.id) return null;
      return EventRegistrationService.getMyRegistration(eventId, profile.id);
    },
    enabled: !!eventId && !!profile?.id,
    staleTime: 15 * 1000,
    retry: 3,
  });
}

export function useRegisterTeam() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (dto: CreateRegistrationDto) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventRegistrationService.registerTeam(dto, profile.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event-stats'] });
      toast.success('Team registered successfully!');
      router.push(`/startup-studio/events/${data.event_id}/my-team`);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to register team');
    },
  });
}

export function useToggleCheckIn() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ registrationId, checked_in }: { registrationId: string; checked_in: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventRegistrationService.toggleCheckIn(registrationId, profile.id, checked_in);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['startup-event-stats'] });
      toast.success('Check-in updated');
    },
    onError: () => toast.error('Failed to update check-in'),
  });
}

export function useToggleLovableVerified() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ registrationId, verified }: { registrationId: string; verified: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventRegistrationService.toggleLovableVerified(registrationId, profile.id, verified);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Lovable verification updated');
    },
    onError: () => toast.error('Failed to update verification'),
  });
}


export function useRemoveTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => EventRegistrationService.removeMember(memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Member removed');
    },
    onError: () => toast.error('Failed to remove member'),
  });
}

export function useStudentSearch(filters: StudentSearchFilters & { enabled?: boolean }) {
  const { enabled = true, ...searchFilters } = filters;
  return useQuery({
    queryKey: ['student-search', searchFilters],
    queryFn: () => StudentSearchService.searchStudents(searchFilters),
    enabled: enabled && !!searchFilters.event_id && !!searchFilters.institution_id,
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useStudentSearchFilterOptions(filters: {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
}) {
  return useQuery({
    queryKey: ['student-search-filter-options', filters],
    queryFn: () => StudentSearchService.getFilterOptions(filters),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useInviteTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      registrationId,
      eventId,
      student,
      invitedByProfileId,
    }: {
      registrationId: string;
      eventId: string;
      student: Parameters<typeof EventRegistrationService.inviteMember>[2];
      invitedByProfileId: string;
    }) => EventRegistrationService.inviteMember(registrationId, eventId, student, invitedByProfileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['student-search'] });
      toast.success('Invitation sent!');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to send invitation'),
  });
}

export function useRespondToInvitation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: ({ memberId, accept }: { memberId: string; accept: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      return EventRegistrationService.respondToInvitation(memberId, profile.id, accept);
    },
    onSuccess: (_, { accept }) => {
      queryClient.invalidateQueries({ queryKey: ['my-pending-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success(accept ? 'You joined the team!' : 'Invitation declined');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to respond to invitation'),
  });
}

export function useMyPendingInvitations() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-pending-invitations', profile?.id],
    queryFn: () => {
      if (!profile?.id) return [];
      return EventRegistrationService.getMyPendingInvitations(profile.id);
    },
    enabled: !!profile?.id,
    staleTime: 15 * 1000,
    retry: 2,
  });
}
