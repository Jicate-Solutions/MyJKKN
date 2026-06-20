/**
 * Parent Portal — React Query hooks for A3–A5 features. All child-scoped queries
 * include activeLearnerId in the key (cross-child cache safety). Parent-scoped
 * lists (concerns, notifications, pickup members) key off the parent.
 */
import { useQuery } from '@tanstack/react-query';
import { useParentSession } from './use-parent-session';
import { ParentFeatures } from '@/lib/services/parent/parent-features-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

function useChild() {
  const { activeLearnerId, parent } = useParentSession();
  return { learnerId: activeLearnerId, parentId: parent?.parentAccountId };
}

export function useParentHomework() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-homework', learnerId],
    queryFn: () => ParentFeatures.homeworkList(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useParentHomeworkDetail(id: string) {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-homework', learnerId, id],
    queryFn: () => ParentFeatures.homework(id, learnerId!),
    enabled: !!learnerId && !!id,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useParentAchievements() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-achievements', learnerId],
    queryFn: () => ParentFeatures.achievements(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useParentPolls() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-polls', learnerId],
    queryFn: () => ParentFeatures.polls(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useParentConcerns() {
  const { parentId } = useChild();
  return useQuery({
    queryKey: ['parent-concerns', parentId],
    queryFn: () => ParentFeatures.concerns(),
    enabled: !!parentId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useParentConcern(id: string) {
  const { parentId } = useChild();
  return useQuery({
    queryKey: ['parent-concern', parentId, id],
    queryFn: () => ParentFeatures.concern(id),
    enabled: !!parentId && !!id,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useParentEvents() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-events', learnerId],
    queryFn: () => ParentFeatures.events(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useParentSpotlight() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-spotlight', learnerId],
    queryFn: () => ParentFeatures.spotlight(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useParentWellness() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-wellness', learnerId],
    queryFn: () => ParentFeatures.wellness(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useParentNotifications() {
  const { parentId } = useChild();
  return useQuery({
    queryKey: ['parent-notifications', parentId],
    queryFn: () => ParentFeatures.notifications(),
    enabled: !!parentId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useParentBus() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-bus', learnerId],
    queryFn: () => ParentFeatures.bus(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}

export function useParentGatePasses() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-gatepass', learnerId],
    queryFn: () => ParentFeatures.gatePasses(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useParentLeaves() {
  const { learnerId } = useChild();
  return useQuery({
    queryKey: ['parent-leaves', learnerId],
    queryFn: () => ParentFeatures.leaves(learnerId!),
    enabled: !!learnerId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

export function useParentPickupMembers() {
  const { parentId } = useChild();
  return useQuery({
    queryKey: ['parent-pickup', parentId],
    queryFn: () => ParentFeatures.pickupMembers(),
    enabled: !!parentId,
    ...QUERY_CONFIG.STABLE_DATA,
  });
}
