import { useQuery } from '@tanstack/react-query';
import { HostelFeeResolutionService } from '@/lib/services/campus-living/hostel-fee-resolution-service';
import { queryKeys } from '@/lib/query/query-keys';

export function useHostelFeeResolution(learnerId?: string, hostelYearId?: string) {
  return useQuery({
    queryKey: queryKeys.campusLiving.hostelFeeResolution(learnerId ?? '', hostelYearId ?? ''),
    queryFn: () => HostelFeeResolutionService.resolve(learnerId!, hostelYearId!),
    enabled: !!learnerId && !!hostelYearId,
  });
}
