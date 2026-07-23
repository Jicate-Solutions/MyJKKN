'use client';

// hooks/cdc/use-club-initiatives.ts — CDC Club Initiatives (BUG-004299).
// Mirrors use-cdc-clubs.ts: module-level RLS-scoped client + react-hot-toast.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ClubInitiativesService } from '@/lib/services/cdc/club-initiatives-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { CreateClubInitiativeDto, UpdateClubInitiativeDto } from '@/types/cdc/clubs-initiatives';

const supabase = createClientSupabaseClient();

const initiativeKeys = {
  all: ['cdc-club-initiatives'] as const,
  list: (clubId: string) => [...initiativeKeys.all, 'list', clubId] as const,
};

export function useClubInitiatives(clubId: string) {
  return useQuery({
    queryKey: initiativeKeys.list(clubId),
    queryFn: () => ClubInitiativesService.list(supabase, clubId),
    enabled: !!clubId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAddClubInitiative(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateClubInitiativeDto) => ClubInitiativesService.create(supabase, dto),
    onSuccess: () => {
      toast.success('Initiative added.');
      qc.invalidateQueries({ queryKey: initiativeKeys.list(clubId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateClubInitiative(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateClubInitiativeDto }) =>
      ClubInitiativesService.update(supabase, id, dto),
    onSuccess: () => {
      toast.success('Initiative updated.');
      qc.invalidateQueries({ queryKey: initiativeKeys.list(clubId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteClubInitiative(clubId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ClubInitiativesService.remove(supabase, id),
    onSuccess: () => {
      toast.success('Initiative removed.');
      qc.invalidateQueries({ queryKey: initiativeKeys.list(clubId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
