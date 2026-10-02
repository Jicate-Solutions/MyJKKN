import { useQuery } from '@tanstack/react-query';
import { BillCancellationService } from '@/lib/services/billing/schedule/bill-cancellation-service';
import type { BillCancellation } from '@/types/billing-bill-cancellation';

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
