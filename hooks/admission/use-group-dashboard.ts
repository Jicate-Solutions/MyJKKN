'use client';

import { useQuery } from '@tanstack/react-query';
import { GroupDashboardService } from '@/lib/services/admission/group-dashboard-service';

export const groupDashboardKeys = {
  all: ['admission-group-dashboard'] as const,
  overview: () => [...groupDashboardKeys.all, 'overview'] as const,
  duplicates: () => [...groupDashboardKeys.all, 'duplicates'] as const,
};

export function useGroupDashboard() {
  return useQuery({
    queryKey: groupDashboardKeys.overview(),
    queryFn: () => GroupDashboardService.getGroupDashboard(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

export function useCrossCampusDuplicates() {
  return useQuery({
    queryKey: groupDashboardKeys.duplicates(),
    queryFn: () => GroupDashboardService.findCrossCampusDuplicates(),
    staleTime: 10 * 60 * 1000,
  });
}
