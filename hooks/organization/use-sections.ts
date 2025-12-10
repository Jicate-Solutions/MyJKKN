import { useQuery } from '@tanstack/react-query';
import { Section, SectionFilters } from '@/types/organizations';
import { SectionService } from '@/lib/services/organization/section-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export function useSections(filters: SectionFilters) {
  const query = useQuery({
    queryKey: ['sections', filters],
    queryFn: async () => {
      const { data, metadata } = await SectionService.getSections(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.STABLE_DATA // Sections rarely change - use stable caching
  });

  return {
    ...query,
    isLoading: query.isLoading && query.isFetching
  };
}
