'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { MyHostelService } from '@/lib/services/campus-living/my-hostel-service';
import { queryKeys } from '@/lib/query/query-keys';

export function useMyHostelSummary() {
  const { profile } = useAuth();
  const learnerId = profile?.learner_id ?? '';
  return useQuery({
    queryKey: queryKeys.campusLiving.myHostel.summary(learnerId),
    queryFn: () => MyHostelService.getMySummary(learnerId),
    enabled: !!learnerId,
  });
}

export function useMyRoommates(enabled = true) {
  const { profile } = useAuth();
  const learnerId = profile?.learner_id ?? '';
  return useQuery({
    queryKey: ['campus-living', 'my-roommates', learnerId],
    queryFn: () => MyHostelService.getMyRoommates(),
    enabled: enabled && !!learnerId,
  });
}

/** Bed count + fee band of the resident's own room (own-allocation RLS). */
export function useMyRoomDetails(roomId?: string | null) {
  return useQuery({
    queryKey: ['campus-living', 'my-room-details', roomId ?? ''],
    queryFn: () => MyHostelService.getMyRoomDetails(roomId!),
    enabled: !!roomId,
  });
}

export function useMyCategoryFees(categoryId?: string | null) {
  return useQuery({
    queryKey: queryKeys.campusLiving.myHostel.fees(categoryId ?? ''),
    queryFn: () => MyHostelService.getMyCategoryFees(categoryId!),
    enabled: !!categoryId,
  });
}
