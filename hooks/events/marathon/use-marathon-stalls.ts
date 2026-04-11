// hooks/events/marathon/use-marathon-stalls.ts
// React Query hooks for marathon stall CRUD and auto-assignment.
// Created: 2026-04-11

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonStallService,
} from '@/lib/services/events/marathon/marathon-stall-service';
import type {
  EventStall,
  CreateEventStallDto,
  UpdateEventStallDto,
} from '@/types/events-marathon';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-stalls'] as const,
  listByEvent: (eventId: string) => [...KEYS.all, eventId] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch active stalls for an event.
 */
export function useMarathonStalls(eventId: string) {
  return useQuery({
    queryKey: KEYS.listByEvent(eventId),
    queryFn: () => MarathonStallService.getStalls(eventId),
    enabled: !!eventId,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new stall.
 */
export function useCreateStall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateEventStallDto) =>
      MarathonStallService.createStall(dto),
    onSuccess: (stall: EventStall) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(stall.event_id) });
      toast.success(`Stall "${stall.stall_name}" created`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create stall');
    },
  });
}

/**
 * Update an existing stall.
 */
export function useUpdateStall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto, eventId }: { id: string; dto: UpdateEventStallDto; eventId: string }) =>
      MarathonStallService.updateStall(id, dto),
    onSuccess: (_stall, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(variables.eventId) });
      toast.success('Stall updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update stall');
    },
  });
}

/**
 * Soft-delete a stall.
 */
export function useDeleteStall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      MarathonStallService.deleteStall(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(variables.eventId) });
      toast.success('Stall removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete stall');
    },
  });
}

/**
 * Auto-assign stalls to all registrations sequentially by BIB.
 */
export function useAutoAssignStalls() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      MarathonStallService.autoAssignStalls(eventId),
    onSuccess: (result, eventId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(eventId) });
      queryClient.invalidateQueries({ queryKey: ['marathon-ops-stats'] });
      queryClient.invalidateQueries({ queryKey: ['marathon-registrations'] });
      toast.success(`Stalls assigned: ${result.assigned} assigned, ${result.unassigned} unassigned`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to auto-assign stalls');
    },
  });
}

/**
 * Clear all stall assignments for an event.
 */
export function useClearStallAssignments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (eventId: string) =>
      MarathonStallService.clearAssignments(eventId),
    onSuccess: (_data, eventId) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(eventId) });
      queryClient.invalidateQueries({ queryKey: ['marathon-ops-stats'] });
      queryClient.invalidateQueries({ queryKey: ['marathon-registrations'] });
      toast.success('All stall assignments cleared');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to clear assignments');
    },
  });
}
