// hooks/events/marathon/use-marathon-committees.ts
// React Query hooks for marathon committees and task management.
// Created: 2026-04-07

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  MarathonCommitteeService,
} from '@/lib/services/events/marathon/marathon-committee-service';
import type {
  MarathonCommittee,
  MarathonTask,
  CreateMarathonCommitteeDto,
  CreateMarathonTaskDto,
} from '@/types/events-marathon';

// ============================================================================
// Query Keys
// ============================================================================

const KEYS = {
  all: ['marathon-committees'] as const,
  lists: () => [...KEYS.all, 'list'] as const,
  listByEvent: (eventId: string) => [...KEYS.lists(), eventId] as const,
  summary: (eventId: string) => [...KEYS.all, 'summary', eventId] as const,
};

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * Fetch all committees for an event (with tasks included).
 */
export function useMarathonCommittees(eventId: string) {
  return useQuery({
    queryKey: KEYS.listByEvent(eventId),
    queryFn: () => MarathonCommitteeService.getCommittees(eventId),
    enabled: !!eventId,
  });
}

/**
 * Fetch task summary stats for an event.
 */
export function useTaskSummary(eventId: string) {
  return useQuery({
    queryKey: KEYS.summary(eventId),
    queryFn: () => MarathonCommitteeService.getTaskSummary(eventId),
    enabled: !!eventId,
  });
}

// ============================================================================
// Committee Mutation Hooks
// ============================================================================

/**
 * Create a new committee.
 */
export function useCreateCommittee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMarathonCommitteeDto) =>
      MarathonCommitteeService.createCommittee(dto),
    onSuccess: (committee) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(committee.event_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(committee.event_id) });
      toast.success(`Committee "${committee.name}" created`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create committee');
    },
  });
}

/**
 * Update an existing committee.
 */
export function useUpdateCommittee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<MarathonCommittee> }) =>
      MarathonCommitteeService.updateCommittee(id, dto),
    onSuccess: (committee) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(committee.event_id) });
      toast.success('Committee updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update committee');
    },
  });
}

/**
 * Delete a committee and its tasks.
 */
export function useDeleteCommittee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      MarathonCommitteeService.deleteCommittee(id).then(() => ({ id, eventId })),
    onSuccess: ({ eventId }) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(eventId) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(eventId) });
      toast.success('Committee deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete committee');
    },
  });
}

// ============================================================================
// Task Mutation Hooks
// ============================================================================

/**
 * Create a new task within a committee.
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dto: CreateMarathonTaskDto) =>
      MarathonCommitteeService.createTask(dto),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(task.event_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(task.event_id) });
      toast.success(`Task "${task.title}" added`);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create task');
    },
  });
}

/**
 * Update a task (status, priority, assignee, etc.).
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      eventId,
      dto,
    }: {
      id: string;
      eventId: string;
      dto: Partial<MarathonTask>;
    }) =>
      MarathonCommitteeService.updateTask(id, dto).then((t) => ({ ...t, eventId })),
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(task.event_id) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(task.event_id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update task');
    },
  });
}

/**
 * Delete a task.
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, eventId }: { id: string; eventId: string }) =>
      MarathonCommitteeService.deleteTask(id).then(() => ({ id, eventId })),
    onSuccess: ({ eventId }) => {
      queryClient.invalidateQueries({ queryKey: KEYS.listByEvent(eventId) });
      queryClient.invalidateQueries({ queryKey: KEYS.summary(eventId) });
      toast.success('Task removed');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete task');
    },
  });
}
