'use client';

import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { AmcContractService } from '@/lib/services/campus-living/amc-contract-service';

export const hostelAmcContractKeys = {
  all: ['hostel-amc-contracts'] as const,
  list: (filters: Record<string, unknown>) =>
    ['hostel-amc-contracts', 'list', filters] as const,
};

/**
 * Lists Hostel Infrastructure AMC contracts (resources with vendor contract
 * details) for the authenticated institution (super admin sees all).
 */
export function useAmcContracts(institutionId: string | undefined) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelAmcContractKeys.list({ institutionId }),
    queryFn: () =>
      AmcContractService.getContracts(
        isSuperAdmin ? undefined : institutionId,
      ),
    enabled: isSuperAdmin || !!institutionId,
  });
}
