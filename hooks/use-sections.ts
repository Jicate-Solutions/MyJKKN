import { useQuery } from '@tanstack/react-query';
import { SectionService } from '@/lib/services/organization/section-service';

export function useSections(filters?: { institution_id?: string; semester_id?: string }) {
  return useQuery({
    queryKey: ['sections', filters],
    queryFn: async () => {
      const result = await SectionService.getSections({
        institution_id: filters?.institution_id,
        semester_id: filters?.semester_id,
        limit: 1000, // Get all for dropdown
      });

      return {
        data: result.data || [],
        total: result.metadata?.total || 0,
      };
    },
  });
}
