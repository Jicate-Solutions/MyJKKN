import { useQuery } from '@tanstack/react-query';
import { SectionService } from '@/lib/services/organization/section-service';
import type { Section } from '@/types/organizations';

export function useSection(id: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['section', id],
    queryFn: () => SectionService.getSection(id!),
    enabled: !!id && enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000 // 10 minutes
  });
}
