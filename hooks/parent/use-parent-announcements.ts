import { useQuery } from '@tanstack/react-query';
import { useParentSession } from './use-parent-session';
import { ParentAnnouncementService } from '@/lib/services/parent/parent-academic-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/** Announcements for the active child's institution (SEMI_STABLE). */
export function useParentAnnouncements() {
  const { activeLearnerId } = useParentSession();
  return useQuery({
    queryKey: ['parent-announcements', activeLearnerId],
    queryFn: () => ParentAnnouncementService.list(activeLearnerId!),
    enabled: !!activeLearnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}
