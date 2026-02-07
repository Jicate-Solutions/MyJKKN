// lib/services/solutions/earnings-service.ts
// CRUD operations for sh_earnings_ledger

import { BaseService, type BaseListResponse } from '../base-service';
import type { EarningsLedger, EarningsStatus, RecipientType, PaginationParams } from './types';

// ============================================
// CONSTANTS
// ============================================

/** Map recipient_type to human-readable name (DB has no recipient_name column) */
const RECIPIENT_TYPE_NAMES: Record<string, string> = {
  builder: 'Builder',
  cohort_member: 'Cohort Member',
  production_learner: 'Production Learner',
  department: 'Department',
  jicate: 'JICATE',
  institution: 'Institution',
  council: 'Council',
  infrastructure: 'Infrastructure',
  referral_bonus: 'Referral Bonus',
};

/** Derive a display name from recipient_type */
export function getRecipientDisplayName(recipientType: string): string {
  return RECIPIENT_TYPE_NAMES[recipientType] || recipientType;
}

// ============================================
// TYPES
// ============================================

export interface EarningsWithPayment extends EarningsLedger {
  payment?: {
    id: string;
    amount: number;
    payment_type: string;
    status: string;
    phase?: { solution?: { title: string; solution_code: string } };
    program?: { solution?: { title: string; solution_code: string } };
    order?: { solution?: { title: string; solution_code: string } };
  };
}

export interface EarningsFilters extends PaginationParams {
  recipient_type?: RecipientType;
  recipient_id?: string;
  department_id?: string;
  status?: EarningsStatus;
  from_date?: string;
  to_date?: string;
}

export interface EarningsSummary {
  recipient_type: RecipientType;
  recipient_name: string;
  total_calculated: number;
  total_approved: number;
  total_paid: number;
  entry_count: number;
}

export interface RecipientTotalEarnings {
  calculated: number;
  approved: number;
  paid: number;
  total: number;
}

// ============================================
// SERVICE CLASS
// ============================================

export class EarningsService extends BaseService {
  /**
   * Get all earnings with optional filters
   */
  static async getEarnings(
    filters?: EarningsFilters
  ): Promise<BaseListResponse<EarningsWithPayment>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = (this.supabase as any).from('sh_earnings_ledger')
      .select(
        `
        *,
        payment:sh_payments(
          id,
          amount,
          payment_type,
          status,
          phase:sh_solution_phases(
            solution:sh_solutions(title, solution_code)
          ),
          program:sh_training_programs(
            solution:sh_solutions(title, solution_code)
          ),
          order:sh_content_orders(
            solution:sh_solutions(title, solution_code)
          )
        )
      `,
        { count: 'exact' }
      )
      .order('created_at', { ascending: false });

    // Apply filters
    if (filters?.recipient_type) {
      query = query.eq('recipient_type', filters.recipient_type);
    }

    if (filters?.recipient_id) {
      query = query.eq('recipient_id', filters.recipient_id);
    }

    if (filters?.department_id) {
      query = query.eq('department_id', filters.department_id);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
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

    if (error) throw new Error(`Failed to fetch earnings: ${error.message}`);

    const total = count || 0;
    return {
      data: (data || []) as EarningsWithPayment[],
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get earnings by recipient
   */
  static async getEarningsByRecipient(
    recipientType: RecipientType,
    recipientId: string
  ): Promise<EarningsWithPayment[]> {
    const result = await this.getEarnings({
      recipient_type: recipientType,
      recipient_id: recipientId,
    });
    return result.data;
  }

  /**
   * Create a new earnings entry
   */
  static async createEarningEntry(input: {
    payment_id: string;
    recipient_type: RecipientType;
    recipient_id?: string;
    builder_id?: string;
    cohort_member_id?: string;
    production_learner_id?: string;
    department_id?: string;
    institution_id?: string;
    amount: number;
    percentage: number;
    status?: EarningsStatus;
  }): Promise<EarningsLedger> {
    const insertData: Record<string, unknown> = {
      payment_id: input.payment_id,
      recipient_type: input.recipient_type,
      amount: input.amount,
      percentage: input.percentage,
      status: input.status || 'calculated',
    };
    // Only set optional FK columns if provided
    if (input.recipient_id) insertData.recipient_id = input.recipient_id;
    if (input.builder_id) insertData.builder_id = input.builder_id;
    if (input.cohort_member_id) insertData.cohort_member_id = input.cohort_member_id;
    if (input.production_learner_id) insertData.production_learner_id = input.production_learner_id;
    if (input.department_id) insertData.department_id = input.department_id;
    if (input.institution_id) insertData.institution_id = input.institution_id;

    const { data, error } = await (this.supabase as any).from('sh_earnings_ledger')
      .insert(insertData)
      .select()
      .single();

    if (error) throw new Error(`Failed to create earnings entry: ${error.message}`);
    return data as EarningsLedger;
  }

  /**
   * Get earnings statistics for dashboard
   */
  static async getEarningsStats(): Promise<{
    total_calculated: number;
    total_approved: number;
    total_paid: number;
    this_month_total: number;
    by_recipient_type: Record<string, { calculated: number; approved: number; paid: number }>;
  }> {
    const { data, error } = await (this.supabase as any).from('sh_earnings_ledger')
      .select('amount, status, recipient_type, created_at');

    if (error) throw new Error(`Failed to fetch earnings stats: ${error.message}`);

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const stats = {
      total_calculated: 0,
      total_approved: 0,
      total_paid: 0,
      this_month_total: 0,
      by_recipient_type: {} as Record<string, { calculated: number; approved: number; paid: number }>,
    };

    for (const entry of data || []) {
      const amount = Number(entry.amount);
      const createdAt = new Date(entry.created_at);
      const isThisMonth = createdAt >= thisMonthStart;
      const recipientType = entry.recipient_type || 'unknown';

      // Initialize recipient type if not exists
      if (!stats.by_recipient_type[recipientType]) {
        stats.by_recipient_type[recipientType] = { calculated: 0, approved: 0, paid: 0 };
      }

      // Aggregate by status
      if (entry.status === 'calculated') {
        stats.total_calculated += amount;
        stats.by_recipient_type[recipientType].calculated += amount;
      } else if (entry.status === 'approved') {
        stats.total_approved += amount;
        stats.by_recipient_type[recipientType].approved += amount;
      } else if (entry.status === 'paid') {
        stats.total_paid += amount;
        stats.by_recipient_type[recipientType].paid += amount;
      }

      if (isThisMonth) {
        stats.this_month_total += amount;
      }
    }

    return stats;
  }

  /**
   * Get earnings summary by recipient type
   */
  static async getEarningsSummary(): Promise<EarningsSummary[]> {
    const { data, error } = await (this.supabase as any).from('sh_earnings_ledger')
      .select('recipient_type, status, amount');

    if (error) throw new Error(`Failed to fetch earnings summary: ${error.message}`);

    const summaryMap = new Map<RecipientType, EarningsSummary>();

    for (const entry of data || []) {
      const type = entry.recipient_type as RecipientType;
      if (!summaryMap.has(type)) {
        summaryMap.set(type, {
          recipient_type: type,
          recipient_name: getRecipientDisplayName(type),
          total_calculated: 0,
          total_approved: 0,
          total_paid: 0,
          entry_count: 0,
        });
      }

      const summary = summaryMap.get(type)!;
      summary.entry_count++;

      const amount = Number(entry.amount);
      if (entry.status === 'calculated') summary.total_calculated += amount;
      if (entry.status === 'approved') summary.total_approved += amount;
      if (entry.status === 'paid') summary.total_paid += amount;
    }

    return Array.from(summaryMap.values());
  }

  /**
   * Get total earnings for a specific recipient
   */
  static async getRecipientTotalEarnings(
    recipientType: RecipientType,
    recipientId: string
  ): Promise<RecipientTotalEarnings> {
    const { data, error } = await (this.supabase as any).from('sh_earnings_ledger')
      .select('amount, status')
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId);

    if (error) throw new Error(`Failed to fetch recipient earnings: ${error.message}`);

    const result: RecipientTotalEarnings = {
      calculated: 0,
      approved: 0,
      paid: 0,
      total: 0,
    };

    for (const entry of data || []) {
      const amount = Number(entry.amount);
      result.total += amount;

      if (entry.status === 'calculated') result.calculated += amount;
      if (entry.status === 'approved') result.approved += amount;
      if (entry.status === 'paid') result.paid += amount;
    }

    return result;
  }

  /**
   * Update earnings status
   */
  static async updateEarningsStatus(
    id: string,
    status: EarningsStatus,
    paidAt?: string
  ): Promise<EarningsLedger> {
    const updateData: Record<string, unknown> = { status };
    if (status === 'paid' && paidAt) {
      updateData.paid_at = paidAt;
    }

    const { data, error } = await (this.supabase as any).from('sh_earnings_ledger')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update earnings status: ${error.message}`);
    return data as EarningsLedger;
  }

  /**
   * Bulk update earnings status
   */
  static async bulkUpdateEarningsStatus(ids: string[], status: EarningsStatus): Promise<number> {
    const updateData: Record<string, unknown> = { status };
    if (status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }

    const { data, error } = await (this.supabase as any).from('sh_earnings_ledger')
      .update(updateData)
      .in('id', ids)
      .select();

    if (error) throw new Error(`Failed to bulk update earnings: ${error.message}`);
    return data?.length || 0;
  }

  /**
   * Approve all calculated earnings for a payment
   */
  static async approvePaymentEarnings(paymentId: string): Promise<number> {
    const { data, error } = await (this.supabase as any).from('sh_earnings_ledger')
      .update({ status: 'approved' })
      .eq('payment_id', paymentId)
      .eq('status', 'calculated')
      .select();

    if (error) throw new Error(`Failed to approve earnings: ${error.message}`);
    return data?.length || 0;
  }

  /**
   * Mark earnings as paid
   */
  static async markEarningsAsPaid(ids: string[], paidAt?: string): Promise<number> {
    const { data, error } = await (this.supabase as any).from('sh_earnings_ledger')
      .update({
        status: 'paid',
        paid_at: paidAt || new Date().toISOString(),
      })
      .in('id', ids)
      .eq('status', 'approved')
      .select();

    if (error) throw new Error(`Failed to mark earnings as paid: ${error.message}`);
    return data?.length || 0;
  }

  /**
   * Get department earnings breakdown
   */
  static async getDepartmentEarnings(
    departmentId: string,
    fromDate?: string,
    toDate?: string
  ): Promise<{
    entries: EarningsWithPayment[];
    total: number;
    by_status: Record<EarningsStatus, number>;
  }> {
    const filters: EarningsFilters = { department_id: departmentId };
    if (fromDate) filters.from_date = fromDate;
    if (toDate) filters.to_date = toDate;

    const result = await this.getEarnings(filters);

    const total = result.data.reduce((sum, e) => sum + Number(e.amount), 0);

    const byStatus: Record<EarningsStatus, number> = {
      calculated: 0,
      approved: 0,
      paid: 0,
    };

    for (const entry of result.data) {
      byStatus[entry.status as EarningsStatus] += Number(entry.amount);
    }

    return { entries: result.data, total, by_status: byStatus };
  }

  /**
   * Get monthly earnings report
   */
  static async getMonthlyEarningsReport(
    month: number,
    year: number
  ): Promise<{
    month: string;
    year: number;
    by_recipient_type: Record<string, number>;
    total: number;
    entries: EarningsWithPayment[];
  }> {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const result = await this.getEarnings({ from_date: startDate, to_date: endDate });

    const total = result.data.reduce((sum, e) => sum + Number(e.amount), 0);

    const byRecipientType: Record<string, number> = {};
    for (const entry of result.data) {
      const type = entry.recipient_type || 'unknown';
      byRecipientType[type] = (byRecipientType[type] || 0) + Number(entry.amount);
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    return {
      month: monthNames[month - 1],
      year,
      by_recipient_type: byRecipientType,
      total,
      entries: result.data,
    };
  }
}

// Export singleton instance methods
export const earningsService = {
  getEarnings: EarningsService.getEarnings.bind(EarningsService),
  getEarningsByRecipient: EarningsService.getEarningsByRecipient.bind(EarningsService),
  createEarningEntry: EarningsService.createEarningEntry.bind(EarningsService),
  getEarningsSummary: EarningsService.getEarningsSummary.bind(EarningsService),
  getEarningsStats: EarningsService.getEarningsStats.bind(EarningsService),
  getRecipientTotalEarnings: EarningsService.getRecipientTotalEarnings.bind(EarningsService),
  updateEarningsStatus: EarningsService.updateEarningsStatus.bind(EarningsService),
  bulkUpdateEarningsStatus: EarningsService.bulkUpdateEarningsStatus.bind(EarningsService),
  approvePaymentEarnings: EarningsService.approvePaymentEarnings.bind(EarningsService),
  markEarningsAsPaid: EarningsService.markEarningsAsPaid.bind(EarningsService),
  getDepartmentEarnings: EarningsService.getDepartmentEarnings.bind(EarningsService),
  getMonthlyEarningsReport: EarningsService.getMonthlyEarningsReport.bind(EarningsService),
};
