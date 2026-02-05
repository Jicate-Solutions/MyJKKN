// lib/services/solutions/payments-service.ts
// CRUD operations for sh_payments, sh_revenue_split_models, sh_earnings_ledger

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  Payment,
  PaymentStatus,
  PaymentType,
  RevenueSplitModel,
  EarningsLedger,
  RecipientType,
  SolutionType,
  CohortTrack,
  CreatePaymentInput,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export interface PaymentWithDetails extends Payment {
  phase?: {
    id: string;
    title: string;
    solution?: {
      id: string;
      title: string;
      solution_code: string;
      client?: {
        id: string;
        name: string;
      };
    };
  };
  program?: {
    id: string;
    solution?: {
      id: string;
      title: string;
      solution_code: string;
      client?: {
        id: string;
        name: string;
      };
    };
  };
  order?: {
    id: string;
    solution?: {
      id: string;
      title: string;
      solution_code: string;
      client?: {
        id: string;
        name: string;
      };
    };
  };
  earnings?: EarningsLedger[];
}

export interface PaymentFilters extends PaginationParams {
  status?: PaymentStatus;
  payment_type?: PaymentType;
  phase_id?: string;
  program_id?: string;
  order_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface UpdatePaymentInput {
  amount?: number;
  payment_type?: PaymentType;
  payment_method?: string;
  reference_number?: string;
  due_date?: string;
  paid_at?: string;
  status?: PaymentStatus;
  notes?: string;
}

export interface MonthlyBatchSummary {
  month: string;
  year: number;
  total_payments: number;
  total_amount: number;
  pending_count: number;
  received_count: number;
  overdue_count: number;
  payments: PaymentWithDetails[];
}

// Revenue split types
export type SplitType = 'software' | 'training_track_a' | 'training_track_b' | 'content';

export interface CalculatedSplit {
  recipientType: string;
  recipientName: string;
  percentage: number;
  amount: number;
  departmentId?: string;
  recipientId?: string;
}

export interface RevenueSplitResult {
  splits: CalculatedSplit[];
  totalAmount: number;
  hodDiscountApplied: number;
  referralBonusApplied: number;
}

// ============================================
// CONSTANTS
// ============================================

export const REVENUE_SPLIT_CONFIGS = {
  software: {
    jicate: 40,
    department: 40,
    institution: 20,
  },
  training_track_a: {
    cohort: 60,
    council: 20,
    infrastructure: 20,
  },
  training_track_b: {
    cohort: 30,
    department: 20,
    jicate: 30,
    institution: 20,
  },
  content: {
    learners: 60,
    council: 20,
    infrastructure: 20,
  },
} as const;

export const RECIPIENT_NAMES: Record<string, string> = {
  jicate: 'JICATE',
  department: 'Department',
  institution: 'Institution',
  cohort: 'Cohort Members',
  council: 'Council',
  infrastructure: 'Infrastructure',
  learners: 'Production Learners',
};

// ============================================
// SERVICE CLASS
// ============================================

export class PaymentsService extends BaseService {
  // ============================================
  // PAYMENT OPERATIONS
  // ============================================

  /**
   * Get all payments with optional filters
   */
  static async getPayments(
    filters?: PaymentFilters
  ): Promise<BaseListResponse<PaymentWithDetails>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_payments')
      .select(
        `
        *,
        phase:sh_solution_phases(
          id,
          title,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        program:sh_training_programs(
          id,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        order:sh_content_orders(
          id,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        earnings:sh_earnings_ledger(*)
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.payment_type) {
      query = query.eq('payment_type', filters.payment_type);
    }

    if (filters?.phase_id) {
      query = query.eq('phase_id', filters.phase_id);
    }

    if (filters?.program_id) {
      query = query.eq('program_id', filters.program_id);
    }

    if (filters?.order_id) {
      query = query.eq('order_id', filters.order_id);
    }

    if (filters?.from_date) {
      query = query.gte('created_at', filters.from_date);
    }

    if (filters?.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    // Apply pagination
    const start = (page - 1) * limit;
    const end = start + limit - 1;
    query = query.range(start, end);

    const { data, count, error } = await query;

    if (error) throw new Error(`Failed to fetch payments: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as PaymentWithDetails[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get payments for a specific solution (via phase, program, or order)
   */
  static async getPaymentsBySolution(solutionId: string): Promise<PaymentWithDetails[]> {
    // Get all phases, programs, and orders for this solution
    const [phasesResult, programsResult, ordersResult] = await Promise.all([
      (this.supabase as any).from('sh_solution_phases').select('id').eq('solution_id', solutionId),
      (this.supabase as any).from('sh_training_programs').select('id').eq('solution_id', solutionId),
      (this.supabase as any).from('sh_content_orders').select('id').eq('solution_id', solutionId),
    ]);

    const phaseIds = (phasesResult.data || []).map((p: { id: string }) => p.id);
    const programIds = (programsResult.data || []).map((p: { id: string }) => p.id);
    const orderIds = (ordersResult.data || []).map((o: { id: string }) => o.id);

    if (phaseIds.length === 0 && programIds.length === 0 && orderIds.length === 0) {
      return [];
    }

    let query = (this.supabase as any).from('sh_payments')
      .select(
        `
        *,
        phase:sh_solution_phases(
          id,
          title,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        program:sh_training_programs(
          id,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        order:sh_content_orders(
          id,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        earnings:sh_earnings_ledger(*)
      `
      )
      .order('created_at', { ascending: false });

    // Build OR conditions
    const orConditions: string[] = [];
    if (phaseIds.length > 0) {
      orConditions.push(`phase_id.in.(${phaseIds.join(',')})`);
    }
    if (programIds.length > 0) {
      orConditions.push(`program_id.in.(${programIds.join(',')})`);
    }
    if (orderIds.length > 0) {
      orConditions.push(`order_id.in.(${orderIds.join(',')})`);
    }

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','));
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch payments by solution: ${error.message}`);

    return (data || []) as PaymentWithDetails[];
  }

  /**
   * Get a single payment by ID
   */
  static async getPaymentById(id: string): Promise<PaymentWithDetails | null> {
    const { data, error } = await (this.supabase as any).from('sh_payments')
      .select(
        `
        *,
        phase:sh_solution_phases(
          id,
          title,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        program:sh_training_programs(
          id,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        order:sh_content_orders(
          id,
          solution:sh_solutions(
            id,
            title,
            solution_code,
            client:sh_clients(id, name)
          )
        ),
        earnings:sh_earnings_ledger(*)
      `
      )
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to fetch payment: ${error.message}`);
    }

    return data as PaymentWithDetails;
  }

  /**
   * Create a new payment
   */
  static async createPayment(input: CreatePaymentInput): Promise<Payment> {
    // Determine split model based on payment source
    let splitModelId: string | null = null;
    let splitType: SplitType | null = null;

    if (input.phase_id) {
      splitType = 'software';
    } else if (input.program_id) {
      // Get track to determine split type
      const { data: program } = await (this.supabase as any).from('sh_training_programs')
        .select('track')
        .eq('id', input.program_id)
        .single();

      splitType = program?.track === 'track_a' ? 'training_track_a' : 'training_track_b';
    } else if (input.order_id) {
      splitType = 'content';
    }

    // Get split model ID
    if (splitType) {
      const { data: model } = await (this.supabase as any).from('sh_revenue_split_models')
        .select('id')
        .eq('solution_type', splitType)
        .single();
      splitModelId = model?.id || null;
    }

    const { data, error } = await (this.supabase as any).from('sh_payments')
      .insert({
        phase_id: input.phase_id,
        program_id: input.program_id,
        order_id: input.order_id,
        amount: input.amount,
        payment_type: input.payment_type,
        payment_method: input.payment_method,
        reference_number: input.reference_number,
        due_date: input.due_date,
        paid_at: input.paid_at,
        status: input.status || 'pending',
        split_model_id: splitModelId,
        split_calculated: false,
        recorded_by: input.recorded_by,
        notes: input.notes,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create payment: ${error.message}`);

    // Auto-calculate splits if payment is completed
    if (input.status === 'completed') {
      await this.calculateAndDistributeSplits(data.id);
    }

    return data as Payment;
  }

  /**
   * Update a payment
   */
  static async updatePayment(id: string, input: UpdatePaymentInput): Promise<Payment> {
    // Get current payment status
    const { data: currentPayment } = await (this.supabase as any).from('sh_payments')
      .select('status, split_calculated')
      .eq('id', id)
      .single();

    const { data, error } = await (this.supabase as any).from('sh_payments')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update payment: ${error.message}`);

    // Auto-calculate splits when status changes to 'completed'
    if (
      input.status === 'completed' &&
      currentPayment?.status !== 'completed' &&
      !currentPayment?.split_calculated
    ) {
      await this.calculateAndDistributeSplits(id);
    }

    return data as Payment;
  }

  /**
   * Delete a payment
   */
  static async deletePayment(id: string): Promise<void> {
    // First delete associated earnings
    await (this.supabase as any).from('sh_earnings_ledger').delete().eq('payment_id', id);

    const { error } = await (this.supabase as any).from('sh_payments').delete().eq('id', id);

    if (error) throw new Error(`Failed to delete payment: ${error.message}`);
  }

  /**
   * Get monthly batch summary
   */
  static async getMonthlyBatch(month: number, year: number): Promise<MonthlyBatchSummary> {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const result = await this.getPayments({ from_date: startDate, to_date: endDate });

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    return {
      month: monthNames[month - 1],
      year,
      total_payments: result.data.length,
      total_amount: result.data.reduce((sum, p) => sum + Number(p.amount), 0),
      pending_count: result.data.filter((p) => p.status === 'pending').length,
      received_count: result.data.filter((p) => p.status === 'completed').length,
      overdue_count: result.data.filter((p) => p.status === 'failed').length,
      payments: result.data,
    };
  }

  /**
   * Get payment statistics
   */
  static async getPaymentStats(): Promise<{
    total_received: number;
    total_pending: number;
    this_month_received: number;
    this_month_pending: number;
    by_status: Record<PaymentStatus, number>;
  }> {
    const { data, error } = await (this.supabase as any).from('sh_payments').select('amount, status, created_at');

    if (error) throw new Error(`Failed to fetch payment stats: ${error.message}`);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = {
      total_received: 0,
      total_pending: 0,
      this_month_received: 0,
      this_month_pending: 0,
      by_status: {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        refunded: 0,
      } as Record<PaymentStatus, number>,
    };

    for (const payment of data || []) {
      const amount = Number(payment.amount);
      const createdAt = new Date(payment.created_at);
      const isThisMonth = createdAt >= thisMonthStart;

      stats.by_status[payment.status as PaymentStatus] += amount;

      if (payment.status === 'completed') {
        stats.total_received += amount;
        if (isThisMonth) stats.this_month_received += amount;
      } else if (payment.status === 'pending' || payment.status === 'processing') {
        stats.total_pending += amount;
        if (isThisMonth) stats.this_month_pending += amount;
      }
    }

    return stats;
  }

  /**
   * Flag payment for MD review
   */
  static async flagPayment(id: string, reason: string): Promise<Payment> {
    const { data: payment } = await (this.supabase as any).from('sh_payments')
      .select('notes')
      .eq('id', id)
      .single();

    const { data, error } = await (this.supabase as any).from('sh_payments')
      .update({
        notes: `${payment?.notes || ''}\n[FLAGGED] ${reason}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to flag payment: ${error.message}`);
    return data as Payment;
  }

  // ============================================
  // REVENUE SPLIT OPERATIONS
  // ============================================

  /**
   * Get split type from solution type and track
   */
  static getSplitType(solutionType: SolutionType, track?: CohortTrack | null): SplitType {
    if (solutionType === 'software') return 'software';
    if (solutionType === 'content') return 'content';
    if (solutionType === 'training') {
      return track === 'track_a' ? 'training_track_a' : 'training_track_b';
    }
    return 'software';
  }

  /**
   * Calculate revenue splits (without saving)
   */
  static calculateRevenueSplits(
    amount: number,
    splitType: SplitType,
    options?: {
      hodDiscount?: number;
      isFirstPhase?: boolean;
      hasReferral?: boolean;
    }
  ): RevenueSplitResult {
    const config = REVENUE_SPLIT_CONFIGS[splitType];
    const splits: CalculatedSplit[] = [];
    let hodDiscountApplied = 0;
    let referralBonusApplied = 0;

    for (const [key, percentage] of Object.entries(config)) {
      let adjustedPercentage = percentage;
      let adjustedAmount = (amount * percentage) / 100;

      // Apply HOD discount (only from department share for software)
      if (
        key === 'department' &&
        options?.hodDiscount &&
        options.hodDiscount > 0 &&
        options.hodDiscount <= 10
      ) {
        hodDiscountApplied = (amount * options.hodDiscount) / 100;
        adjustedAmount -= hodDiscountApplied;
        adjustedPercentage = percentage - options.hodDiscount;
      }

      // Apply referral bonus (10% from department share on first phase)
      if (
        key === 'department' &&
        options?.isFirstPhase &&
        options?.hasReferral &&
        splitType === 'software'
      ) {
        referralBonusApplied = (amount * 10) / 100;
        adjustedAmount -= referralBonusApplied;
        adjustedPercentage -= 10;
      }

      splits.push({
        recipientType: key,
        recipientName: RECIPIENT_NAMES[key] || key,
        percentage: adjustedPercentage,
        amount: adjustedAmount,
      });
    }

    // Add referral bonus as separate entry
    if (referralBonusApplied > 0) {
      splits.push({
        recipientType: 'referral_bonus',
        recipientName: 'Referral Bonus',
        percentage: 10,
        amount: referralBonusApplied,
      });
    }

    return {
      splits,
      totalAmount: amount,
      hodDiscountApplied,
      referralBonusApplied,
    };
  }

  /**
   * Calculate and distribute splits for a payment
   */
  static async calculateAndDistributeSplits(
    paymentId: string
  ): Promise<{ success: boolean; splits: CalculatedSplit[]; error?: string }> {
    // Get payment details
    const payment = await this.getPaymentById(paymentId);
    if (!payment) {
      return { success: false, splits: [], error: 'Payment not found' };
    }

    if (payment.split_calculated) {
      return { success: false, splits: [], error: 'Splits already calculated' };
    }

    if (payment.status !== 'completed') {
      return { success: false, splits: [], error: 'Payment must be completed' };
    }

    // Determine split type
    let splitType: SplitType = 'software';
    let departmentId: string | undefined;
    const hodDiscount = 0;

    if (payment.phase) {
      splitType = 'software';
      // Note: phaseData and solutionData can be used to get department_id and hod_discount from solution
      // const phaseData = Array.isArray(payment.phase) ? payment.phase[0] : payment.phase;
      // const solutionData = Array.isArray(phaseData?.solution) ? phaseData.solution[0] : phaseData?.solution;
    } else if (payment.program) {
      // Note: programData can be used to determine track_a or track_b
      // const programData = Array.isArray(payment.program) ? payment.program[0] : payment.program;
      splitType = 'training_track_b';
    } else if (payment.order) {
      splitType = 'content';
    }

    // Calculate splits
    const result = this.calculateRevenueSplits(Number(payment.amount), splitType, {
      hodDiscount,
    });

    // Insert earnings entries
    const earningsEntries = result.splits.map((split) => ({
      payment_id: paymentId,
      recipient_type: split.recipientType as RecipientType,
      recipient_name: split.recipientName,
      amount: split.amount,
      percentage: split.percentage,
      status: 'calculated' as const,
      department_id: departmentId,
    }));

    const { error: insertError } = await (this.supabase as any).from('sh_earnings_ledger')
      .insert(earningsEntries);

    if (insertError) {
      return { success: false, splits: [], error: `Failed to insert earnings: ${insertError.message}` };
    }

    // Mark payment as split_calculated
    await (this.supabase as any).from('sh_payments')
      .update({ split_calculated: true })
      .eq('id', paymentId);

    return { success: true, splits: result.splits };
  }

  /**
   * Get all revenue split models
   */
  static async getAllSplitModels(): Promise<RevenueSplitModel[]> {
    const { data, error } = await (this.supabase as any).from('sh_revenue_split_models')
      .select('*')
      .order('solution_type');

    if (error) throw new Error(`Failed to fetch split models: ${error.message}`);
    return data as RevenueSplitModel[];
  }

  /**
   * Update a revenue split model
   */
  static async updateSplitModel(
    id: string,
    splitConfig: Record<string, number>
  ): Promise<RevenueSplitModel> {
    // Validate total is 100%
    const total = Object.values(splitConfig).reduce((sum, val) => sum + val, 0);
    if (total !== 100) {
      throw new Error('Revenue split percentages must total 100%');
    }

    const { data, error } = await (this.supabase as any).from('sh_revenue_split_models')
      .update({ split_config: splitConfig })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update split model: ${error.message}`);
    return data as RevenueSplitModel;
  }

  /**
   * Process all unprocessed completed payments
   */
  static async processAllPendingSplits(): Promise<{
    processed: number;
    failed: number;
    errors: string[];
  }> {
    const { data: payments, error } = await (this.supabase as any).from('sh_payments')
      .select('id')
      .eq('status', 'completed')
      .eq('split_calculated', false);

    if (error) {
      return { processed: 0, failed: 0, errors: [error.message] };
    }

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const payment of payments || []) {
      const result = await this.calculateAndDistributeSplits(payment.id);
      if (result.success) {
        processed++;
      } else {
        failed++;
        errors.push(`Payment ${payment.id}: ${result.error}`);
      }
    }

    return { processed, failed, errors };
  }
}

// Export singleton instance methods
export const paymentsService = {
  getPayments: PaymentsService.getPayments.bind(PaymentsService),
  getPaymentById: PaymentsService.getPaymentById.bind(PaymentsService),
  getPaymentsBySolution: PaymentsService.getPaymentsBySolution.bind(PaymentsService),
  createPayment: PaymentsService.createPayment.bind(PaymentsService),
  updatePayment: PaymentsService.updatePayment.bind(PaymentsService),
  deletePayment: PaymentsService.deletePayment.bind(PaymentsService),
  getMonthlyBatch: PaymentsService.getMonthlyBatch.bind(PaymentsService),
  getPaymentStats: PaymentsService.getPaymentStats.bind(PaymentsService),
  flagPayment: PaymentsService.flagPayment.bind(PaymentsService),
  getSplitType: PaymentsService.getSplitType.bind(PaymentsService),
  calculateRevenueSplits: PaymentsService.calculateRevenueSplits.bind(PaymentsService),
  calculateAndDistributeSplits: PaymentsService.calculateAndDistributeSplits.bind(PaymentsService),
  getAllSplitModels: PaymentsService.getAllSplitModels.bind(PaymentsService),
  updateSplitModel: PaymentsService.updateSplitModel.bind(PaymentsService),
  processAllPendingSplits: PaymentsService.processAllPendingSplits.bind(PaymentsService),
  REVENUE_SPLIT_CONFIGS,
  RECIPIENT_NAMES,
};
