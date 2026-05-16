// ============================================================================
// Premium Stay Phase 1 — usePremiumAllocation hooks
// ============================================================================
// Spec: .claude/scratch/premium-stay-spec-2026-05-16.html
// Service: lib/services/campus-living/hostel-premium-allocation-service.ts
//
// React Query wrappers for the premium allocation flow. Phase 1 fully wires
// getEligibility, listAvailableRoomsForPremium, and countAllocationsByTier
// (admin-side reporting). reserveBed / inviteRoommate / confirmRoommate are
// exposed as hooks but call into Phase 1 service stubs — Phase 2 fills them.
// ============================================================================

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  getEligibility,
  listAvailableRoomsForPremium,
  reserveBed,
  inviteRoommate,
  confirmRoommate,
  countAllocationsByTier,
  type ReserveBedInput,
  type ReserveBedResult,
  type InviteRoommateInput,
  type PremiumAllocationCounts,
  type PremiumAvailableRoom,
} from '@/lib/services/campus-living/hostel-premium-allocation-service';
import type {
  PremiumEligibilityResult,
  RoommateInviteState,
} from '@/types/campus-living/premium';

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const premiumAllocationKeys = {
  all: ['premium-allocation'] as const,
  eligibility: (learnerId: string, tierId: string) =>
    ['premium-allocation', 'eligibility', learnerId, tierId] as const,
  availableRooms: (institutionId: string | null | undefined) =>
    ['premium-allocation', 'available-rooms', institutionId ?? 'all'] as const,
  counts: (institutionId: string | null | undefined) =>
    ['premium-allocation', 'counts', institutionId ?? 'all'] as const,
};

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

export function usePremiumEligibility(
  learnerId: string | null | undefined,
  tierId: string | null | undefined,
) {
  return useQuery<PremiumEligibilityResult, Error>({
    queryKey:
      learnerId && tierId
        ? premiumAllocationKeys.eligibility(learnerId, tierId)
        : ['premium-allocation', 'eligibility', 'noop'],
    queryFn: () => {
      if (!learnerId || !tierId) {
        return Promise.resolve<PremiumEligibilityResult>({
          eligible: false,
          reason: 'tier_not_found',
        });
      }
      return getEligibility(learnerId, tierId);
    },
    enabled: Boolean(learnerId) && Boolean(tierId),
  });
}

// ---------------------------------------------------------------------------
// Available rooms
// ---------------------------------------------------------------------------

export function usePremiumAvailableRooms(institutionId: string | null | undefined) {
  return useQuery<PremiumAvailableRoom[], Error>({
    queryKey: premiumAllocationKeys.availableRooms(institutionId),
    queryFn: () => {
      if (!institutionId) return Promise.resolve<PremiumAvailableRoom[]>([]);
      return listAvailableRoomsForPremium(institutionId);
    },
    enabled: Boolean(institutionId),
  });
}

// ---------------------------------------------------------------------------
// Allocation counts (dashboard)
// ---------------------------------------------------------------------------

export function usePremiumAllocationCounts(institutionId: string | null | undefined) {
  return useQuery<PremiumAllocationCounts, Error>({
    queryKey: premiumAllocationKeys.counts(institutionId),
    queryFn: () => countAllocationsByTier(institutionId ?? null),
  });
}

// ---------------------------------------------------------------------------
// Mutations (Phase 1 stubs — bodies fill in Phase 2)
// ---------------------------------------------------------------------------

export function useReservePremiumBed() {
  const qc = useQueryClient();
  return useMutation<ReserveBedResult, Error, ReserveBedInput>({
    mutationFn: (input) => reserveBed(input),
    onSuccess: (result) => {
      if (result.success) {
        qc.invalidateQueries({ queryKey: premiumAllocationKeys.all });
        toast.success('Premium bed reserved');
      } else if (result.reason === 'bed_locked_by_other') {
        toast.error('Another learner just picked this bed. Pick another, please.');
      } else {
        toast.error(result.detail || 'Could not reserve bed');
      }
    },
    onError: (err) => {
      toast.error(err.message || 'Could not reserve bed');
    },
  });
}

export function useInviteRoommate() {
  return useMutation<RoommateInviteState | null, Error, InviteRoommateInput>({
    mutationFn: (input) => inviteRoommate(input),
    onSuccess: (state) => {
      if (state) toast.success('Roommate invite sent');
      else toast.error('Roommate invite is a Phase 2 feature');
    },
    onError: (err) => {
      toast.error(err.message || 'Could not send roommate invite');
    },
  });
}

export function useConfirmRoommate() {
  return useMutation<RoommateInviteState | null, Error, string>({
    mutationFn: (token) => confirmRoommate(token),
    onSuccess: (state) => {
      if (state) toast.success('Roommate confirmed');
      else toast.error('Roommate confirmation is a Phase 2 feature');
    },
    onError: (err) => {
      toast.error(err.message || 'Could not confirm roommate');
    },
  });
}
