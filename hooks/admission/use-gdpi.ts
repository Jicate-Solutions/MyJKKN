// hooks/admission/use-gdpi.ts
// React Query hooks for GD-PI (Group Discussion & Personal Interview) module

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  GDPIService,
  type GDPIStats,
  type CreateSessionInput,
  type UpdateSessionInput,
  type ScoreInput,
  type GDPISessionFilters,
  type GDPIRecommendation,
  type GDPICandidateStatus,
  type GDPIEvaluatorRole,
} from '@/lib/services/admission/gdpi-service';

// Query keys
export const gdpiKeys = {
  all: ['admission-gdpi'] as const,
  sessions: () => [...gdpiKeys.all, 'sessions'] as const,
  sessionList: (institutionId: string, filters?: GDPISessionFilters) =>
    [...gdpiKeys.sessions(), institutionId, filters] as const,
  session: (sessionId: string) =>
    [...gdpiKeys.all, 'session', sessionId] as const,
  sessionResults: (sessionId: string) =>
    [...gdpiKeys.all, 'results', sessionId] as const,
  stats: (institutionId: string) =>
    [...gdpiKeys.all, 'stats', institutionId] as const,
  leadSearch: (institutionId: string, sessionId: string, search: string) =>
    [...gdpiKeys.all, 'lead-search', institutionId, sessionId, search] as const,
  evaluatorSearch: (institutionId: string, search: string) =>
    [...gdpiKeys.all, 'evaluator-search', institutionId, search] as const,
};

/**
 * List GD-PI sessions for an institution
 */
export function useGDPISessions(
  institutionId?: string,
  filters?: GDPISessionFilters
) {
  const query = useQuery({
    queryKey: gdpiKeys.sessionList(institutionId || '', filters),
    queryFn: () => GDPIService.getSessions(institutionId!, filters),
    enabled: !!institutionId,
  });

  return {
    sessions: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get a single session with full details
 */
export function useGDPISession(sessionId?: string) {
  const query = useQuery({
    queryKey: gdpiKeys.session(sessionId || ''),
    queryFn: () => GDPIService.getSession(sessionId!),
    enabled: !!sessionId,
  });

  return {
    session: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get session results with aggregated data
 */
export function useGDPISessionResults(sessionId?: string) {
  const query = useQuery({
    queryKey: gdpiKeys.sessionResults(sessionId || ''),
    queryFn: () => GDPIService.getSessionResults(sessionId!),
    enabled: !!sessionId,
  });

  return {
    results: query.data || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Get GD-PI stats for an institution
 */
export function useGDPIStats(institutionId?: string) {
  const query = useQuery({
    queryKey: gdpiKeys.stats(institutionId || ''),
    queryFn: () => GDPIService.getStats(institutionId!),
    enabled: !!institutionId,
  });

  return {
    stats: query.data || {
      totalSessions: 0,
      completedSessions: 0,
      totalCandidates: 0,
      evaluatedCandidates: 0,
      avgScore: 0,
      acceptRate: 0,
      gdSessions: 0,
      piSessions: 0,
    } as GDPIStats,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/**
 * Search leads to add as candidates
 */
export function useGDPILeadSearch(
  institutionId?: string,
  sessionId?: string,
  searchTerm?: string
) {
  const query = useQuery({
    queryKey: gdpiKeys.leadSearch(
      institutionId || '',
      sessionId || '',
      searchTerm || ''
    ),
    queryFn: () =>
      GDPIService.searchLeadsForSession(
        institutionId!,
        sessionId!,
        searchTerm || ''
      ),
    enabled: !!institutionId && !!sessionId && (searchTerm?.length ?? 0) >= 1,
  });

  return {
    leads: query.data || [],
    isLoading: query.isLoading,
  };
}

/**
 * Search profiles to add as evaluators
 */
export function useGDPIEvaluatorSearch(
  institutionId?: string,
  searchTerm?: string
) {
  const query = useQuery({
    queryKey: gdpiKeys.evaluatorSearch(institutionId || '', searchTerm || ''),
    queryFn: () =>
      GDPIService.searchEvaluators(institutionId!, searchTerm || ''),
    enabled: !!institutionId && (searchTerm?.length ?? 0) >= 1,
  });

  return {
    evaluators: query.data || [],
    isLoading: query.isLoading,
  };
}

/**
 * All GD-PI mutations (create, update, delete, score, recommend)
 */
export function useGDPIMutations() {
  const queryClient = useQueryClient();

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: gdpiKeys.all });
  };

  const createSession = useMutation({
    mutationFn: (input: CreateSessionInput) => GDPIService.createSession(input),
    onSuccess: () => {
      invalidateAll();
      toast.success('Session scheduled successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create session: ${error.message}`);
    },
  });

  const updateSession = useMutation({
    mutationFn: ({
      sessionId,
      updates,
    }: {
      sessionId: string;
      updates: UpdateSessionInput;
    }) => GDPIService.updateSession(sessionId, updates),
    onSuccess: () => {
      invalidateAll();
      toast.success('Session updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update session: ${error.message}`);
    },
  });

  const deleteSession = useMutation({
    mutationFn: (sessionId: string) => GDPIService.deleteSession(sessionId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Session deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete session: ${error.message}`);
    },
  });

  const addCandidates = useMutation({
    mutationFn: ({
      sessionId,
      leadIds,
    }: {
      sessionId: string;
      leadIds: string[];
    }) => GDPIService.addCandidates(sessionId, leadIds),
    onSuccess: (data) => {
      invalidateAll();
      toast.success(`${data.length} learner(s) added to session`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to add learners: ${error.message}`);
    },
  });

  const removeCandidate = useMutation({
    mutationFn: (candidateId: string) =>
      GDPIService.removeCandidate(candidateId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Learner removed from session');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove learner: ${error.message}`);
    },
  });

  const addEvaluator = useMutation({
    mutationFn: ({
      sessionId,
      evaluatorId,
      role,
    }: {
      sessionId: string;
      evaluatorId: string;
      role?: GDPIEvaluatorRole;
    }) => GDPIService.addEvaluator(sessionId, evaluatorId, role),
    onSuccess: () => {
      invalidateAll();
      toast.success('Evaluator assigned');
    },
    onError: (error: Error) => {
      toast.error(`Failed to assign evaluator: ${error.message}`);
    },
  });

  const removeEvaluator = useMutation({
    mutationFn: (evaluatorRecordId: string) =>
      GDPIService.removeEvaluator(evaluatorRecordId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Evaluator removed');
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove evaluator: ${error.message}`);
    },
  });

  const scoreCandidate = useMutation({
    mutationFn: ({
      candidateId,
      evaluatorId,
      scores,
    }: {
      candidateId: string;
      evaluatorId: string;
      scores: ScoreInput[];
    }) => GDPIService.scoreCandidate(candidateId, evaluatorId, scores),
    onSuccess: () => {
      invalidateAll();
      toast.success('Scores submitted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit scores: ${error.message}`);
    },
  });

  const updateRecommendation = useMutation({
    mutationFn: ({
      candidateId,
      recommendation,
      notes,
    }: {
      candidateId: string;
      recommendation: GDPIRecommendation;
      notes?: string;
    }) => GDPIService.updateRecommendation(candidateId, recommendation, notes),
    onSuccess: () => {
      invalidateAll();
      toast.success('Recommendation updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update recommendation: ${error.message}`);
    },
  });

  const updateCandidateStatus = useMutation({
    mutationFn: ({
      candidateId,
      status,
    }: {
      candidateId: string;
      status: GDPICandidateStatus;
    }) => GDPIService.updateCandidateStatus(candidateId, status),
    onSuccess: () => {
      invalidateAll();
      toast.success('Attendance updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update attendance: ${error.message}`);
    },
  });

  return {
    createSession,
    updateSession,
    deleteSession,
    addCandidates,
    removeCandidate,
    addEvaluator,
    removeEvaluator,
    scoreCandidate,
    updateRecommendation,
    updateCandidateStatus,
  };
}
