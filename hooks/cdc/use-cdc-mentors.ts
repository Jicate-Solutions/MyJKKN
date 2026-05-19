'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { MentorService } from '@/lib/services/cdc/mentor-service';
import type { CreateMentorPairingDto, UpdateMentorPairingDto, MentorPairingFilters } from '@/types/cdc/mentors';

const mentorKeys = {
  all: ['cdc-mentor-pairings'] as const,
  lists: () => [...mentorKeys.all, 'list'] as const,
  list: (filters: MentorPairingFilters) => [...mentorKeys.lists(), filters] as const,
  details: () => [...mentorKeys.all, 'detail'] as const,
  detail: (id: string) => [...mentorKeys.details(), id] as const,
};

export function useMentorPairingList(filters: MentorPairingFilters = {}) {
  return useQuery({
    queryKey: mentorKeys.list(filters),
    queryFn: () => MentorService.list(filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useMentorPairingById(id: string) {
  return useQuery({
    queryKey: mentorKeys.detail(id),
    queryFn: () => MentorService.getById(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateMentorPairing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateMentorPairingDto) => MentorService.create(dto),
    onSuccess: () => {
      toast.success('Mentor pairing created.');
      qc.invalidateQueries({ queryKey: mentorKeys.lists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateMentorPairing(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateMentorPairingDto) => MentorService.update(id, dto),
    onSuccess: () => {
      toast.success('Pairing updated.');
      qc.invalidateQueries({ queryKey: mentorKeys.detail(id) });
      qc.invalidateQueries({ queryKey: mentorKeys.lists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
