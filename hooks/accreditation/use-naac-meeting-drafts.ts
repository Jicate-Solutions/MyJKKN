// hooks/accreditation/use-naac-meeting-drafts.ts
// ============================================================================
// React Query hooks for the AI committee assistant (agenda papers, minutes
// prose, proposed sittings). Read-only queries: every WRITE goes through a
// server action that re-runs the deterministic gates and then calls the SECDEF
// RPC with the SESSION client, so auth.uid() is the real convener.
//
// Extends the existing naacMeetingKeys namespace so invalidation stays precise.
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import {
  CommitteeMeetingService,
  type MeetingAiDraft,
  type MeetingSittingProposal,
} from '@/lib/services/accreditation/committee-meeting-service';
import { naacCommitteeKeys } from '@/hooks/accreditation/use-naac-committees';

export const naacMeetingDraftKeys = {
  drafts: [...naacCommitteeKeys.all, 'ai-drafts'] as const,
  draftList: (committeeId: string) =>
    [...naacMeetingDraftKeys.drafts, 'list', committeeId] as const,
  proposals: [...naacCommitteeKeys.all, 'ai-proposals'] as const,
  pendingProposal: (committeeId: string) =>
    [...naacMeetingDraftKeys.proposals, 'pending', committeeId] as const,
};

/** Every AI draft for a committee's meetings (agenda + minutes, all statuses). */
export function useMeetingAiDrafts(committeeId: string | undefined) {
  return useQuery<MeetingAiDraft[]>({
    queryKey: committeeId
      ? naacMeetingDraftKeys.draftList(committeeId)
      : [...naacMeetingDraftKeys.drafts, 'list', 'none'],
    queryFn: () => CommitteeMeetingService.listMeetingDrafts(committeeId!),
    enabled: !!committeeId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** The one sitting proposal still waiting on the convener, if any. */
export function usePendingSittingProposal(committeeId: string | undefined) {
  return useQuery<MeetingSittingProposal | null>({
    queryKey: committeeId
      ? naacMeetingDraftKeys.pendingProposal(committeeId)
      : [...naacMeetingDraftKeys.proposals, 'pending', 'none'],
    queryFn: () => CommitteeMeetingService.pendingProposal(committeeId!),
    enabled: !!committeeId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
