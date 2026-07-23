import { useQuery } from '@tanstack/react-query';
import { useParentSession } from './use-parent-session';
import { ParentProfileService } from '@/lib/services/parent/parent-children-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/** Learner + parent detail tabs for the active child. */
export function useParentProfile() {
  const { activeLearnerId } = useParentSession();
  return useQuery({
    queryKey: ['parent-profile', activeLearnerId],
    queryFn: () => ParentProfileService.getProfile(activeLearnerId!),
    enabled: !!activeLearnerId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}
