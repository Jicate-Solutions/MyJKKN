'use client';

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/query-keys';
import { getErrorMessage } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { CourseSessionService } from '@/lib/services/courses/course-session-service';
import type {
  CourseSessionSaveResult,
  CreateCourseSessionDto,
  UpdateCourseSessionDto,
  VenueHoldRefusal,
} from '@/types/courses';

const REFUSAL_COPY: Record<VenueHoldRefusal, string> = {
  no_venue: 'No room was selected, so none was held.',
  not_reservable: 'That room is not bookable.',
  walk_in: 'That room is walk-in only and cannot be held in advance.',
  no_approver:
    'That room belongs to another college and has no approver set to release it.',
  taken: 'That room is already booked for this time.',
  error: 'The room could not be held.',
};

/**
 * Resource Management does NOT use lib/query/query-keys.ts — its caches are flat
 * keys declared inline in hooks/reservation/. A course session mutation writes a
 * resource_reservations row, so without these the room calendar and the slot
 * pickers keep showing the time as free. Mirrors the set
 * useReservationOperations invalidates after its own create.
 */
function invalidateVenueCaches(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['reservations'] });
  qc.invalidateQueries({ queryKey: ['my-reservations'] });
  qc.invalidateQueries({ queryKey: ['resource-availability'] });
  qc.invalidateQueries({ queryKey: ['available-slots'] });
  qc.invalidateQueries({ queryKey: ['month-availability'] });
  qc.invalidateQueries({ queryKey: ['pending-approvals'] });
}

/**
 * A partial success is NOT a success toast. When the room was refused, the
 * session exists but the hall does not — and a green "Session scheduled" is a
 * lie the user only discovers on the day. Say both things, and say which room
 * problem it was, using the same vocabulary the events module uses.
 */
function reportSave(result: CourseSessionSaveResult, verb: 'scheduled' | 'updated') {
  if (result.held) {
    toast.success(
      result.awaitingApproval
        ? `Session ${verb}. The room is held, pending the owning college's approval.`
        : `Session ${verb} and the room is held.`,
    );
    return;
  }

  // Scheduling without a room is a deliberate choice, not a failure.
  if (result.reason === 'no_venue') {
    toast.success(`Session ${verb}.`);
    return;
  }

  toast.warning(
    `Session ${verb}, but the room was NOT held. ${
      result.message || REFUSAL_COPY[result.reason ?? 'error']
    }`,
  );
}

export function useCourseSessions(courseEventId: string) {
  return useQuery({
    queryKey: queryKeys.courseSessions.list(courseEventId),
    queryFn: () => CourseSessionService.listByCourse(courseEventId),
    enabled: Boolean(courseEventId),
  });
}

export function useCourseSession(id: string) {
  return useQuery({
    queryKey: queryKeys.courseSessions.detail(id),
    queryFn: () => CourseSessionService.getById(id),
    enabled: Boolean(id),
  });
}

/**
 * The caller's profiles.id is resolved HERE and passed down, not re-derived in
 * the service: ReservationService.createReservation takes the user id as an
 * explicit argument (it writes resource_reservations.user_id and the approval
 * chain keys on it), and profiles.id == auth.uid() in this codebase.
 */
export function useCreateCourseSession() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (dto: CreateCourseSessionDto) => {
      if (!profile?.id) throw new Error('Not signed in');
      return CourseSessionService.create(dto, profile.id);
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.courseSessions.lists() });
      invalidateVenueCaches(qc);
      reportSave(result, 'scheduled');
    },
    // Supabase errors are plain objects — instanceof Error falls through.
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateCourseSession() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCourseSessionDto }) => {
      if (!profile?.id) throw new Error('Not signed in');
      return CourseSessionService.update(id, dto, profile.id);
    },
    onSuccess: (result, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.courseSessions.lists() });
      qc.invalidateQueries({ queryKey: queryKeys.courseSessions.detail(id) });
      invalidateVenueCaches(qc);
      reportSave(result, 'updated');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

/** Cancelling keeps the row (schedule history) and releases the room. */
export function useCancelCourseSession() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (id: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return CourseSessionService.cancel(id, profile.id);
    },
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.courseSessions.lists() });
      qc.invalidateQueries({ queryKey: queryKeys.courseSessions.detail(id) });
      invalidateVenueCaches(qc);
      toast.success('Session cancelled and the room released');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteCourseSession() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: (id: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return CourseSessionService.remove(id, profile.id);
    },
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.courseSessions.lists() });
      // The row is gone — drop its detail cache rather than marking it stale
      // and inviting a refetch that can only 404.
      qc.removeQueries({ queryKey: queryKeys.courseSessions.detail(id) });
      invalidateVenueCaches(qc);
      toast.success('Session deleted and the room released');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}
