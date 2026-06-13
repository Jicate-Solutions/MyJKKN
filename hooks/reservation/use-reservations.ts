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
 * Hook to fetch pending approvals (reservations pending approval).
 * Optional filters narrow the queue (e.g. institution_id for admins
 * with multi-institution access).
 */
export function usePendingApprovals(filters?: ReservationFilters) {
  return useQuery({
    queryKey: ['pending-approvals', filters],
    queryFn: () =>
      ReservationService.getReservations({
        ...filters,
        status: ReservationStatus.PENDING
      }),
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
 * Hook to fetch the approval chain for a reservation, including approver profiles.
 */
export function useReservationApprovals(reservationId: string | undefined) {
  return useQuery({
    queryKey: ['reservation-approvals', reservationId],
    queryFn: async () => {
      if (!reservationId) return [];
      const supabase = (
        await import('@/lib/supabase/client')
      ).createClientSupabaseClient();

      const { data, error } = await (supabase as any)
        .from('resource_approvals')
        .select(
          `
          id,
          approver_user_id,
          approval_level,
          status,
          approved_at,
          comments,
          rejection_reason,
          created_at,
          approver:profiles!resource_approvals_approver_user_id_fkey(
            id, full_name, email, avatar_url, role
          )
        `
        )
        .eq('reservation_id', reservationId)
        .order('approval_level', { ascending: true });

      if (error) {
        console.error('Error fetching reservation approvals:', error);
        return [];
      }

      return (data || []) as ApprovalChainEntry[];
    },
    enabled: !!reservationId,
    staleTime: 15 * 1000,
    retry: 3
  });
}

export interface ApprovalChainEntry {
  id: string;
  approver_user_id: string;
  approval_level: number;
  status: 'pending' | 'approved' | 'rejected';
  approved_at: string | null;
  comments: string | null;
  rejection_reason: string | null;
  created_at: string;
  approver: {
    id: string;
    full_name: string;
    email: string;
    avatar_url: string | null;
    role: string | null;
  } | null;
}

export interface MyApprovalData {
  statusMap: Map<string, string>;
  myPending: number;
  myApprovedTotal: number;
  myApprovedToday: number;
  myRejectedTotal: number;
  myRejectedToday: number;
}

/**
 * Hook to fetch the current user's own approval statuses across all
 * reservations. Returns a status Map for action-button lookup plus
 * personal approval stats for the dashboard cards.
 * Explicitly filters by userId to avoid picking up other approvers' rows
 * that the broadened RLS policy now exposes to requesters.
 */
export function useMyApprovalStatuses(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-approval-statuses', userId],
    queryFn: async (): Promise<MyApprovalData> => {
      const empty: MyApprovalData = {
        statusMap: new Map(),
        myPending: 0,
        myApprovedTotal: 0,
        myApprovedToday: 0,
        myRejectedTotal: 0,
        myRejectedToday: 0
      };
      if (!userId) return empty;

      const supabase = (
        await import('@/lib/supabase/client')
      ).createClientSupabaseClient();

      const { data, error } = await (supabase as any)
        .from('resource_approvals')
        .select('reservation_id, status, approved_at')
        .eq('approver_user_id', userId);

      if (error) {
        console.error('Error fetching my approval statuses:', error);
        return empty;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const statusMap = new Map<string, string>();
      let myPending = 0;
      let myApprovedTotal = 0;
      let myApprovedToday = 0;
      let myRejectedTotal = 0;
      let myRejectedToday = 0;

      for (const row of data || []) {
        statusMap.set(row.reservation_id, row.status);
        const actedToday =
          row.approved_at && new Date(row.approved_at) >= today;

        if (row.status === 'pending') myPending++;
        if (row.status === 'approved') {
          myApprovedTotal++;
          if (actedToday) myApprovedToday++;
        }
        if (row.status === 'rejected') {
          myRejectedTotal++;
          if (actedToday) myRejectedToday++;
        }
      }

      return {
        statusMap,
        myPending,
        myApprovedTotal,
        myApprovedToday,
        myRejectedTotal,
        myRejectedToday
      };
    },
    enabled: !!userId,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
    retry: 3
  });
}

/**
 * Hook to fetch reservations for a date range — used by the calendar view.
 * Fetches all non-cancelled reservations visible to the current user.
 */
export function useCalendarReservations(
  startDate: string | undefined,
  endDate: string | undefined,
  resourceId?: string,
  institutionId?: string
) {
  return useQuery({
    queryKey: [
      'calendar-reservations',
      startDate,
      endDate,
      resourceId,
      institutionId
    ],
    queryFn: () => {
      const filters: ReservationFilters = {};
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      if (resourceId) filters.resource_id = resourceId;
      if (institutionId) filters.institution_id = institutionId;
      return ReservationService.getReservations(filters);
    },
    enabled: !!startDate && !!endDate,
    staleTime: 30 * 1000,
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
