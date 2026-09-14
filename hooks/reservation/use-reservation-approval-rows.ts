// hooks/reservation/use-reservation-approval-rows.ts
// The approval-chain rows for ONE reservation, in the shape
// evaluateApprovalTurn() needs to answer "is it my turn?".
//
// BUG-004010: the reservation detail page has to decide whether the signed-in
// approver may act right now. The approvals queue loads the same rows for a
// page of reservations (useQueueApprovalRows); this is the single-reservation
// counterpart. It shares the 'reservation-approvals' key prefix so the
// approve/reject mutations' existing invalidation refreshes it too.

import { useQuery } from '@tanstack/react-query';
import type { ApprovalRecordLike } from '@/lib/services/reservation/approval-chain';
import { logger } from '@/lib/utils/enhanced-logger';

interface UseReservationApprovalRowsOptions {
  /** Skip the fetch (e.g. the reservation is no longer pending). */
  enabled?: boolean;
}

export function useReservationApprovalRows(
  reservationId: string | undefined,
  { enabled = true }: UseReservationApprovalRowsOptions = {}
) {
  return useQuery({
    queryKey: ['reservation-approvals', 'rows', reservationId],
    queryFn: async (): Promise<ApprovalRecordLike[]> => {
      if (!reservationId) return [];

      const supabase = (
        await import('@/lib/supabase/client')
      ).createClientSupabaseClient();

      const { data, error } = await (supabase as any)
        .from('resource_approvals')
        .select('approver_user_id, approval_level, status')
        .eq('reservation_id', reservationId);

      if (error) {
        logger.error(
          'resource-management/reservations',
          'Error fetching approval chain for reservation',
          { reservationId, error }
        );
        return [];
      }

      return (data || []) as ApprovalRecordLike[];
    },
    enabled: enabled && !!reservationId,
    staleTime: 15 * 1000,
    retry: 3
  });
}
