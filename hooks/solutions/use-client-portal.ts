'use client';

/**
 * Solutions Hub - Client Portal Hooks
 * Purpose: React Query hooks for client portal (client-facing)
 * Connected to: /api/solutions/client-portal/* routes
 * Provides hooks for:
 * - Client profile by user ID
 * - Client's solutions
 * - Client's payments/invoices
 * - Client's deliverables
 * - Client's communications
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { solutionsHubKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import { apiClient } from '@/lib/api/client';
import type {
  Client,
  Solution,
  Payment,
  ClientCommunication,
  SolutionPhase,
  ContentDeliverable,
  ContentOrder,
  TrainingProgram,
  TrainingSession,
} from '@/lib/services/solutions/types';

// ============================================
// TYPES
// ============================================

export interface ClientPortalProfile extends Client {
  user_id?: string;
  company_name?: string;
}

export interface ClientDashboardStats {
  totalSolutions: number;
  activeSolutions: number;
  completedSolutions: number;
  pendingDeliverables: number;
  totalPaid: number;
  totalOutstanding: number;
  pendingPayments: number;
}

export interface ClientTrainingProgramWithStats extends TrainingProgram {
  total_sessions?: number;
  completed_sessions?: number;
  sessions?: TrainingSession[];
}

export interface ClientSolutionWithDetails extends Solution {
  phases?: SolutionPhase[];
  payments?: Payment[];
  content_orders?: ContentOrder[];
  training_program?: ClientTrainingProgramWithStats;
}

export interface ClientDeliverableWithOrder extends ContentDeliverable {
  order?: ContentOrder & {
    solution?: Solution;
  };
}

export interface PaymentWithSolution extends Payment {
  solution?: Solution;
  invoice_url?: string;
  received_date?: string;
}

// ============================================
// QUERY KEYS
// ============================================

const clientPortalKeys = {
  all: ['client-portal'] as const,
  profile: (userId: string) => [...clientPortalKeys.all, 'profile', userId] as const,
  dashboard: (clientId: string) => [...clientPortalKeys.all, 'dashboard', clientId] as const,
  solutions: (clientId: string) => [...clientPortalKeys.all, 'solutions', clientId] as const,
  solution: (solutionId: string) => [...clientPortalKeys.all, 'solution', solutionId] as const,
  deliverables: (clientId: string) => [...clientPortalKeys.all, 'deliverables', clientId] as const,
  payments: (clientId: string) => [...clientPortalKeys.all, 'payments', clientId] as const,
  communications: (clientId: string) => [...clientPortalKeys.all, 'communications', clientId] as const,
};

// ============================================
// QUERY HOOKS - PROFILE
// ============================================

/**
 * Get client profile by user ID (for logged-in user)
 */
export function useClientProfile(userId: string) {
  return useQuery({
    queryKey: clientPortalKeys.profile(userId),
    queryFn: async (): Promise<ClientPortalProfile | null> => {
      try {
        return await apiClient.get<ClientPortalProfile>('/api/solutions/client-portal/profile');
      } catch (error: any) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
    enabled: !!userId,
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}

// ============================================
// QUERY HOOKS - DASHBOARD
// ============================================

/**
 * Get dashboard statistics for a client
 */
export function useClientDashboardStats(clientId: string) {
  return useQuery({
    queryKey: clientPortalKeys.dashboard(clientId),
    queryFn: (): Promise<ClientDashboardStats> =>
      apiClient.get<ClientDashboardStats>('/api/solutions/client-portal/dashboard'),
    enabled: !!clientId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// QUERY HOOKS - SOLUTIONS
// ============================================

/**
 * Get all solutions for a client
 */
export function useClientSolutions(clientId: string) {
  return useQuery({
    queryKey: clientPortalKeys.solutions(clientId),
    queryFn: (): Promise<Solution[]> =>
      apiClient.get<Solution[]>('/api/solutions/client-portal/solutions'),
    enabled: !!clientId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get a single solution with full details for client
 */
export function useClientSolution(solutionId: string, clientId: string) {
  return useQuery({
    queryKey: clientPortalKeys.solution(solutionId),
    queryFn: async (): Promise<ClientSolutionWithDetails | null> => {
      try {
        return await apiClient.get<ClientSolutionWithDetails>('/api/solutions/client-portal/solutions', {
          params: { solution_id: solutionId },
        });
      } catch (error: any) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
    enabled: !!solutionId && !!clientId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

// ============================================
// QUERY HOOKS - DELIVERABLES
// ============================================

/**
 * Get all deliverables for a client
 */
export function useClientDeliverables(clientId: string, statusFilter?: string) {
  return useQuery({
    queryKey: [...clientPortalKeys.deliverables(clientId), statusFilter],
    queryFn: (): Promise<ClientDeliverableWithOrder[]> =>
      apiClient.get<ClientDeliverableWithOrder[]>('/api/solutions/client-portal/deliverables', {
        params: statusFilter && statusFilter !== 'all' ? { status: statusFilter } : undefined,
      }),
    enabled: !!clientId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// QUERY HOOKS - PAYMENTS
// ============================================

/**
 * Get all payments for a client
 */
export function useClientPayments(clientId: string) {
  return useQuery({
    queryKey: clientPortalKeys.payments(clientId),
    queryFn: (): Promise<PaymentWithSolution[]> =>
      apiClient.get<PaymentWithSolution[]>('/api/solutions/client-portal/payments'),
    enabled: !!clientId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

/**
 * Get payment summary for a client
 */
export function useClientPaymentSummary(clientId: string) {
  return useQuery({
    queryKey: [...clientPortalKeys.payments(clientId), 'summary'],
    queryFn: () =>
      apiClient.get<{ total: number; pending: number; paid: number; overdue: number }>('/api/solutions/client-portal/payments', {
        params: { view: 'summary' },
      }),
    enabled: !!clientId,
    ...QUERY_CONFIG.DASHBOARD_DATA,
  });
}

// ============================================
// QUERY HOOKS - COMMUNICATIONS
// ============================================

/**
 * Get all communications for a client
 */
export function useClientCommunicationsQuery(clientId: string) {
  return useQuery({
    queryKey: clientPortalKeys.communications(clientId),
    queryFn: async (): Promise<ClientCommunication[]> => {
      try {
        return await apiClient.get<ClientCommunication[]>('/api/solutions/client-portal/communications');
      } catch (error: any) {
        // Table might not exist yet - return empty array
        if (error?.status === 500) return [];
        throw error;
      }
    },
    enabled: !!clientId,
    ...QUERY_CONFIG.DYNAMIC_DATA,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Approve a deliverable
 */
export function useApproveClientDeliverable() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deliverableId: string) => {
      await apiClient.patch('/api/solutions/client-portal/deliverables', {
        deliverable_id: deliverableId,
        action: 'approve',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.all });
    },
  });
}

/**
 * Request revision on a deliverable
 */
export function useRequestClientDeliverableRevision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deliverableId, notes }: { deliverableId: string; notes: string }) => {
      await apiClient.patch('/api/solutions/client-portal/deliverables', {
        deliverable_id: deliverableId,
        action: 'revision',
        notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.all });
    },
  });
}

/**
 * Send a message to JKKN team
 */
export function useSendClientMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      subject,
      message,
      solutionId,
    }: {
      clientId: string;
      subject: string;
      message: string;
      solutionId?: string;
    }) => {
      await apiClient.post('/api/solutions/client-portal/communications', {
        subject,
        message,
        solution_id: solutionId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientPortalKeys.all });
    },
  });
}

// ============================================
// HOOKS FOR AUTH CONTEXT
// ============================================

/**
 * Custom hook to get client info from auth context
 * This hook fetches the client based on the current authenticated user
 */
export function useCurrentClient() {
  return useQuery({
    queryKey: ['current-client'],
    queryFn: async (): Promise<ClientPortalProfile | null> => {
      try {
        return await apiClient.get<ClientPortalProfile>('/api/solutions/client-portal/profile');
      } catch (error: any) {
        if (error?.status === 404) return null;
        throw error;
      }
    },
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}
