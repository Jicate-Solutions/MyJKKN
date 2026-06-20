import { useQuery } from '@tanstack/react-query';
import { useParentSession } from './use-parent-session';
import { ParentAttendanceService } from '@/lib/services/parent/parent-academic-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/** Attendance summary for the active child (changes daily → DYNAMIC). */
export function useParentAttendance() {
  const { activeLearnerId } = useParentSession();
  return useQuery({
    queryKey: ['parent-attendance', activeLearnerId],
    queryFn: () => ParentAttendanceService.getSummary(activeLearnerId!),
    enabled: !!activeLearnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}
