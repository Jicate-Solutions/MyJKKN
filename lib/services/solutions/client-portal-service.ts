// lib/services/solutions/client-portal-service.ts
// Service layer for client portal (client-facing) Supabase queries.
// Extracted from hooks/solutions/use-client-portal.ts to support
// both browser hooks and server-side API routes via BaseService.

import { BaseService } from '../base-service'
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
} from './types'

// ============================================
// TYPES
// ============================================

export interface ClientPortalProfile extends Client {
  user_id?: string
  company_name?: string
}

export interface ClientDashboardStats {
  totalSolutions: number
  activeSolutions: number
  completedSolutions: number
  pendingDeliverables: number
  totalPaid: number
  totalOutstanding: number
  pendingPayments: number
}

export interface ClientTrainingProgramWithStats extends TrainingProgram {
  total_sessions?: number
  completed_sessions?: number
  sessions?: TrainingSession[]
}

export interface ClientSolutionWithDetails extends Solution {
  phases?: SolutionPhase[]
  payments?: Payment[]
  content_orders?: ContentOrder[]
  training_program?: ClientTrainingProgramWithStats
}

export interface ClientDeliverableWithOrder extends ContentDeliverable {
  order?: ContentOrder & {
    solution?: Solution
  }
}

export interface PaymentWithSolution extends Payment {
  solution?: Solution
  invoice_url?: string
  received_date?: string
}

export interface PaymentSummary {
  total: number
  pending: number
  paid: number
  overdue: number
}

export interface SendMessageInput {
  clientId: string
  subject: string
  message: string
  solutionId?: string
}

// ============================================
// SERVICE CLASS
// ============================================

export class ClientPortalService extends BaseService {
  // ------------------------------------------
  // PROFILE
  // ------------------------------------------

  /**
   * Get client profile by user ID (for logged-in user)
   * Returns null if no client record found (PGRST116).
   */
  static async getClientProfile(userId: string): Promise<ClientPortalProfile | null> {
    const { data, error } = await this.supabase
      .from('sh_clients')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(`Failed to fetch client profile: ${error.message}`)
    }

    return data as ClientPortalProfile
  }

  /**
   * Get current client from Supabase auth session.
   * Reads auth.getUser() then looks up the sh_clients row.
   */
  static async getCurrentClient(): Promise<ClientPortalProfile | null> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) return null

    return this.getClientProfile(user.id)
  }

  // ------------------------------------------
  // DASHBOARD STATS
  // ------------------------------------------

  /**
   * Compute dashboard statistics for a client.
   * Aggregates solutions, deliverables-in-review count, and payment totals.
   */
  static async getDashboardStats(clientId: string): Promise<ClientDashboardStats> {
    // 1. Get solutions for this client
    const { data: solutions, error: solutionsError } = await this.supabase
      .from('sh_solutions')
      .select('id, status')
      .eq('client_id', clientId)

    if (solutionsError) throw new Error(`Failed to fetch solutions: ${solutionsError.message}`)

    const solutionsList = (solutions || []) as Array<{ id: string; status: string }>
    const solutionIds = solutionsList.map((s) => s.id)

    const totalSolutions = solutionsList.length
    const activeSolutions = solutionsList.filter((s) => s.status === 'active').length
    const completedSolutions = solutionsList.filter((s) => s.status === 'completed').length

    // 2. Count deliverables pending review
    let pendingDeliverables = 0
    if (solutionIds.length > 0) {
      const { data: orders } = await this.supabase
        .from('sh_content_orders')
        .select('id')
        .in('solution_id', solutionIds)

      if (orders && orders.length > 0) {
        const orderIds = (orders as Array<{ id: string }>).map((o) => o.id)
        const { count } = await this.supabase
          .from('sh_content_deliverables')
          .select('id', { count: 'exact', head: true })
          .in('order_id', orderIds)
          .eq('status', 'review')
        pendingDeliverables = count || 0
      }
    }

    // 3. Payment stats
    let totalPaid = 0
    let totalOutstanding = 0
    let pendingPayments = 0

    if (solutionIds.length > 0) {
      const { data: payments } = await this.supabase
        .from('sh_payments')
        .select('amount, status')
        .in('solution_id', solutionIds)

      ;(payments || []).forEach((p: { amount: number; status: string }) => {
        if (p.status === 'completed') {
          totalPaid += p.amount
        } else if (['pending', 'processing'].includes(p.status)) {
          totalOutstanding += p.amount
          pendingPayments++
        }
      })
    }

    return {
      totalSolutions,
      activeSolutions,
      completedSolutions,
      pendingDeliverables,
      totalPaid,
      totalOutstanding,
      pendingPayments,
    }
  }

  // ------------------------------------------
  // SOLUTIONS
  // ------------------------------------------

  /**
   * Get all solutions for a client (summary list).
   */
  static async getClientSolutions(clientId: string): Promise<Solution[]> {
    const { data, error } = await this.supabase
      .from('sh_solutions')
      .select('id, title, solution_code, solution_type, status, description, start_date, target_date, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (error) throw new Error(`Failed to fetch solutions: ${error.message}`)
    return (data || []) as Solution[]
  }

  /**
   * Get a single solution with full details for the client portal.
   * Fetches type-specific sub-data (phases / training / content orders) and payments.
   */
  static async getClientSolution(
    solutionId: string,
    clientId: string
  ): Promise<ClientSolutionWithDetails | null> {
    // Fetch solution (scoped to client)
    const { data: solution, error: solutionError } = await this.supabase
      .from('sh_solutions')
      .select('*')
      .eq('id', solutionId)
      .eq('client_id', clientId)
      .single()

    if (solutionError) {
      if (solutionError.code === 'PGRST116') return null
      throw new Error(`Failed to fetch solution: ${solutionError.message}`)
    }

    const result: ClientSolutionWithDetails = solution

    // Type-specific data
    if (solution.solution_type === 'software') {
      const { data: phases } = await this.supabase
        .from('sh_software_phases')
        .select('id, phase_number, title, description, status')
        .eq('solution_id', solutionId)
        .order('phase_number')
      result.phases = phases || []
    } else if (solution.solution_type === 'training') {
      const { data: program } = await this.supabase
        .from('sh_training_programs')
        .select('id, program_type, track')
        .eq('solution_id', solutionId)
        .single()

      if (program) {
        const { data: sessions } = await this.supabase
          .from('sh_training_sessions')
          .select('id, status')
          .eq('program_id', program.id)

        const sessionsList = (sessions || []) as Array<{ id: string; status: string }>
        const completedSessions = sessionsList.filter((s) => s.status === 'completed').length

        result.training_program = {
          ...program,
          total_sessions: sessionsList.length,
          completed_sessions: completedSessions,
          sessions: sessionsList as TrainingSession[],
        }
      }
    } else if (solution.solution_type === 'content') {
      const { data: orders } = await this.supabase
        .from('sh_content_orders')
        .select(`
          id, order_type, quantity, division, due_date,
          deliverables:sh_content_deliverables(id, title, status)
        `)
        .eq('solution_id', solutionId)
      result.content_orders = orders || []
    }

    // Payments
    const { data: payments } = await this.supabase
      .from('sh_payments')
      .select('id, amount, payment_type, status, due_date, payment_date, invoice_url')
      .eq('solution_id', solutionId)
      .order('created_at', { ascending: false })
    result.payments = payments || []

    return result
  }

  // ------------------------------------------
  // DELIVERABLES
  // ------------------------------------------

  /**
   * Get all deliverables for a client, optionally filtered by status.
   * Joins through solutions -> content_orders -> deliverables.
   */
  static async getClientDeliverables(
    clientId: string,
    statusFilter?: string
  ): Promise<ClientDeliverableWithOrder[]> {
    // 1. Get solutions
    const { data: solutions } = await this.supabase
      .from('sh_solutions')
      .select('id, title')
      .eq('client_id', clientId)

    if (!solutions || solutions.length === 0) return []

    const solutionIds = (solutions as Array<{ id: string; title: string }>).map((s) => s.id)
    const solutionMap = new Map(
      (solutions as Array<{ id: string; title: string }>).map((s) => [s.id, s])
    )

    // 2. Get content orders
    const { data: orders } = await this.supabase
      .from('sh_content_orders')
      .select('id, solution_id')
      .in('solution_id', solutionIds)

    if (!orders || orders.length === 0) return []

    type OrderRecord = { id: string; solution_id: string }
    const orderIds = (orders as OrderRecord[]).map((o) => o.id)
    const orderMap = new Map<string, OrderRecord>(
      (orders as OrderRecord[]).map((o) => [o.id, o])
    )

    // 3. Get deliverables
    let query = this.supabase
      .from('sh_content_deliverables')
      .select('id, title, status, file_url, notes, revision_count, created_at, order_id')
      .in('order_id', orderIds)
      .order('created_at', { ascending: false })

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data: deliverables, error } = await query

    if (error) throw new Error(`Failed to fetch deliverables: ${error.message}`)

    // 4. Map deliverables with solution info
    return ((deliverables || []) as ContentDeliverable[]).map((d) => {
      const order = orderMap.get(d.order_id)
      const solution = order ? solutionMap.get(order.solution_id) : null
      return {
        ...d,
        order: order
          ? {
              ...order,
              solution: solution || undefined,
            }
          : undefined,
      } as ClientDeliverableWithOrder
    })
  }

  /**
   * Approve a deliverable (client action).
   */
  static async approveDeliverable(deliverableId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sh_content_deliverables')
      .update({ status: 'approved' })
      .eq('id', deliverableId)

    if (error) throw new Error(`Failed to approve deliverable: ${error.message}`)
  }

  /**
   * Request a revision on a deliverable (client action).
   * Increments revision_count and sets status to 'revision'.
   */
  static async requestDeliverableRevision(
    deliverableId: string,
    notes: string
  ): Promise<void> {
    // Get current revision count
    const { data: current } = await this.supabase
      .from('sh_content_deliverables')
      .select('revision_count')
      .eq('id', deliverableId)
      .single()

    const { error } = await this.supabase
      .from('sh_content_deliverables')
      .update({
        status: 'revision',
        notes,
        revision_count: (current?.revision_count || 0) + 1,
      })
      .eq('id', deliverableId)

    if (error) throw new Error(`Failed to request revision: ${error.message}`)
  }

  // ------------------------------------------
  // PAYMENTS
  // ------------------------------------------

  /**
   * Get all payments for a client with solution info joined in.
   */
  static async getClientPayments(clientId: string): Promise<PaymentWithSolution[]> {
    // 1. Get solutions
    const { data: solutions } = await this.supabase
      .from('sh_solutions')
      .select('id, title, solution_code')
      .eq('client_id', clientId)

    if (!solutions || solutions.length === 0) return []

    const solutionIds = (solutions as Array<{ id: string }>).map((s) => s.id)
    const solutionMap = new Map(
      (solutions as Array<{ id: string; title: string; solution_code: string }>).map((s) => [s.id, s])
    )

    // 2. Get payments
    const { data: payments, error } = await this.supabase
      .from('sh_payments')
      .select('id, amount, payment_type, status, due_date, payment_date, invoice_url, created_at, solution_id')
      .in('solution_id', solutionIds)
      .order('created_at', { ascending: false })

    if (error) throw new Error(`Failed to fetch payments: ${error.message}`)

    // 3. Map payments with solution info
    return ((payments || []) as Array<Record<string, unknown>>).map((p) => ({
      id: p.id,
      amount: p.amount,
      payment_type: p.payment_type,
      status: p.status,
      due_date: p.due_date,
      received_date: p.payment_date,
      invoice_url: p.invoice_url,
      created_at: p.created_at,
      solution: solutionMap.get(p.solution_id as string),
    })) as PaymentWithSolution[]
  }

  /**
   * Get payment summary totals for a client.
   */
  static async getPaymentSummary(clientId: string): Promise<PaymentSummary> {
    // Get solutions
    const { data: solutions } = await this.supabase
      .from('sh_solutions')
      .select('id')
      .eq('client_id', clientId)

    if (!solutions || solutions.length === 0) {
      return { total: 0, pending: 0, paid: 0, overdue: 0 }
    }

    const solutionIds = (solutions as Array<{ id: string }>).map((s) => s.id)

    // Get payments
    const { data: payments } = await this.supabase
      .from('sh_payments')
      .select('amount, status')
      .in('solution_id', solutionIds)

    let total = 0
    let pending = 0
    let paid = 0
    let overdue = 0

    ;(payments || []).forEach((p: { amount: number; status: string }) => {
      total += p.amount
      if (p.status === 'completed') {
        paid += p.amount
      } else if (p.status === 'failed') {
        overdue += p.amount
      } else {
        pending += p.amount
      }
    })

    return { total, pending, paid, overdue }
  }

  // ------------------------------------------
  // COMMUNICATIONS
  // ------------------------------------------

  /**
   * Get all communications for a client, newest first.
   */
  static async getClientCommunications(clientId: string): Promise<ClientCommunication[]> {
    const { data, error } = await this.supabase
      .from('sh_communications')
      .select('*')
      .eq('client_id', clientId)
      .order('communication_date', { ascending: false })

    if (error) {
      // Table might not exist yet — return empty array
      if (error.code === '42P01') return []
      throw new Error(`Failed to fetch communications: ${error.message}`)
    }

    return (data || []) as ClientCommunication[]
  }

  /**
   * Send a message from the client to the JKKN team.
   * Inserts an inbound communication record.
   */
  static async sendMessage(input: SendMessageInput): Promise<void> {
    const { error } = await this.supabase
      .from('sh_communications')
      .insert({
        client_id: input.clientId,
        solution_id: input.solutionId || null,
        communication_type: 'other',
        source: 'manual',
        direction: 'inbound',
        subject: input.subject,
        summary: input.message,
        communication_date: new Date().toISOString(),
      })

    if (error) throw new Error(`Failed to send message: ${error.message}`)
  }
}

// Export singleton instance methods for convenience
export const clientPortalService = {
  getClientProfile: ClientPortalService.getClientProfile.bind(ClientPortalService),
  getCurrentClient: ClientPortalService.getCurrentClient.bind(ClientPortalService),
  getDashboardStats: ClientPortalService.getDashboardStats.bind(ClientPortalService),
  getClientSolutions: ClientPortalService.getClientSolutions.bind(ClientPortalService),
  getClientSolution: ClientPortalService.getClientSolution.bind(ClientPortalService),
  getClientDeliverables: ClientPortalService.getClientDeliverables.bind(ClientPortalService),
  approveDeliverable: ClientPortalService.approveDeliverable.bind(ClientPortalService),
  requestDeliverableRevision: ClientPortalService.requestDeliverableRevision.bind(ClientPortalService),
  getClientPayments: ClientPortalService.getClientPayments.bind(ClientPortalService),
  getPaymentSummary: ClientPortalService.getPaymentSummary.bind(ClientPortalService),
  getClientCommunications: ClientPortalService.getClientCommunications.bind(ClientPortalService),
  sendMessage: ClientPortalService.sendMessage.bind(ClientPortalService),
}
