// hooks/events/use-tournament-registrations.ts
// React Query hooks for tournament entries/registration (Sports Tournament PR2).
// Created: 2026-06-22 (Sports Tournament PR2).

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { TournamentRegistrationService } from '@/lib/services/events/tournament/tournament-registration-service';
import type { CreateSpotEntryDto, UpdateEntryDto } from '@/types/tournament';

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

/**
 * Record a division's winner, runner-up and third place (BUG-006252, option b).
 * Writes tournament_entries.final_rank (1/2/3, or null to clear) through the same
 * entry PATCH the organiser already uses — the public results page, certificates
 * and medals all read final_rank. One toast for the whole set.
 */
export function useRecordPlacings(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (changes: { entryId: string; final_rank: number | null }[]) => {
      for (const c of changes) {
        await TournamentRegistrationService.updateEntry(eventId, c.entryId, {
          final_rank: c.final_rank,
        });
      }
    },
    onSuccess: () => {
      toast.success('Winners saved');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to save winners'),
    // Refresh even after a partial failure, so the screen shows what was saved.
    onSettled: () => qc.invalidateQueries({ queryKey: KEYS.entries(eventId) }),
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

export function useAddSpotEntry(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSpotEntryDto) => TournamentRegistrationService.addSpotEntry(eventId, dto),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: KEYS.entries(eventId) });
      // The same form was already saved (double click / lost response): nothing
      // new was written, so any change made before resubmitting was not applied.
      if (res.duplicate) toast('This entry was already saved. Check it in the list before adding it again.', { icon: 'ℹ️' });
      else toast.success('Spot entry added');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to add the entry'),
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
