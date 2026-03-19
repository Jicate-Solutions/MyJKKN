import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { SarvamGalattaRegistrationService } from '@/lib/services/startup-studio/sarvam-galatta-registration-service';
import { useAuth } from '@/hooks/use-auth';
import type {
  SarvamGalattaRegistrationDto,
  SarvamGalattaRegistrationFilters,
} from '@/types/sarvam-galatta';

const SARVAM_GALATTA_EVENT_ID = 'ad357482-7087-4390-ac75-ad4c13838d4f';

// ---------------------------------------------------------------
// Student: fetch learner profile for auto-fill
// Only runs when user is a student with a profile loaded
// ---------------------------------------------------------------
export function useStudentAutoFill() {
  const { profile, isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['sarvam-galatta-auto-fill', profile?.id],
    queryFn: () => SarvamGalattaRegistrationService.getLearnerAutoFill(profile!.id),
    enabled: !authLoading && !!profile?.id && profile?.role === 'student',
    staleTime: 5 * 60 * 1000, // 5 min — learner profile changes rarely
    retry: 2,
  });
}

// ---------------------------------------------------------------
// Student: get own registration (null if not registered yet)
// ---------------------------------------------------------------
export function useMyRegistration() {
  const { profile, isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['sarvam-galatta-my-registration', profile?.id],
    queryFn: () => SarvamGalattaRegistrationService.getMyRegistration(profile!.id),
    enabled: !authLoading && !!profile?.id,
    staleTime: 15 * 1000,
    retry: 2,
  });
}

// ---------------------------------------------------------------
// Admin: all registrations with filters + pagination
// ---------------------------------------------------------------
export function useAllRegistrations(filters: Omit<SarvamGalattaRegistrationFilters, 'event_id'> & { enabled?: boolean }) {
  const { isLoading: authLoading } = useAuth();
  const { enabled = true, ...rest } = filters;
  return useQuery({
    queryKey: ['sarvam-galatta-all-registrations', rest],
    queryFn: () =>
      SarvamGalattaRegistrationService.getAllRegistrations({
        event_id: SARVAM_GALATTA_EVENT_ID,
        ...rest,
      }),
    enabled: !authLoading && enabled,
    staleTime: 30 * 1000,
    retry: 2,
  });
}

// ---------------------------------------------------------------
// Admin: registration statistics
// ---------------------------------------------------------------
export function useSarvamGalattaStats() {
  const { isLoading: authLoading } = useAuth();
  return useQuery({
    queryKey: ['sarvam-galatta-stats', SARVAM_GALATTA_EVENT_ID],
    queryFn: () => SarvamGalattaRegistrationService.getStats(SARVAM_GALATTA_EVENT_ID),
    enabled: !authLoading,
    staleTime: 60 * 1000, // 1 min — stats are relatively stable
    retry: 2,
  });
}

// ---------------------------------------------------------------
// Mutation: register student → redirect to my-registration page
// ---------------------------------------------------------------
export function useRegisterSarvamGalatta(eventId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (dto: Omit<SarvamGalattaRegistrationDto, 'event_id'>) =>
      SarvamGalattaRegistrationService.createRegistration(
        { ...dto, event_id: SARVAM_GALATTA_EVENT_ID },
        profile!.id
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-all-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-stats'] });
      // Redirect to my-registration view
      router.push(`/startup-studio/events/${eventId}/my-registration`);
    },
    onError: (error: Error) => {
      toast.error(error.message ?? 'Registration failed. Please try again.');
    },
  });
}

// ---------------------------------------------------------------
// Mutation: admin approve or reject a registration
// ---------------------------------------------------------------
export function useSetApprovalStatus() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({
      sarvamGalattaId,
      status,
    }: {
      sarvamGalattaId: string;
      status: 'shortlisted' | 'rejected';
    }) => SarvamGalattaRegistrationService.setApprovalStatus(sarvamGalattaId, status, profile!.id),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-all-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-my-registration'] });
      toast.success(status === 'shortlisted' ? 'Registration shortlisted.' : 'Registration rejected.');
    },
    onError: (error: Error) => {
      toast.error(error.message ?? 'Failed to update approval status.');
    },
  });
}

// ---------------------------------------------------------------
// Mutation: bulk approve or reject multiple registrations (admin)
// ---------------------------------------------------------------
export function useBulkSetApprovalStatus() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({
      ids,
      status,
    }: {
      ids: string[];
      status: 'shortlisted' | 'rejected';
    }) => SarvamGalattaRegistrationService.bulkSetApprovalStatus(ids, status, profile!.id),
    onSuccess: (_, { ids, status }) => {
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-all-registrations'] });
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-stats'] });
      toast.success(
        status === 'shortlisted'
          ? `${ids.length} registration${ids.length > 1 ? 's' : ''} shortlisted.`
          : `${ids.length} registration${ids.length > 1 ? 's' : ''} rejected.`,
      );
    },
    onError: (error: Error) => {
      toast.error(error.message ?? 'Bulk update failed. Please try again.');
    },
  });
}

// ---------------------------------------------------------------
// Mutation: update registration (before deadline)
// ---------------------------------------------------------------
export function useUpdateRegistration() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({
      sarvamGalattaId,
      updates,
    }: {
      sarvamGalattaId: string;
      updates: Partial<Omit<SarvamGalattaRegistrationDto, 'event_id'>>;
    }) => SarvamGalattaRegistrationService.updateRegistration(sarvamGalattaId, updates, profile!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-my-registration'] });
      queryClient.invalidateQueries({ queryKey: ['sarvam-galatta-all-registrations'] });
      toast.success('Registration updated successfully.');
    },
    onError: (error: Error) => {
      toast.error(error.message ?? 'Update failed. Please try again.');
    },
  });
}
