import { useQuery } from '@tanstack/react-query';
import { SemesterService } from '@/lib/services/organization/semester-service';

export function useSemesters(filters?: { institution_id?: string; program_id?: string }) {
  return useQuery({
    queryKey: ['semesters', filters],
    queryFn: async () => {
      const result = await SemesterService.getSemesters({
        institution_id: filters?.institution_id,
        program_id: filters?.program_id,
        limit: 1000, // Get all for dropdown
      });

      return {
        data: result.data || [],
        total: result.metadata?.total || 0,
      };
    },
  });
}
