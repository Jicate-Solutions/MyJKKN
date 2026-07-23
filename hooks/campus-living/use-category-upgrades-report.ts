'use client';

import { useQuery } from '@tanstack/react-query';
import { CategoryUpgradesReportService } from '@/lib/services/campus-living/category-upgrades-report-service';

const upgradesReportKeys = {
  all: ['campus-living', 'upgrades-report'] as const,
};

export function useCategoryUpgradesReport() {
  return useQuery({
    queryKey: upgradesReportKeys.all,
    queryFn: () => CategoryUpgradesReportService.getUpgrades(),
  });
}
