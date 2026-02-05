'use client';

/**
 * Solutions Hub - Client Portal Hooks
 * Purpose: React Query hooks for client portal (client-facing)
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
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
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
      const supabase = createClient();
      const { data, error } = await (supabase as any)
        .from('sh_clients')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Failed to fetch client profile: ${error.message}`);
      }

      return data as ClientPortalProfile;
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
    queryFn: async (): Promise<ClientDashboardStats> => {
      const supabase = createClient();

      // Get solutions for this client
      const { data: solutions, error: solutionsError } = await (supabase as any)
        .from('sh_solutions')
        .select('id, status')
        .eq('client_id', clientId);

      if (solutionsError) throw new Error(`Failed to fetch solutions: ${solutionsError.message}`);

      const solutionsList = solutions || [];
      const solutionIds = solutionsList.map((s: Solution) => s.id);

      // Calculate solution stats
      const totalSolutions = solutionsList.length;
      const activeSolutions = solutionsList.filter((s: Solution) => s.status === 'active').length;
      const completedSolutions = solutionsList.filter((s: Solution) => s.status === 'completed').length;

      // Get deliverables pending review
      let pendingDeliverables = 0;
      if (solutionIds.length > 0) {
        const { data: orders } = await (supabase as any)
          .from('sh_content_orders')
          .select('id')
          .in('solution_id', solutionIds);

        if (orders && orders.length > 0) {
          const orderIds = orders.map((o: ContentOrder) => o.id);
          const { count } = await (supabase as any)
            .from('sh_content_deliverables')
            .select('id', { count: 'exact', head: true })
            .in('order_id', orderIds)
            .eq('status', 'review');
          pendingDeliverables = count || 0;
        }
      }

      // Get payment stats
      let totalPaid = 0;
      let totalOutstanding = 0;
      let pendingPayments = 0;

      if (solutionIds.length > 0) {
        const { data: payments } = await (supabase as any)
          .from('sh_payments')
          .select('amount, status')
          .in('solution_id', solutionIds);

        (payments || []).forEach((p: Payment) => {
          if (p.status === 'completed') {
            totalPaid += p.amount;
          } else if (['pending', 'processing'].includes(p.status)) {
            totalOutstanding += p.amount;
            pendingPayments++;
          }
        });
      }

      return {
        totalSolutions,
        activeSolutions,
        completedSolutions,
        pendingDeliverables,
        totalPaid,
        totalOutstanding,
        pendingPayments,
      };
    },
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
    queryFn: async (): Promise<Solution[]> => {
      const supabase = createClient();
      const { data, error } = await (supabase as any)
        .from('sh_solutions')
        .select('id, title, solution_code, solution_type, status, problem_statement, description, started_date, target_completion, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch solutions: ${error.message}`);
      return (data || []) as Solution[];
    },
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
      const supabase = createClient();

      // Fetch solution
      const { data: solution, error: solutionError } = await (supabase as any)
        .from('sh_solutions')
        .select('*')
        .eq('id', solutionId)
        .eq('client_id', clientId)
        .single();

      if (solutionError) {
        if (solutionError.code === 'PGRST116') return null;
        throw new Error(`Failed to fetch solution: ${solutionError.message}`);
      }

      const result: ClientSolutionWithDetails = solution;

      // Fetch type-specific data
      if (solution.solution_type === 'software') {
        const { data: phases } = await (supabase as any)
          .from('sh_software_phases')
          .select('id, phase_number, title, description, status, production_url')
          .eq('solution_id', solutionId)
          .order('phase_number');
        result.phases = phases || [];
      } else if (solution.solution_type === 'training') {
        const { data: program } = await (supabase as any)
          .from('sh_training_programs')
          .select('id, program_type, track')
          .eq('solution_id', solutionId)
          .single();

        if (program) {
          // Fetch sessions to calculate counts
          const { data: sessions } = await (supabase as any)
            .from('sh_training_sessions')
            .select('id, status')
            .eq('program_id', program.id);

          const sessionsList = sessions || [];
          const completedSessions = sessionsList.filter((s: TrainingSession) => s.status === 'completed').length;

          result.training_program = {
            ...program,
            total_sessions: sessionsList.length,
            completed_sessions: completedSessions,
            sessions: sessionsList,
          };
        }
      } else if (solution.solution_type === 'content') {
        const { data: orders } = await (supabase as any)
          .from('sh_content_orders')
          .select(`
            id, order_type, quantity, division, due_date,
            deliverables:sh_content_deliverables(id, title, status)
          `)
          .eq('solution_id', solutionId);
        result.content_orders = orders || [];
      }

      // Fetch payments
      const { data: payments } = await (supabase as any)
        .from('sh_payments')
        .select('id, amount, payment_type, status, due_date, received_date, invoice_url')
        .eq('solution_id', solutionId)
        .order('created_at', { ascending: false });
      result.payments = payments || [];

      return result;
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
    queryFn: async (): Promise<ClientDeliverableWithOrder[]> => {
      const supabase = createClient();

      // Get solutions for this client
      const { data: solutions } = await (supabase as any)
        .from('sh_solutions')
        .select('id, title')
        .eq('client_id', clientId);

      if (!solutions || solutions.length === 0) return [];

      const solutionIds = solutions.map((s: Solution) => s.id);
      const solutionMap = new Map(solutions.map((s: Solution) => [s.id, s]));

      // Get content orders for these solutions
      const { data: orders } = await (supabase as any)
        .from('sh_content_orders')
        .select('id, solution_id')
        .in('solution_id', solutionIds);

      if (!orders || orders.length === 0) return [];

      type OrderRecord = { id: string; solution_id: string };
      const orderIds = orders.map((o: OrderRecord) => o.id);
      const orderMap = new Map<string, OrderRecord>(orders.map((o: OrderRecord) => [o.id, o]));

      // Build deliverables query
      let query = (supabase as any)
        .from('sh_content_deliverables')
        .select('id, title, status, file_url, notes, revision_count, created_at, order_id')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false });

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: deliverables, error } = await query;

      if (error) throw new Error(`Failed to fetch deliverables: ${error.message}`);

      // Map deliverables with their solution info
      return (deliverables || []).map((d: ContentDeliverable) => {
        const order = orderMap.get(d.order_id);
        const solution = order ? solutionMap.get(order.solution_id) : null;
        return {
          ...d,
          order: order ? {
            ...order,
            solution: solution || undefined,
          } : undefined,
        };
      });
    },
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
    queryFn: async (): Promise<PaymentWithSolution[]> => {
      const supabase = createClient();

      // Get solutions for this client
      const { data: solutions } = await (supabase as any)
        .from('sh_solutions')
        .select('id, title, solution_code')
        .eq('client_id', clientId);

      if (!solutions || solutions.length === 0) return [];

      const solutionIds = solutions.map((s: Solution) => s.id);
      const solutionMap = new Map(solutions.map((s: Solution) => [s.id, s]));

      // Get payments
      const { data: payments, error } = await (supabase as any)
        .from('sh_payments')
        .select('id, amount, payment_type, status, due_date, received_date, invoice_url, created_at, solution_id')
        .in('solution_id', solutionIds)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Failed to fetch payments: ${error.message}`);

      // Map payments with solution info
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (payments || []).map((p: any) => ({
        id: p.id,
        amount: p.amount,
        payment_type: p.payment_type,
        status: p.status,
        due_date: p.due_date,
        received_date: p.received_date,
        invoice_url: p.invoice_url,
        created_at: p.created_at,
        solution: solutionMap.get(p.solution_id),
      })) as PaymentWithSolution[];
    },
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
    queryFn: async () => {
      const supabase = createClient();

      // Get solutions for this client
      const { data: solutions } = await (supabase as any)
        .from('sh_solutions')
        .select('id')
        .eq('client_id', clientId);

      if (!solutions || solutions.length === 0) {
        return { total: 0, pending: 0, paid: 0, overdue: 0 };
      }

      const solutionIds = solutions.map((s: Solution) => s.id);

      // Get payments
      const { data: payments } = await (supabase as any)
        .from('sh_payments')
        .select('amount, status')
        .in('solution_id', solutionIds);

      let total = 0;
      let pending = 0;
      let paid = 0;
      let overdue = 0;

      (payments || []).forEach((p: Payment) => {
        total += p.amount;
        if (p.status === 'completed') {
          paid += p.amount;
        } else if (p.status === 'failed') {
          overdue += p.amount;
        } else {
          pending += p.amount;
        }
      });

      return { total, pending, paid, overdue };
    },
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
      const supabase = createClient();

      const { data, error } = await (supabase as any)
        .from('sh_communications')
        .select('*')
        .eq('client_id', clientId)
        .order('communication_date', { ascending: false });

      if (error) {
        // Table might not exist yet - return empty array
        if (error.code === '42P01') return [];
        throw new Error(`Failed to fetch communications: ${error.message}`);
      }

      return (data || []) as ClientCommunication[];
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
      const supabase = createClient();
      const { error } = await (supabase as any)
        .from('sh_content_deliverables')
        .update({ status: 'approved' })
        .eq('id', deliverableId);

      if (error) throw new Error(`Failed to approve deliverable: ${error.message}`);
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
      const supabase = createClient();

      // First get current revision count
      const { data: current } = await (supabase as any)
        .from('sh_content_deliverables')
        .select('revision_count')
        .eq('id', deliverableId)
        .single();

      const { error } = await (supabase as any)
        .from('sh_content_deliverables')
        .update({
          status: 'revision',
          notes,
          revision_count: (current?.revision_count || 0) + 1,
        })
        .eq('id', deliverableId);

      if (error) throw new Error(`Failed to request revision: ${error.message}`);
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
      const supabase = createClient();

      const { error } = await (supabase as any)
        .from('sh_communications')
        .insert({
          client_id: clientId,
          solution_id: solutionId || null,
          communication_type: 'note',
          source: 'manual',
          direction: 'inbound',
          subject,
          summary: message,
          communication_date: new Date().toISOString(),
        });

      if (error) throw new Error(`Failed to send message: ${error.message}`);
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
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return null;

      const { data, error } = await (supabase as any)
        .from('sh_clients')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw new Error(`Failed to fetch client: ${error.message}`);
      }

      return data as ClientPortalProfile;
    },
    ...QUERY_CONFIG.USER_SESSION_DATA,
  });
}
