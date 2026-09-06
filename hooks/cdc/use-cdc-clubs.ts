'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ClubService } from '@/lib/services/cdc/club-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CreateClubDto, UpdateClubDto, AddMemberDto, ClubFilters } from '@/types/cdc/clubs';

const supabase = createClientSupabaseClient();

const clubKeys = {
  all: ['cdc-clubs'] as const,
  lists: () => [...clubKeys.all, 'list'] as const,
  list: (filters: ClubFilters) => [...clubKeys.lists(), filters] as const,
  details: () => [...clubKeys.all, 'detail'] as const,
  detail: (id: string) => [...clubKeys.details(), id] as const,
  members: (clubId: string) => [...clubKeys.all, 'members', clubId] as const,
};

export function useClubList(filters: ClubFilters = {}) {
  return useQuery({
    queryKey: clubKeys.list(filters),
    queryFn: () => ClubService.list(supabase, filters),
    staleTime: 2 * 60 * 1000,
  });
}

export function useClubById(id: string) {
  return useQuery({
    queryKey: clubKeys.detail(id),
    queryFn: () => ClubService.getById(supabase, id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}

export function useClubMembers(clubId: string) {
  return useQuery({
    queryKey: clubKeys.members(clubId),
    queryFn: () => ClubService.listMembers(supabase, clubId),
    enabled: !!clubId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCreateClub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateClubDto) => ClubService.create(supabase, dto),
    onSuccess: () => {
      toast.success('Club created.');
      qc.invalidateQueries({ queryKey: clubKeys.lists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateClub(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateClubDto) => ClubService.update(supabase, id, dto),
    onSuccess: () => {
      toast.success('Club updated.');
      qc.invalidateQueries({ queryKey: clubKeys.detail(id) });
      qc.invalidateQueries({ queryKey: clubKeys.lists() });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAddMember(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: AddMemberDto) => ClubService.addMember(supabase, clubId, dto),
    onSuccess: () => {
      toast.success('Member added.');
      qc.invalidateQueries({ queryKey: clubKeys.members(clubId) });
      qc.invalidateQueries({ queryKey: clubKeys.detail(clubId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRemoveMember(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (learnerId: string) => ClubService.removeMember(supabase, clubId, learnerId),
    onSuccess: () => {
      toast.success('Member removed.');
      qc.invalidateQueries({ queryKey: clubKeys.members(clubId) });
      qc.invalidateQueries({ queryKey: clubKeys.detail(clubId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
