// lib/services/solutions/unified-earnings-service.ts
// Unified Earnings Service - aggregates earnings across all talent types
// Purpose: Provide a single view of earnings for builder, cohort, and production talent

import { BaseService, type BaseListResponse } from '../base-service';
import type {
  RecipientType,
  EarningsStatus,
  PaginationParams,
} from './types';

// ============================================
// TYPES
// ============================================

export type TalentType = 'builder' | 'cohort_member' | 'production_learner';

export interface UnifiedEarningsEntry {
  id: string;
  payment_id: string;
  amount: number;
  percentage: number;
  status: EarningsStatus;
  recipient_type: RecipientType;
  recipient_name: string;
  recipient_id?: string;
  talent_type: TalentType;
  created_at: string;
  paid_at?: string;
  // Related info
  source?: {
    type: 'phase' | 'session' | 'deliverable';
    title?: string;
    solution_code?: string;
    solution_title?: string;
  };
}

export interface EarningsSummary {
  total_earnings: number;
  pending_earnings: number;
  paid_earnings: number;
  by_talent_type: {
    builder: { total: number; pending: number; paid: number };
    cohort_member: { total: number; pending: number; paid: number };
    production_learner: { total: number; pending: number; paid: number };
  };
  by_month: Array<{
    month: string;
    year: number;
    amount: number;
    by_type: {
      builder: number;
      cohort_member: number;
      production_learner: number;
    };
  }>;
  recent_payouts: Array<{
    id: string;
    amount: number;
    paid_at: string;
    recipient_type: TalentType;
  }>;
}

export interface PayoutHistoryEntry {
  id: string;
  amount: number;
  paid_at: string;
  recipient_type: TalentType;
  recipient_name: string;
  status: EarningsStatus;
  source_title?: string;
  solution_code?: string;
}

export interface UnifiedEarningsFilters extends PaginationParams {
  talent_types?: TalentType[];
  status?: EarningsStatus;
  from_date?: string;
  to_date?: string;
}

// ============================================
// SERVICE CLASS
// ============================================

export class UnifiedEarningsService extends BaseService {
  /**
   * Get unified earnings for a user across all talent types
   * Checks if user is a builder, cohort member, or production learner and aggregates earnings
   */
  static async getUnifiedEarnings(
    userId: string,
    filters?: UnifiedEarningsFilters
  ): Promise<BaseListResponse<UnifiedEarningsEntry>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    // Get all talent profiles for this user — use allSettled so one failure doesn't block others
    const profileResults = await Promise.allSettled([
      this.getBuilderByUserId(userId),
      this.getCohortMemberByUserId(userId),
      this.getProductionLearnerByUserId(userId),
    ]);

    const builderProfile = profileResults[0].status === 'fulfilled' ? profileResults[0].value : null;
    const cohortProfile = profileResults[1].status === 'fulfilled' ? profileResults[1].value : null;
    const productionProfile = profileResults[2].status === 'fulfilled' ? profileResults[2].value : null;

    const earningsPromises: Promise<UnifiedEarningsEntry[]>[] = [];

    // Get builder earnings
    if (builderProfile && (!filters?.talent_types || filters.talent_types.includes('builder'))) {
      earningsPromises.push(this.getBuilderEarnings(builderProfile.id, filters));
    }

    // Get cohort member earnings
    if (cohortProfile && (!filters?.talent_types || filters.talent_types.includes('cohort_member'))) {
      earningsPromises.push(this.getCohortEarnings(cohortProfile.id, filters));
    }

    // Get production learner earnings
    if (productionProfile && (!filters?.talent_types || filters.talent_types.includes('production_learner'))) {
      earningsPromises.push(this.getProductionEarnings(productionProfile.id, filters));
    }

    // Aggregate all earnings
    const allEarningsArrays = await Promise.all(earningsPromises);
    let allEarnings = allEarningsArrays.flat();

    // Sort by created_at descending
    allEarnings.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply pagination
    const total = allEarnings.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedEarnings = allEarnings.slice(start, end);

    return {
      data: paginatedEarnings,
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  /**
   * Get earnings summary for a user across all talent types
   */
  static async getEarningsSummary(userId: string): Promise<EarningsSummary> {
    // Get all talent profiles for this user — use allSettled so one failure doesn't block others
    const profileResults = await Promise.allSettled([
      this.getBuilderByUserId(userId),
      this.getCohortMemberByUserId(userId),
      this.getProductionLearnerByUserId(userId),
    ]);

    const builderProfile = profileResults[0].status === 'fulfilled' ? profileResults[0].value : null;
    const cohortProfile = profileResults[1].status === 'fulfilled' ? profileResults[1].value : null;
    const productionProfile = profileResults[2].status === 'fulfilled' ? profileResults[2].value : null;

    // Initialize summary
    const summary: EarningsSummary = {
      total_earnings: 0,
      pending_earnings: 0,
      paid_earnings: 0,
      by_talent_type: {
        builder: { total: 0, pending: 0, paid: 0 },
        cohort_member: { total: 0, pending: 0, paid: 0 },
        production_learner: { total: 0, pending: 0, paid: 0 },
      },
      by_month: [],
      recent_payouts: [],
    };

    const allPaidEarnings: Array<{ id: string; amount: number; paid_at: string; recipient_type: TalentType }> = [];
    const monthlyTotals = new Map<string, { builder: number; cohort_member: number; production_learner: number }>();

    // Process builder earnings
    if (builderProfile) {
      const earnings = await this.getBuilderEarnings(builderProfile.id);
      for (const entry of earnings) {
        const amount = Number(entry.amount);
        summary.total_earnings += amount;
        summary.by_talent_type.builder.total += amount;

        if (entry.status === 'paid') {
          summary.paid_earnings += amount;
          summary.by_talent_type.builder.paid += amount;
          if (entry.paid_at) {
            allPaidEarnings.push({
              id: entry.id,
              amount,
              paid_at: entry.paid_at,
              recipient_type: 'builder',
            });
          }
        } else {
          summary.pending_earnings += amount;
          summary.by_talent_type.builder.pending += amount;
        }

        // Monthly aggregation
        const monthKey = entry.created_at.slice(0, 7); // YYYY-MM
        if (!monthlyTotals.has(monthKey)) {
          monthlyTotals.set(monthKey, { builder: 0, cohort_member: 0, production_learner: 0 });
        }
        monthlyTotals.get(monthKey)!.builder += amount;
      }
    }

    // Process cohort member earnings
    if (cohortProfile) {
      const earnings = await this.getCohortEarnings(cohortProfile.id);
      for (const entry of earnings) {
        const amount = Number(entry.amount);
        summary.total_earnings += amount;
        summary.by_talent_type.cohort_member.total += amount;

        if (entry.status === 'paid') {
          summary.paid_earnings += amount;
          summary.by_talent_type.cohort_member.paid += amount;
          if (entry.paid_at) {
            allPaidEarnings.push({
              id: entry.id,
              amount,
              paid_at: entry.paid_at,
              recipient_type: 'cohort_member',
            });
          }
        } else {
          summary.pending_earnings += amount;
          summary.by_talent_type.cohort_member.pending += amount;
        }

        // Monthly aggregation
        const monthKey = entry.created_at.slice(0, 7);
        if (!monthlyTotals.has(monthKey)) {
          monthlyTotals.set(monthKey, { builder: 0, cohort_member: 0, production_learner: 0 });
        }
        monthlyTotals.get(monthKey)!.cohort_member += amount;
      }
    }

    // Process production learner earnings
    if (productionProfile) {
      const earnings = await this.getProductionEarnings(productionProfile.id);
      for (const entry of earnings) {
        const amount = Number(entry.amount);
        summary.total_earnings += amount;
        summary.by_talent_type.production_learner.total += amount;

        if (entry.status === 'paid') {
          summary.paid_earnings += amount;
          summary.by_talent_type.production_learner.paid += amount;
          if (entry.paid_at) {
            allPaidEarnings.push({
              id: entry.id,
              amount,
              paid_at: entry.paid_at,
              recipient_type: 'production_learner',
            });
          }
        } else {
          summary.pending_earnings += amount;
          summary.by_talent_type.production_learner.pending += amount;
        }

        // Monthly aggregation
        const monthKey = entry.created_at.slice(0, 7);
        if (!monthlyTotals.has(monthKey)) {
          monthlyTotals.set(monthKey, { builder: 0, cohort_member: 0, production_learner: 0 });
        }
        monthlyTotals.get(monthKey)!.production_learner += amount;
      }
    }

    // Convert monthly totals to array and sort
    summary.by_month = Array.from(monthlyTotals.entries())
      .map(([monthKey, totals]) => {
        const [year] = monthKey.split('-');
        return {
          month: monthKey,
          year: parseInt(year),
          amount: totals.builder + totals.cohort_member + totals.production_learner,
          by_type: totals,
        };
      })
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12); // Last 12 months

    // Get recent payouts (sorted by paid_at)
    summary.recent_payouts = allPaidEarnings
      .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime())
      .slice(0, 10);

    return summary;
  }

  /**
   * Get payout history for a user
   */
  static async getPayoutHistory(
    userId: string,
    filters?: UnifiedEarningsFilters
  ): Promise<BaseListResponse<PayoutHistoryEntry>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    // Get all paid earnings
    const result = await this.getUnifiedEarnings(userId, {
      ...filters,
      status: 'paid',
    });

    const payoutHistory: PayoutHistoryEntry[] = result.data
      .filter(e => e.paid_at)
      .map(e => ({
        id: e.id,
        amount: e.amount,
        paid_at: e.paid_at!,
        recipient_type: e.talent_type,
        recipient_name: e.recipient_name,
        status: e.status,
        source_title: e.source?.title,
        solution_code: e.source?.solution_code,
      }));

    // Sort by paid_at descending
    payoutHistory.sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime());

    // Apply pagination
    const total = payoutHistory.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedHistory = payoutHistory.slice(start, end);

    return {
      data: paginatedHistory,
      metadata: {
        total,
        page,
        limit,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    };
  }

  // ============================================
  // PRIVATE HELPER METHODS
  // ============================================

  /**
   * Get builder profile by user ID
   */
  private static async getBuilderByUserId(userId: string): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from('sh_builders')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[solutions/earnings] Failed to fetch builder profile:', error.message);
      throw new Error(`Failed to fetch builder profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Get cohort member profile by user ID
   */
  private static async getCohortMemberByUserId(userId: string): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from('sh_cohort_members')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[solutions/earnings] Failed to fetch cohort member profile:', error.message);
      throw new Error(`Failed to fetch cohort member profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Get production learner profile by user ID
   */
  private static async getProductionLearnerByUserId(userId: string): Promise<{ id: string } | null> {
    const { data, error } = await this.supabase
      .from('sh_production_learners')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[solutions/earnings] Failed to fetch production learner profile:', error.message);
      throw new Error(`Failed to fetch production learner profile: ${error.message}`);
    }

    return data;
  }

  /**
   * Get builder earnings from the ledger
   */
  private static async getBuilderEarnings(
    builderId: string,
    filters?: UnifiedEarningsFilters
  ): Promise<UnifiedEarningsEntry[]> {
    let query = this.supabase
      .from('sh_earnings_ledger')
      .select(`
        *,
        payment:sh_payments(
          id,
          amount,
          payment_type,
          phase:sh_solution_phases(
            title,
            solution:sh_solutions(title, solution_code)
          )
        )
      `)
      .eq('recipient_type', 'builder')
      .eq('recipient_id', builderId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.from_date) {
      query = query.gte('created_at', filters.from_date);
    }

    if (filters?.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Failed to fetch builder earnings:', error.message);
      return [];
    }

    return (data || []).map((entry: any) => ({
      id: entry.id,
      payment_id: entry.payment_id,
      amount: entry.amount,
      percentage: entry.percentage,
      status: entry.status,
      recipient_type: entry.recipient_type,
      recipient_name: entry.recipient_name,
      recipient_id: entry.recipient_id,
      talent_type: 'builder' as TalentType,
      created_at: entry.created_at,
      paid_at: entry.paid_at,
      source: entry.payment?.phase ? {
        type: 'phase' as const,
        title: entry.payment.phase.title,
        solution_code: entry.payment.phase.solution?.solution_code,
        solution_title: entry.payment.phase.solution?.title,
      } : undefined,
    }));
  }

  /**
   * Get cohort member earnings from the ledger
   */
  private static async getCohortEarnings(
    cohortMemberId: string,
    filters?: UnifiedEarningsFilters
  ): Promise<UnifiedEarningsEntry[]> {
    let query = this.supabase
      .from('sh_earnings_ledger')
      .select(`
        *,
        payment:sh_payments(
          id,
          amount,
          payment_type,
          program:sh_training_programs(
            solution:sh_solutions(title, solution_code)
          )
        )
      `)
      .eq('recipient_type', 'cohort_member')
      .eq('recipient_id', cohortMemberId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.from_date) {
      query = query.gte('created_at', filters.from_date);
    }

    if (filters?.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Failed to fetch cohort earnings:', error.message);
      return [];
    }

    return (data || []).map((entry: any) => ({
      id: entry.id,
      payment_id: entry.payment_id,
      amount: entry.amount,
      percentage: entry.percentage,
      status: entry.status,
      recipient_type: entry.recipient_type,
      recipient_name: entry.recipient_name,
      recipient_id: entry.recipient_id,
      talent_type: 'cohort_member' as TalentType,
      created_at: entry.created_at,
      paid_at: entry.paid_at,
      source: entry.payment?.program ? {
        type: 'session' as const,
        title: 'Training Session',
        solution_code: entry.payment.program.solution?.solution_code,
        solution_title: entry.payment.program.solution?.title,
      } : undefined,
    }));
  }

  /**
   * Get production learner earnings from the ledger
   */
  private static async getProductionEarnings(
    learnerId: string,
    filters?: UnifiedEarningsFilters
  ): Promise<UnifiedEarningsEntry[]> {
    let query = this.supabase
      .from('sh_earnings_ledger')
      .select(`
        *,
        payment:sh_payments(
          id,
          amount,
          payment_type,
          order:sh_content_orders(
            solution:sh_solutions(title, solution_code)
          )
        )
      `)
      .eq('recipient_type', 'production_learner')
      .eq('recipient_id', learnerId)
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.from_date) {
      query = query.gte('created_at', filters.from_date);
    }

    if (filters?.to_date) {
      query = query.lte('created_at', filters.to_date);
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Failed to fetch production earnings:', error.message);
      return [];
    }

    return (data || []).map((entry: any) => ({
      id: entry.id,
      payment_id: entry.payment_id,
      amount: entry.amount,
      percentage: entry.percentage,
      status: entry.status,
      recipient_type: entry.recipient_type,
      recipient_name: entry.recipient_name,
      recipient_id: entry.recipient_id,
      talent_type: 'production_learner' as TalentType,
      created_at: entry.created_at,
      paid_at: entry.paid_at,
      source: entry.payment?.order ? {
        type: 'deliverable' as const,
        title: 'Content Deliverable',
        solution_code: entry.payment.order.solution?.solution_code,
        solution_title: entry.payment.order.solution?.title,
      } : undefined,
    }));
  }
}

// Export singleton instance methods
export const unifiedEarningsService = {
  getUnifiedEarnings: UnifiedEarningsService.getUnifiedEarnings.bind(UnifiedEarningsService),
  getEarningsSummary: UnifiedEarningsService.getEarningsSummary.bind(UnifiedEarningsService),
  getPayoutHistory: UnifiedEarningsService.getPayoutHistory.bind(UnifiedEarningsService),
};
