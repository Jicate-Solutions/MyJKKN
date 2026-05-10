// hooks/admission/use-source-counselors-with-load.ts

'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CounselorSourceService,
  type CounselorSourceAssignment,
} from '@/lib/services/admission/counselor-source-service';

export function useSourceCounselorsWithLoad(sourceId: string, enabled = true) {
  return useQuery<CounselorSourceAssignment[]>({
    queryKey: ['source-counselors-with-load', sourceId],
    queryFn: () => CounselorSourceService.listForSource(sourceId),
    enabled,
    staleTime: 5_000,
  });
}
