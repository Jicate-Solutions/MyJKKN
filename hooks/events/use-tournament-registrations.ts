// hooks/events/use-tournament-registrations.ts
// React Query hooks for tournament entries/registration (Sports Tournament PR2).
// Created: 2026-06-22 (Sports Tournament PR2).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { TournamentRegistrationService } from '@/lib/services/events/tournament/tournament-registration-service';
import type { UpdateEntryDto } from '@/types/tournament';

const KEYS = {
  entries: (eventId: string) => ['tournament-entries', eventId] as const,
};

/** List entries for a tournament (organizer view). */
export function useTournamentEntries(eventId: string) {
  return useQuery({
    queryKey: KEYS.entries(eventId),
    queryFn: () => TournamentRegistrationService.listEntries(eventId),
    enabled: !!eventId,
  });
}

export function useUpdateEntry(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, dto }: { entryId: string; dto: UpdateEntryDto }) =>
      TournamentRegistrationService.updateEntry(eventId, entryId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.entries(eventId) });
      toast.success('Entry updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update entry'),
  });
}

export function useMarkEntryPaid(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, reference }: { entryId: string; reference?: string }) =>
      TournamentRegistrationService.markPaid(eventId, entryId, reference),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.entries(eventId) });
      toast.success('Marked as paid');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to mark paid'),
  });
}

export function useWithdrawEntry(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => TournamentRegistrationService.withdraw(eventId, entryId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.entries(eventId) });
      if (res.refund === 'pending') toast.success('Withdrawn — refund marked pending.');
      else if (res.refund === 'none') toast(res.reason || 'Withdrawn — no refund (past cutoff).');
      else toast.success('Entry withdrawn');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to withdraw entry'),
  });
}

export function useGeneratePaymentLink(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => TournamentRegistrationService.generatePaymentLink(eventId, entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.entries(eventId) });
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create payment link'),
  });
}
