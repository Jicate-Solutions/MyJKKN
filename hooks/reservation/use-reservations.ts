// hooks/reservation/use-reservations.ts
// React Query hooks for fetching reservations

import { useQuery } from '@tanstack/react-query';
import { ReservationService } from '@/lib/services/reservation/reservation-service';
import { ReservationStatus } from '@/types/reservation';
import type { ReservationFilters, Reservation } from '@/types/reservation';

/**
 * Hook to fetch all reservations with optional filters
 */
export function useReservations(filters?: ReservationFilters) {
  return useQuery({
    queryKey: ['reservations', filters],
    queryFn: () => ReservationService.getReservations(filters),
    staleTime: 30 * 1000, // 30 seconds
    retry: 3
  });
}

/**
 * Hook to fetch a single reservation by ID
 */
export function useReservation(id: string | undefined) {
  return useQuery({
    queryKey: ['reservation', id],
    queryFn: () => {
      if (!id) return null;
      return ReservationService.getReservation(id);
    },
    enabled: !!id,
    staleTime: 30 * 1000,
    retry: 3
  });
}

/**
 * Hook to fetch user's reservations
 */
export function useMyReservations(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-reservations', userId],
    queryFn: () => {
      if (!userId) return [];
      return ReservationService.getReservations({ user_id: userId });
    },
    enabled: !!userId,
    staleTime: 30 * 1000,
    retry: 3
  });
}

/**
 * Hook to fetch pending approvals (reservations pending approval)
 */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ['pending-approvals'],
    queryFn: () =>
      ReservationService.getReservations({ status: ReservationStatus.PENDING }),
    staleTime: 15 * 1000, // 15 seconds for approvals
    refetchInterval: 30 * 1000, // Refetch every 30s
    retry: 3
  });
}

/**
 * Hook to fetch reservation statistics
 */
export function useReservationStats(userId?: string) {
  return useQuery({
    queryKey: ['reservation-stats', userId],
    queryFn: () => ReservationService.getReservationStats(userId),
    staleTime: 30 * 1000, // 30 seconds for real-time updates
    refetchInterval: 60 * 1000, // Refetch every 1 minute
    refetchOnWindowFocus: true,
    retry: 3
  });
}

/**
 * Hook to fetch approval dashboard statistics with today's counts
 */
export function useApprovalStats() {
  return useQuery({
    queryKey: ['approval-stats'],
    queryFn: async () => {
      const supabase = (
        await import('@/lib/supabase/client')
      ).createClientSupabaseClient();

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      // Get pending approvals
      const { data: pending } = await supabase
        .from('resource_reservations')
        .select('id, start_time')
        .eq('status', ReservationStatus.PENDING);

      // Type cast to fix TypeScript inference after React 19 upgrade
      const pendingData = pending as { id: string; start_time: string }[] | null;

      // Get today's approved
      const { data: approvedToday } = await supabase
        .from('resource_reservations')
        .select('id')
        .eq('status', ReservationStatus.APPROVED)
        .gte('updated_at', todayISO);

      // Get today's rejected
      const { data: rejectedToday } = await supabase
        .from('resource_reservations')
        .select('id')
        .eq('status', ReservationStatus.REJECTED)
        .gte('updated_at', todayISO);

      const now = new Date();
      const overdueCount =
        pendingData?.filter((r) => new Date(r.start_time) < now).length || 0;

      return {
        pending_approvals: pendingData?.length || 0,
        approved_today: approvedToday?.length || 0,
        rejected_today: rejectedToday?.length || 0,
        overdue_approvals: overdueCount
      };
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Auto-refetch every 1 minute
    refetchOnWindowFocus: true,
    retry: 3
  });
}

/**
 * Hook to fetch user reservation summary
 */
export function useUserReservationSummary(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-reservation-summary', userId],
    queryFn: () => {
      if (!userId) return null;
      return ReservationService.getUserReservationSummary(userId);
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
    retry: 3
  });
}

/**
 * Hook to fetch upcoming reservations
 */
export function useUpcomingReservations(userId?: string) {
  const now = new Date().toISOString();

  return useQuery({
    queryKey: ['upcoming-reservations', userId],
    queryFn: () =>
      ReservationService.getReservations({
        user_id: userId,
        start_date: now,
        status: ReservationStatus.APPROVED
      }),
    staleTime: 30 * 1000,
    retry: 3
  });
}
