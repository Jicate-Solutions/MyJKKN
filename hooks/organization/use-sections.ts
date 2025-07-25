import { useQuery } from '@tanstack/react-query';
import { Section, SectionFilters } from '@/types/organizations';
import { SectionService } from '@/lib/services/organization/section-service';

export function useSections(filters: SectionFilters) {
  const query = useQuery({
    queryKey: ['sections', filters],
    queryFn: async () => {
      const { data, metadata } = await SectionService.getSections(filters);
      return { data, metadata };
    },
    placeholderData: (previousData) => previousData,
    retry: false
  });

  return {
    ...query,
    isLoading: query.isLoading && query.isFetching
  };
}
