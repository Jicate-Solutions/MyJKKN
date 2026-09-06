import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { BillCancellationService } from '@/lib/services/billing/schedule/bill-cancellation-service';
import { studentBillKeys } from './use-student-bills';
import { studentSearchKeys } from './use-student-search';
import type {
  BillCancellation,
  CancelBillInput,
} from '@/types/billing-bill-cancellation';

export const billCancellationKeys = {
  all: ['bill-cancellations'] as const,
  byBill: (billId: string) => [...billCancellationKeys.all, 'bill', billId] as const,
  byStudent: (studentId: string) =>
    [...billCancellationKeys.all, 'student', studentId] as const,
};

/** Every cancellation for one learner, keyed by bill_id for O(1) row lookup. */
export function useStudentBillCancellations(studentId?: string) {
  return useQuery({
    queryKey: billCancellationKeys.byStudent(studentId ?? ''),
    queryFn: () => BillCancellationService.getByStudent(studentId!),
    enabled: !!studentId,
  });
}

export function useBillCancellation(billId?: string) {
  return useQuery<BillCancellation | null>({
    queryKey: billCancellationKeys.byBill(billId ?? ''),
    queryFn: () => BillCancellationService.getByBill(billId!),
    enabled: !!billId,
  });
}

/**
 * Cancel a bill.
 *
 * Nothing in this app self-refreshes — staleTime is 5 minutes with no refetch
 * on window focus — so every cache that shows a bill amount has to be
 * invalidated here by hand. A missed key is a stale total the operator has no
 * way to tell apart from a wrong one, which is why this list mirrors the
 * (already exhaustive) list in useCancelStudentBill rather than trimming it.
 */
export function useCancelBill(studentId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CancelBillInput) => BillCancellationService.cancelBill(input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: studentBillKeys.lists() });
      queryClient.invalidateQueries({ queryKey: studentBillKeys.detail(result.billId) });
      queryClient.invalidateQueries({ queryKey: billCancellationKeys.byBill(result.billId) });

      if (studentId) {
        queryClient.invalidateQueries({ queryKey: studentBillKeys.byStudent(studentId) });
        queryClient.invalidateQueries({ queryKey: studentBillKeys.unpaidByStudent(studentId) });
        queryClient.invalidateQueries({ queryKey: studentBillKeys.outstanding(studentId) });
        queryClient.invalidateQueries({ queryKey: studentSearchKeys.summary(studentId) });
        queryClient.invalidateQueries({ queryKey: studentSearchKeys.detail(studentId) });
        queryClient.invalidateQueries({ queryKey: billCancellationKeys.byStudent(studentId) });
      } else {
        // Called from the schedule list, where the learner is per-row rather
        // than per-page: widen to every by-student cache instead of guessing.
        queryClient.invalidateQueries({ queryKey: [...studentBillKeys.all, 'by-student'] });
        queryClient.invalidateQueries({ queryKey: [...studentBillKeys.all, 'unpaid'] });
        queryClient.invalidateQueries({ queryKey: [...studentBillKeys.all, 'outstanding'] });
        queryClient.invalidateQueries({ queryKey: studentSearchKeys.summaries() });
        queryClient.invalidateQueries({ queryKey: studentSearchKeys.details() });
        queryClient.invalidateQueries({ queryKey: billCancellationKeys.all });
      }

      toast.success('Bill cancelled');
    },
    onError: (error: any) => {
      // The RPC's guard messages name the receipt to cancel first or the status
      // that blocked it — surface them verbatim rather than a generic string.
      toast.error(error?.message || 'Failed to cancel bill');
    },
  });
}
