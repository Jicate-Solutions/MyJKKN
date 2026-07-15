// hooks/events/shared/use-event-committees.ts
// React Query hooks for shared event committees + prep tasks (Events Platform Promotion PR3).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EventCommitteeService } from '@/lib/services/events/shared/event-committee-service';
import type {
  MarathonCommittee,
  MarathonTask,
  CreateMarathonCommitteeDto,
  CreateMarathonTaskDto,
  ExternalCommitteeMember,
} from '@/types/events-marathon';

const KEYS = {
  all: ['event-committees'] as const,
  list: (eventId: string) => [...KEYS.all, 'list', eventId] as const,
};

export function useEventCommittees(eventId: string) {
  return useQuery({
    queryKey: KEYS.list(eventId),
    queryFn: () => EventCommitteeService.getCommittees(eventId),
    enabled: !!eventId,
  });
}

function useInvalidate(eventId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEYS.list(eventId) });
}

export function useCreateEventCommittee(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: (dto: CreateMarathonCommitteeDto) => EventCommitteeService.createCommittee(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Committee added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add committee'),
  });
}

export function useDeleteEventCommittee(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: (id: string) => EventCommitteeService.deleteCommittee(id),
    onSuccess: () => {
      invalidate();
      toast.success('Committee removed');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to remove committee'),
  });
}

export function useAddInternalMembers(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: ({
      committee,
      people,
    }: {
      committee: MarathonCommittee;
      people: { member_id: string; name: string }[];
    }) => EventCommitteeService.addInternalMembers(committee, people),
    onSuccess: (_data, { people }) => {
      invalidate();
      toast.success(`${people.length} member${people.length === 1 ? '' : 's'} added`);
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add members'),
  });
}

export function useRemoveInternalMember(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: ({ committee, index }: { committee: MarathonCommittee; index: number }) =>
      EventCommitteeService.removeInternalMember(committee, index),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || 'Failed to remove member'),
  });
}

export function useAddExternalMember(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: ({ committee, member }: { committee: MarathonCommittee; member: ExternalCommitteeMember }) =>
      EventCommitteeService.addExternalMember(committee, member),
    onSuccess: () => {
      invalidate();
      toast.success('Guest member added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add member'),
  });
}

export function useRemoveExternalMember(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: ({ committee, index }: { committee: MarathonCommittee; index: number }) =>
      EventCommitteeService.removeExternalMember(committee, index),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || 'Failed to remove member'),
  });
}

export function useCreateEventTask(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: (dto: CreateMarathonTaskDto) => EventCommitteeService.createTask(dto),
    onSuccess: () => {
      invalidate();
      toast.success('Task added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add task'),
  });
}

export function useUpdateEventTask(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<MarathonTask> }) =>
      EventCommitteeService.updateTask(id, dto),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || 'Failed to update task'),
  });
}

export function useDeleteEventTask(eventId: string) {
  const invalidate = useInvalidate(eventId);
  return useMutation({
    mutationFn: (id: string) => EventCommitteeService.deleteTask(id),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message || 'Failed to remove task'),
  });
}
