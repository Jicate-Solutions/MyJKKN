'use client';

// hooks/learners-council/use-lc-selection.ts
// LC-005: Selection & Elections - React Query Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { LCSelectionService } from '@/lib/services/learners-council/selection-service';
import type {
  LCElection,
  LCNomination,
  LCInterview,
  CreateElectionDto,
  CreateNominationDto
} from '@/types/learners-council';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const lcSelectionKeys = {
  all: ['lc-selection'] as const,
  elections: () => [...lcSelectionKeys.all, 'elections'] as const,
  electionList: (filters: Record<string, string | undefined>) =>
    [...lcSelectionKeys.elections(), filters] as const,
  electionDetail: (id: string) => [...lcSelectionKeys.elections(), 'detail', id] as const,
  nominations: (electionId: string) => [...lcSelectionKeys.all, 'nominations', electionId] as const,
  interviews: (nominationId: string) => [...lcSelectionKeys.all, 'interviews', nominationId] as const,
  results: (electionId: string) => [...lcSelectionKeys.all, 'results', electionId] as const,
  progression: (userId: string) => [...lcSelectionKeys.all, 'progression', userId] as const,
  eligibleNominees: (electionId: string) => [...lcSelectionKeys.all, 'eligible-nominees', electionId] as const,
};

// ============================================================================
// ELECTION HOOKS
// ============================================================================

/**
 * Hook to fetch elections with optional filters
 */
export function useElections(filters: {
  status?: string;
  type?: string;
  term_id?: string;
} = {}) {
  return useQuery({
    queryKey: lcSelectionKeys.electionList(filters),
    queryFn: () => LCSelectionService.getElections(filters),
    staleTime: 2 * 60 * 1000 // 2 minutes
  });
}

/**
 * Hook to fetch a single election with full details
 */
export function useElectionDetail(id: string) {
  return useQuery({
    queryKey: lcSelectionKeys.electionDetail(id),
    queryFn: () => LCSelectionService.getElectionById(id),
    enabled: !!id,
    staleTime: 1 * 60 * 1000 // 1 minute
  });
}

/**
 * Hook to create an election
 */
export function useCreateElection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateElectionDto; userId: string }) =>
      LCSelectionService.createElection(data, userId),
    onSuccess: () => {
      toast.success('Election created successfully');
      queryClient.invalidateQueries({ queryKey: lcSelectionKeys.elections() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create election');
    }
  });
}

/**
 * Hook to update election status
 */
export function useUpdateElectionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      LCSelectionService.updateElectionStatus(id, status),
    onSuccess: (data) => {
      toast.success(`Election status updated to ${data.status}`);
      queryClient.invalidateQueries({ queryKey: lcSelectionKeys.elections() });
      queryClient.invalidateQueries({ queryKey: lcSelectionKeys.electionDetail(data.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update election status');
    }
  });
}

// ============================================================================
// NOMINATION HOOKS
// ============================================================================

/**
 * Hook to fetch nominations for an election
 */
export function useNominations(electionId: string) {
  return useQuery({
    queryKey: lcSelectionKeys.nominations(electionId),
    queryFn: () => LCSelectionService.getNominations(electionId),
    enabled: !!electionId,
    staleTime: 1 * 60 * 1000
  });
}

/**
 * Hook to submit a self-nomination
 */
export function useSubmitNomination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ data, userId }: { data: CreateNominationDto; userId: string }) =>
      LCSelectionService.submitNomination(data, userId),
    onSuccess: (nomination) => {
      toast.success('Nomination submitted successfully');
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.nominations(nomination.election_id)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit nomination');
    }
  });
}

/**
 * Hook to review a nomination
 */
export function useReviewNomination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      reviewerId,
      notes
    }: {
      id: string;
      status: string;
      reviewerId: string;
      electionId: string;
      notes?: string;
    }) => LCSelectionService.reviewNomination(id, status, reviewerId, notes),
    onSuccess: (_, variables) => {
      toast.success('Nomination reviewed');
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.nominations(variables.electionId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to review nomination');
    }
  });
}

// ============================================================================
// INTERVIEW HOOKS
// ============================================================================

/**
 * Hook to fetch interviews for a nomination
 */
export function useInterviews(nominationId: string) {
  return useQuery({
    queryKey: lcSelectionKeys.interviews(nominationId),
    queryFn: () => LCSelectionService.getInterviews(nominationId),
    enabled: !!nominationId
  });
}

/**
 * Hook to schedule an interview
 */
export function useScheduleInterview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      nomination_id: string;
      interviewer_id: string;
      scheduled_at: string;
      max_score: number;
    }) => LCSelectionService.scheduleInterview(data),
    onSuccess: (interview) => {
      toast.success('Interview scheduled');
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.interviews(interview.nomination_id)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to schedule interview');
    }
  });
}

/**
 * Hook to submit interview score
 */
export function useSubmitInterviewScore() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      interviewId,
      score,
      criteriaScores,
      notes,
      recommendation,
      nominationId
    }: {
      interviewId: string;
      score: number;
      criteriaScores: { criterion: string; score: number; max: number; notes: string }[];
      notes: string;
      recommendation: string;
      nominationId: string;
    }) =>
      LCSelectionService.submitInterviewScore(interviewId, score, criteriaScores, notes, recommendation),
    onSuccess: (_, variables) => {
      toast.success('Interview score submitted');
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.interviews(variables.nominationId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit interview score');
    }
  });
}

// ============================================================================
// VOTING HOOKS
// ============================================================================

/**
 * Hook to cast a vote
 */
export function useCastVote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      electionId,
      nominationId,
      positionId,
      voterId
    }: {
      electionId: string;
      nominationId: string;
      positionId: string;
      voterId: string;
    }) => LCSelectionService.castVote(electionId, nominationId, positionId, voterId),
    onSuccess: (_, variables) => {
      toast.success('Vote cast successfully');
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.results(variables.electionId)
      });
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.electionDetail(variables.electionId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cast vote');
    }
  });
}

/**
 * Hook to fetch election results
 */
export function useElectionResults(electionId: string) {
  return useQuery({
    queryKey: lcSelectionKeys.results(electionId),
    queryFn: () => LCSelectionService.getElectionResults(electionId),
    enabled: !!electionId,
    staleTime: 30 * 1000 // 30 seconds for live results
  });
}

// ============================================================================
// NOMINATION ACTION HOOKS
// ============================================================================

/**
 * Hook to withdraw a nomination
 */
export function useWithdrawNomination() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      nominationId,
      reason,
      electionId,
    }: {
      nominationId: string;
      reason: string;
      electionId: string;
    }) => LCSelectionService.withdrawNomination(nominationId, reason),
    onSuccess: (_, variables) => {
      toast.success('Nomination withdrawn');
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.nominations(variables.electionId)
      });
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.elections()
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to withdraw nomination');
    }
  });
}

// ============================================================================
// INTERVIEW ACTION HOOKS
// ============================================================================

/**
 * Hook to cancel an interview
 */
export function useCancelInterview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      interviewId,
      reason,
      nominationId,
    }: {
      interviewId: string;
      reason: string;
      nominationId: string;
    }) => LCSelectionService.cancelInterview(interviewId, reason),
    onSuccess: (_, variables) => {
      toast.success('Interview cancelled');
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.interviews(variables.nominationId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel interview');
    }
  });
}

/**
 * Hook to reschedule an interview
 */
export function useRescheduleInterview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      interviewId,
      newDate,
      newTime,
      nominationId,
    }: {
      interviewId: string;
      newDate: string;
      newTime: string;
      nominationId: string;
    }) => LCSelectionService.rescheduleInterview(interviewId, newDate, newTime),
    onSuccess: (_, variables) => {
      toast.success('Interview rescheduled');
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.interviews(variables.nominationId)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reschedule interview');
    }
  });
}

// ============================================================================
// PROGRESSION & ELIGIBILITY HOOKS
// ============================================================================

/**
 * Hook to fetch progression history for a user (YUVA -> LC trail)
 */
export function useProgressionHistory(userId: string) {
  return useQuery({
    queryKey: lcSelectionKeys.progression(userId),
    queryFn: () => LCSelectionService.getProgressionHistory(userId),
    enabled: !!userId,
    staleTime: 5 * 60 * 1000
  });
}

/**
 * Hook to fetch eligible nominees for an election
 */
export function useEligibleNominees(electionId: string) {
  return useQuery({
    queryKey: lcSelectionKeys.eligibleNominees(electionId),
    queryFn: () => LCSelectionService.getEligibleNominees(electionId),
    enabled: !!electionId,
    staleTime: 2 * 60 * 1000
  });
}

/**
 * Hook to declare election results
 */
export function useDeclareResults() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (electionId: string) => LCSelectionService.declareResults(electionId),
    onSuccess: (result) => {
      toast.success(`Results declared! ${result.winners.length} winner(s) selected.`);
      queryClient.invalidateQueries({ queryKey: lcSelectionKeys.elections() });
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.electionDetail(result.election.id)
      });
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.results(result.election.id)
      });
      queryClient.invalidateQueries({
        queryKey: lcSelectionKeys.nominations(result.election.id)
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to declare results');
    }
  });
}
