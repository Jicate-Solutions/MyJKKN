// hooks/events/marathon/use-marathon-registrations.ts
// React Query hooks for marathon registration CRUD operations.
// Created: 2026-04-07

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonRegistrationService,
  type RegisterParticipantDto,
} from '@/lib/services/events/marathon/marathon-registration-service';
import type { RegistrationStatus, RegistrationFilters } from '@/types/events';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-registrations'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  listByEvent: (eventId: string, filters?: Partial<RegistrationFilters>) =>
    [...KEYS.lists(), eventId, filters] as const,
  details: () => [...KEYS.all, 'detail'] as const,
  detail: (id: string) => [...KEYS.details(), id] as const,
  stats: (eventId: string) => [...KEYS.all, 'stats', eventId] as const,
  penetration: (eventId: string) => [...KEYS.all, 'penetration', eventId] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch registrations for an event with optional filters.
 */
export function useMarathonRegistrations(
  eventId: string,
  filters?: Partial<RegistrationFilters>
) {
  return useQuery({
    queryKey: KEYS.listByEvent(eventId, filters),
    queryFn: () => MarathonRegistrationService.getRegistrations(eventId, filters),
    enabled: !!eventId,
  });
}

/**
 * Fetch a single registration by ID.
 */
export function useMarathonRegistration(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => MarathonRegistrationService.getRegistration(id),
    enabled: !!id,
  });
}

/**
 * Fetch registration statistics for an event.
 */
export function useRegistrationStats(eventId: string) {
  return useQuery({
    queryKey: KEYS.stats(eventId),
    queryFn: () => MarathonRegistrationService.getRegistrationStats(eventId),
    enabled: !!eventId,
  });
}

/**
 * Fetch college penetration data for an event.
 */
export function useCollegePenetration(eventId: string) {
  return useQuery({
    queryKey: KEYS.penetration(eventId),
    queryFn: () => MarathonRegistrationService.getCollegePenetration(eventId),
    enabled: !!eventId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Register a new participant.
 */
export function useRegisterParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: RegisterParticipantDto) =>
      MarathonRegistrationService.registerParticipant(dto),
    onSuccess: (registration) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.stats(registration.event_id) });
      toast.success(`Participant "${registration.participant_name}" registered — BIB: ${registration.bib_number}`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to register participant');
    },
  });
}

/**
 * Update registration status.
 */
export function useUpdateRegistrationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: RegistrationStatus }) =>
      MarathonRegistrationService.updateRegistrationStatus(id, status),
    onSuccess: (registration) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(registration.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.stats(registration.event_id) });
      toast.success(`Status updated to "${registration.status}"`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });
}

/**
 * Check in a participant at venue.
 */
export function useCheckInParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, checkedInBy }: { id: string; checkedInBy: string }) =>
      MarathonRegistrationService.checkInParticipant(id, checkedInBy),
    onSuccess: (registration) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(registration.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.stats(registration.event_id) });
      toast.success(`${registration.participant_name} checked in`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to check in participant');
    },
  });
}

/**
 * Cancel a registration.
 */
export function useCancelRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      MarathonRegistrationService.cancelRegistration(id),
    onSuccess: (registration) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(registration.id) });
      queryClient.invalidateQueries({ queryKey: KEYS.stats(registration.event_id) });
      toast.success('Registration cancelled');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel registration');
    },
  });
}
