// hooks/events/use-tournaments.ts
// React Query hooks for sports tournament CRUD (mirror of use-marathon-events).
// Created: 2026-06-22 (Sports Tournament PR1).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { TournamentEventService } from '@/lib/services/events/tournament/tournament-event-service';
import type { UpdateEventDto, EventStatus } from '@/types/events';
import type {
  CreateTournamentDto,
  CreateDivisionDto,
  UpdateDivisionDto,
} from '@/types/tournament';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['tournaments'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  details: () => [...KEYS.all, 'detail'] as const,
  detail: (id: string) => [...KEYS.details(), id] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/** Fetch all tournaments (RLS gates per-row visibility). */
export function useTournaments() {
  return useQuery({
    queryKey: KEYS.lists(),
    queryFn: () => TournamentEventService.getTournaments(),
  });
}

/** Fetch a single tournament with its divisions. */
export function useTournament(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => TournamentEventService.getTournament(id),
    enabled: !!id,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/** Create a new tournament (+ seeded divisions). */
export function useCreateTournament() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateTournamentDto) =>
      TournamentEventService.createTournament(dto),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success(`Tournament "${event.name}" created successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create tournament');
    },
  });
}

/** Update general tournament settings. */
export function useUpdateTournament() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<UpdateEventDto> }) =>
      TournamentEventService.updateTournament(id, dto),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(event.id) });
      toast.success('Tournament updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update tournament');
    },
  });
}

/** Change tournament status (validated against EVENT_STATUS_TRANSITIONS). */
export function useUpdateTournamentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) =>
      TournamentEventService.updateStatus(id, status),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(event.id) });
      toast.success(`Status changed to "${event.status}"`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update status');
    },
  });
}

/** Delete a tournament. */
export function useDeleteTournament() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => TournamentEventService.deleteTournament(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success('Tournament deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete tournament');
    },
  });
}

// ============================================================================
// Division Mutation Hooks
// ============================================================================

/** Create a division under a tournament. */
export function useCreateDivision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventId, dto }: { eventId: string; dto: CreateDivisionDto }) =>
      TournamentEventService.createDivision(eventId, dto),
    onSuccess: (division) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(division.event_id) });
      toast.success('Division added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add division');
    },
  });
}

/** Update a division. */
export function useUpdateDivision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      eventId: _eventId,
      dto,
    }: {
      id: string;
      eventId: string;
      dto: UpdateDivisionDto;
    }) => TournamentEventService.updateDivision(id, dto),
    onSuccess: (_division, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.eventId) });
      toast.success('Division updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update division');
    },
  });
}

/** Delete a division. */
export function useDeleteDivision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId: _eventId }: { id: string; eventId: string }) =>
      TournamentEventService.deleteDivision(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(variables.eventId) });
      toast.success('Division deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete division');
    },
  });
}
