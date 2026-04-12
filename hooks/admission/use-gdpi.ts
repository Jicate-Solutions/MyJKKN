// hooks/admission/use-gdpi.ts
// React Query hooks for GD-PI (Group Discussion & Personal Interview) management

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type PaginatedApiResponse, type ApiResponse } from '@/lib/api/client';
import toast from 'react-hot-toast';
import type {
  GDPISession,
  GDPISessionDetail,
  GDPICandidate,
  GDPIEvaluator,
  GDPIScore,
  GDPISessionStatus,
  GDPISessionType,
  CreateGDPISessionInput,
  SubmitGDPIScoreInput,
} from '@/types/admission';

// ============================================================================
// QUERY KEYS
// ============================================================================

export const gdpiKeys = {
  all: ['gdpi'] as const,
  sessions: () => [...gdpiKeys.all, 'sessions'] as const,
  sessionList: (filters: GDPISessionListFilters) => [...gdpiKeys.sessions(), filters] as const,
  sessionDetail: (id: string) => [...gdpiKeys.all, 'session', id] as const,
};

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface GDPISessionListFilters {
  institution_id?: string;
  status?: GDPISessionStatus;
  session_type?: GDPISessionType;
  from_date?: string;
  to_date?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================================================
// SESSION LIST HOOK
// ============================================================================

export function useGDPISessions(filters: GDPISessionListFilters) {
  const query = useQuery({
    queryKey: gdpiKeys.sessionList(filters),
    queryFn: async () => {
      const res = await apiClient.get<PaginatedApiResponse<GDPISession>>(
        '/api/admission/gd-pi',
        {
          institution_id: filters.institution_id,
          status: filters.status,
          session_type: filters.session_type,
          from_date: filters.from_date,
          to_date: filters.to_date,
          search: filters.search,
          page: filters.page || 1,
          limit: filters.limit || 20,
        }
      );
      return res;
    },
  });

  return {
    sessions: query.data?.data || [],
    total: query.data?.metadata?.total || 0,
    page: query.data?.metadata?.page || 1,
    limit: query.data?.metadata?.limit || 20,
    totalPages: query.data?.metadata?.totalPages || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ============================================================================
// SESSION DETAIL HOOK
// ============================================================================

export function useGDPISessionDetail(sessionId: string) {
  const query = useQuery({
    queryKey: gdpiKeys.sessionDetail(sessionId),
    queryFn: async () => {
      // apiClient auto-unwraps { success, data } → returns GDPISessionDetail directly
      return apiClient.get<GDPISessionDetail>(
        `/api/admission/gd-pi/${sessionId}`
      );
    },
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

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useGDPIMutations() {
  const queryClient = useQueryClient();

  const invalidateSessions = () => {
    queryClient.invalidateQueries({ queryKey: gdpiKeys.sessions() });
  };

  const invalidateDetail = (sessionId: string) => {
    queryClient.invalidateQueries({ queryKey: gdpiKeys.sessionDetail(sessionId) });
  };

  // Create session
  const createSession = useMutation({
    mutationFn: async (input: CreateGDPISessionInput & { institution_id?: string }) => {
      const res = await apiClient.post<ApiResponse<GDPISession>>('/api/admission/gd-pi', input);
      return res.data;
    },
    onSuccess: () => {
      toast.success('GD-PI session created');
      invalidateSessions();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create session');
    },
  });

  // Update session
  const updateSession = useMutation({
    mutationFn: async ({ id, ...data }: Partial<CreateGDPISessionInput> & { id: string; status?: GDPISessionStatus }) => {
      const res = await apiClient.put<ApiResponse<GDPISession>>(`/api/admission/gd-pi/${id}`, data);
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success('Session updated');
      invalidateSessions();
      invalidateDetail(variables.id);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update session');
    },
  });

  // Delete session
  const deleteSession = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/api/admission/gd-pi/${id}`);
    },
    onSuccess: () => {
      toast.success('Session deleted');
      invalidateSessions();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete session');
    },
  });

  // Add candidates
  const addCandidates = useMutation({
    mutationFn: async ({ sessionId, leadIds, institutionId }: {
      sessionId: string;
      leadIds: string[];
      institutionId?: string;
    }) => {
      const res = await apiClient.post<ApiResponse<GDPICandidate[]>>(
        `/api/admission/gd-pi/${sessionId}/candidates`,
        { lead_ids: leadIds, institution_id: institutionId }
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success('Candidates added');
      invalidateDetail(variables.sessionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add candidates');
    },
  });

  // Remove candidate
  const removeCandidate = useMutation({
    mutationFn: async ({ sessionId, candidateId }: { sessionId: string; candidateId: string }) => {
      await apiClient.delete(`/api/admission/gd-pi/${sessionId}/candidates?candidate_id=${candidateId}`);
    },
    onSuccess: (_, variables) => {
      toast.success('Candidate removed');
      invalidateDetail(variables.sessionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove candidate');
    },
  });

  // Mark attendance
  const markAttendance = useMutation({
    mutationFn: async ({ sessionId, candidateId, status }: {
      sessionId: string;
      candidateId: string;
      status: 'present' | 'absent';
    }) => {
      const res = await apiClient.patch<ApiResponse<GDPICandidate>>(
        `/api/admission/gd-pi/${sessionId}/attendance`,
        { candidate_id: candidateId, status }
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      invalidateDetail(variables.sessionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to mark attendance');
    },
  });

  // Assign evaluators
  const assignEvaluators = useMutation({
    mutationFn: async ({ sessionId, evaluatorIds, institutionId }: {
      sessionId: string;
      evaluatorIds: string[];
      institutionId?: string;
    }) => {
      const res = await apiClient.post<ApiResponse<GDPIEvaluator[]>>(
        `/api/admission/gd-pi/${sessionId}/evaluators`,
        { evaluator_ids: evaluatorIds, institution_id: institutionId }
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success('Evaluators assigned');
      invalidateDetail(variables.sessionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign evaluators');
    },
  });

  // Remove evaluator
  const removeEvaluator = useMutation({
    mutationFn: async ({ sessionId, evaluatorRecordId }: { sessionId: string; evaluatorRecordId: string }) => {
      await apiClient.delete(`/api/admission/gd-pi/${sessionId}/evaluators?evaluator_record_id=${evaluatorRecordId}`);
    },
    onSuccess: (_, variables) => {
      toast.success('Evaluator removed');
      invalidateDetail(variables.sessionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove evaluator');
    },
  });

  // Submit score
  const submitScore = useMutation({
    mutationFn: async ({ sessionId, ...input }: SubmitGDPIScoreInput & { sessionId: string }) => {
      const res = await apiClient.post<ApiResponse<GDPIScore>>(
        `/api/admission/gd-pi/${sessionId}/scores`,
        input
      );
      return res.data;
    },
    onSuccess: (_, variables) => {
      toast.success('Score submitted');
      invalidateDetail(variables.sessionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit score');
    },
  });

  // Publish results
  const publishResults = useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await apiClient.post<ApiResponse<{ ranked: number; session_status: string }>>(
        `/api/admission/gd-pi/${sessionId}/publish`
      );
      return res.data;
    },
    onSuccess: (data, sessionId) => {
      toast.success(`Results published! ${data.ranked} candidates ranked.`);
      invalidateSessions();
      invalidateDetail(sessionId);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to publish results');
    },
  });

  return {
    createSession,
    updateSession,
    deleteSession,
    addCandidates,
    removeCandidate,
    markAttendance,
    assignEvaluators,
    removeEvaluator,
    submitScore,
    publishResults,
  };
}
