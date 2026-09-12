import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  StudentBillService,
  type BillInstalmentState,
} from '@/lib/services/billing/schedule/student-bill-service';

export const billInstalmentKeys = {
  all: ['bill-instalments'] as const,
  forBills: (sortedIds: string[]) =>
    [...billInstalmentKeys.all, sortedIds.join(',')] as const,
};

/**
 * Payment schedules for the bills currently on screen, keyed by bill id.
 *
 * One batched request for the whole table, not one per row — see
 * StudentBillService.getInstalmentsForBills.
 *
 * The key is the SORTED id list: the bills array arrives in whatever order the
 * list query returned, and keying on that order would miss the cache every
 * time the sort changed while the underlying set stayed identical.
 *
 * A bill with no schedule simply has no entry. The service already swallows a
 * read failure into an empty map, so a schedule that cannot be loaded degrades
 * to today's plain rows instead of blanking the table.
 */
export function useBillInstalments(billIds: string[]) {
  const sortedIds = useMemo(() => [...billIds].sort(), [billIds]);

  return useQuery<Map<string, BillInstalmentState[]>>({
    queryKey: billInstalmentKeys.forBills(sortedIds),
    queryFn: () => StudentBillService.getInstalmentsForBills(sortedIds),
    enabled: sortedIds.length > 0,
  });
}

/**
 * Allocation across tranches is derived from the bill's paid position, so a
 * receipt, refund or cancellation changes every schedule on the page without
 * touching billing_bill_instalments itself. Nothing in this app refetches on
 * focus, so whoever refreshes the bills must drop these too or the waterfall
 * shown will describe a payment position that no longer exists.
 */
export function useInvalidateBillInstalments() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: billInstalmentKeys.all });
}
