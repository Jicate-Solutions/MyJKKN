import { useQuery } from '@tanstack/react-query';
import { useParentSession } from './use-parent-session';
import { ParentFeeService } from '@/lib/services/parent/parent-academic-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/** Bills + receipts for the active child (DYNAMIC — balances change on payment). */
export function useParentFees() {
  const { activeLearnerId } = useParentSession();
  return useQuery({
    queryKey: ['parent-fees', activeLearnerId],
    queryFn: () => ParentFeeService.getFees(activeLearnerId!),
    enabled: !!activeLearnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}
