// hooks/events/marathon/use-marathon-events.ts
// React Query hooks for marathon event CRUD operations.
// Created: 2026-04-07

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MarathonEventService } from '@/lib/services/events/marathon/marathon-event-service';
import type {
  Event,
  EventCategory,
  EventStatus,
  CreateEventDto,
  UpdateEventDto,
} from '@/types/events';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-events'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  listByInstitution: (institutionId: string) =>
    [...KEYS.lists(), institutionId] as const,
  details: () => [...KEYS.all, 'detail'] as const,
  detail: (id: string) => [...KEYS.details(), id] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch all marathon events for an institution.
 */
export function useMarathonEvents(institutionId: string) {
  return useQuery({
    queryKey: KEYS.listByInstitution(institutionId),
    queryFn: () => MarathonEventService.getMarathonEvents(institutionId),
    enabled: !!institutionId,
  });
}

/**
 * Fetch a single marathon event with its categories.
 */
export function useMarathonEvent(id: string) {
  return useQuery({
    queryKey: KEYS.detail(id),
    queryFn: () => MarathonEventService.getMarathonEvent(id),
    enabled: !!id,
  });
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * Create a new marathon event (with default categories).
 */
export function useCreateMarathonEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: Omit<CreateEventDto, 'event_type'>) =>
      MarathonEventService.createMarathonEvent(dto),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      toast.success(`Marathon event "${event.name}" created successfully`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create marathon event');
    },
  });
}

/**
 * Update a marathon event (general settings, registration config, etc.).
 */
export function useUpdateMarathonEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      dto,
    }: {
      id: string;
      dto: Partial<UpdateEventDto>;
    }) => MarathonEventService.updateGeneralSettings(id, dto),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.lists() });
      queryClient.invalidateQueries({ queryKey: KEYS.detail(event.id) });
      toast.success('Event updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update event');
    },
  });
}

/**
 * Update marathon event status with transition validation.
 */
export function useUpdateMarathonStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: EventStatus }) =>
      MarathonEventService.updateStatus(id, status),
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

/**
 * Update registration configuration.
 */
export function useUpdateRegistrationConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      config,
    }: {
      id: string;
      config: {
        registration_open_date?: string;
        registration_close_date?: string;
        allow_external_registration?: boolean;
        registration_config?: Record<string, unknown>;
      };
    }) => MarathonEventService.updateRegistrationConfig(id, config),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(event.id) });
      toast.success('Registration settings updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update registration settings');
    },
  });
}

/**
 * Update route configuration.
 */
export function useUpdateRouteConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      config,
    }: {
      id: string;
      config: Record<string, unknown>;
    }) => MarathonEventService.updateRouteConfig(id, config),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(event.id) });
      toast.success('Route configuration updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update route configuration');
    },
  });
}

// ============================================================================
// Category Mutation Hooks
// ============================================================================

/**
 * Create a new event category.
 */
export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: Partial<EventCategory>) =>
      MarathonEventService.createCategory(dto),
    onSuccess: (category) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.detail(category.event_id),
      });
      toast.success(`Category "${category.name}" created`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create category');
    },
  });
}

/**
 * Update an existing event category.
 */
export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      eventId,
      dto,
    }: {
      id: string;
      eventId: string;
      dto: Partial<EventCategory>;
    }) => MarathonEventService.updateCategory(id, dto),
    onSuccess: (_category, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.detail(variables.eventId),
      });
      toast.success('Category updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update category');
    },
  });
}

/**
 * Delete an event category.
 */
export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      MarathonEventService.deleteCategory(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.detail(variables.eventId),
      });
      toast.success('Category deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete category');
    },
  });
}
