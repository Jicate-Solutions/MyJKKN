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
      // The institutional-number freeze (trg_events_stamp_event_number, migration
      // 20261118093000) raises 23514 when somebody moves a NUMBERED event to
      // another college. Its raw message names internal UUIDs, which is no use to
      // a coordinator, so it is mapped here.
      //
      // WHY THIS MATCHES THE MESSAGE AND NOT error.code: the code does not reach
      // this point. EventBaseService.updateEvent does `throw new Error(error.message)`,
      // which discards the PostgrestError and its `code`. Attaching the code there
      // is the right repair, but that file carries FOUR pre-existing type errors
      // (TS2769/TS2345 at lines 134/166/308/334 — reproduced on the unmodified
      // file, they are not from this PR); touching it drags them into the
      // PR-scoped typecheck gate, which then attributes them here. So this PR
      // matches on text it owns: the sentence below is raised by this PR's own
      // trigger, in this PR's own migration.
      if (/already carries institutional number/i.test(error.message)) {
        toast.error(
          "A tournament's host institution is fixed once it has an institutional event number. Reopen the dialog, leave Host Institution unchanged, and save your other edits.",
        );
        return;
      }
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
