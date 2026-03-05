import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { EventRegistrationService } from '@/lib/services/startup-studio/event-registration-service';
import { useAuth } from '@/hooks/use-auth';
import type { CreateRegistrationDto, CreateTeamMemberDto, RegistrationFilters } from '@/types/startup-studio';

export function useEventRegistrations(filters: RegistrationFilters) {
  return useQuery({
    queryKey: ['event-registrations', filters],
    queryFn: () => EventRegistrationService.getRegistrations(filters),
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

export function useAddTeamMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ registrationId, member }: { registrationId: string; member: CreateTeamMemberDto }) => {
      return EventRegistrationService.addMember(registrationId, member);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['event-registrations'] });
      toast.success('Member added');
    },
    onError: (error: any) => toast.error(error.message || 'Failed to add member'),
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
