import { useQuery } from '@tanstack/react-query';
import { scfQueryKeys } from '@/hooks/use-session-feedback';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';

/** Per-person, per-course summary for leadership (one row per course taught).
 *  Keyed under scfQueryKeys.all so the page's Refresh invalidates it too. */
export function useAdminCourseBreakdown(from: string, to: string) {
  return useQuery({
    queryKey: [...scfQueryKeys.all, 'admin-course-breakdown', from, to] as const,
    queryFn: () => SessionFeedbackService.getAdminCourseBreakdown(from, to),
    enabled: !!from && !!to,
    staleTime: 60 * 1000,
  });
}
