// hooks/events/shared/use-event-volunteers.ts
// React Query hooks for shared event volunteers + incidents (Events Platform Promotion PR4).
// Volunteers support guest (non-JKKN) check-in by name/phone — decision #8.

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventVolunteerService } from '@/lib/services/events/shared/event-volunteer-service';
import type { CreateEventVolunteerDto, CreateMarathonIncidentDto } from '@/types/events-marathon';

const VOL_KEYS = {
  all: ['event-volunteers'] as const,
  list: (eventId: string) => [...VOL_KEYS.all, 'list', eventId] as const,
};

const INC_KEYS = {
  all: ['event-incidents'] as const,
  list: (eventId: string) => [...INC_KEYS.all, 'list', eventId] as const,
};

// --- Volunteers ------------------------------------------------------------

export function useEventVolunteers(eventId: string) {
  return useQuery({
    queryKey: VOL_KEYS.list(eventId),
    queryFn: () => EventVolunteerService.getVolunteers(eventId),
    enabled: !!eventId,
  });
}

function useInvalidateVolunteers(eventId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: VOL_KEYS.list(eventId) });
}

export function useCheckinVolunteer(eventId: string) {
  const invalidate = useInvalidateVolunteers(eventId);
  return useMutation({
    mutationFn: (dto: CreateEventVolunteerDto) => EventVolunteerService.checkinVolunteer(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Volunteer checked in');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to check in volunteer'),
  });
}

export function useCheckoutVolunteer(eventId: string) {
  const invalidate = useInvalidateVolunteers(eventId);
  return useMutation({
    mutationFn: (id: string) => EventVolunteerService.checkoutVolunteer(id),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || 'Failed to check out volunteer'),
  });
}

export function useDeleteVolunteer(eventId: string) {
  const invalidate = useInvalidateVolunteers(eventId);
  return useMutation({
    mutationFn: (id: string) => EventVolunteerService.deleteVolunteer(id),
    onSuccess: () => {
      invalidate();
      toast.success('Volunteer removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove volunteer'),
  });
}

// --- Incidents -------------------------------------------------------------

export function useEventIncidents(eventId: string) {
  return useQuery({
    queryKey: INC_KEYS.list(eventId),
    queryFn: () => EventVolunteerService.getIncidents(eventId),
    enabled: !!eventId,
  });
}

function useInvalidateIncidents(eventId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: INC_KEYS.list(eventId) });
}

export function useCreateIncident(eventId: string) {
  const invalidate = useInvalidateIncidents(eventId);
  return useMutation({
    mutationFn: (dto: CreateMarathonIncidentDto) => EventVolunteerService.createIncident(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Incident logged');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to log incident'),
  });
}

export function useResolveIncident(eventId: string) {
  const invalidate = useInvalidateIncidents(eventId);
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      EventVolunteerService.resolveIncident(id, notes),
    onSuccess: () => {
      invalidate();
      toast.success('Incident resolved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to resolve incident'),
  });
}

export function useDeleteIncident(eventId: string) {
  const invalidate = useInvalidateIncidents(eventId);
  return useMutation({
    mutationFn: (id: string) => EventVolunteerService.deleteIncident(id),
    onSuccess: () => {
      invalidate();
      toast.success('Incident removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove incident'),
  });
}
