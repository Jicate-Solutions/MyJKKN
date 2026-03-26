// lib/services/startup-studio/finance-service.ts
// CRUD + analytics for grants, budgets, revenue, and audit records

import { BaseService } from '../base-service';
import type {
  SSGrant,
  CreateGrantInput,
  UpdateGrantInput,
  SSBudget,
  CreateBudgetInput,
  UpdateBudgetInput,
  SSRevenue,
  RecordRevenueInput,
  SSAuditRecord,
  CreateAuditRecordInput,
  UpdateAuditRecordInput,
  SustainabilityMetrics,
  GrantUtilization,
} from '@/types/startup-studio';

export class FinanceService extends BaseService {
  // ============================================
  // GRANTS
  // ============================================

  /**
   * Get all grants, optionally filtered by institution
   */
  static async getGrants(institutionId?: string): Promise<SSGrant[]> {
    let query = this.supabase
      .from('ss_grants')
      .select('*')
      .order('created_at', { ascending: false });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch grants: ' + error.message);
    return (data || []) as SSGrant[];
  }

  /**
   * Create a new grant record
   */
  static async createGrant(input: CreateGrantInput): Promise<SSGrant> {
    const { data, error } = await this.supabase
      .from('ss_grants')
      .insert({
        name: input.name,
        funder: input.funder,
        grant_number: input.grant_number ?? null,
        sanctioned_amount: input.sanctioned_amount,
        received_amount: input.received_amount ?? 0,
        utilized_amount: input.utilized_amount ?? 0,
        currency: input.currency ?? 'INR',
        sanction_date: input.sanction_date ?? null,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        purpose: input.purpose ?? null,
        allowed_heads: input.allowed_heads ?? null,
        reporting_frequency: input.reporting_frequency ?? 'quarterly',
        institution_id: input.institution_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create grant: ' + error.message);
    return data as SSGrant;
  }

  /**
   * Update an existing grant
   */
  static async updateGrant(grantId: string, updates: UpdateGrantInput): Promise<SSGrant> {
    const { data, error } = await this.supabase
      .from('ss_grants')
      .update(updates)
      .eq('id', grantId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update grant: ' + error.message);
    return data as SSGrant;
  }

  // ============================================
  // BUDGETS
  // ============================================

  /**
   * Get budgets, optionally filtered by fiscal_year and institution
   */
  static async getBudgets(filters?: {
    fiscal_year?: string;
    grant_id?: string;
    institution_id?: string;
  }): Promise<SSBudget[]> {
    let query = this.supabase
      .from('ss_budgets')
      .select('*')
      .order('fiscal_year', { ascending: false })
      .order('category', { ascending: true });

    if (filters?.fiscal_year) {
      query = query.eq('fiscal_year', filters.fiscal_year);
    }
    if (filters?.grant_id) {
      query = query.eq('grant_id', filters.grant_id);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch budgets: ' + error.message);
    return (data || []) as SSBudget[];
  }

  /**
   * Create a new budget line
   */
  static async createBudget(input: CreateBudgetInput): Promise<SSBudget> {
    const { data, error } = await this.supabase
      .from('ss_budgets')
      .insert({
        fiscal_year: input.fiscal_year,
        quarter: input.quarter ?? null,
        category: input.category,
        subcategory: input.subcategory ?? null,
        allocated_amount: input.allocated_amount,
        spent_amount: input.spent_amount ?? 0,
        committed_amount: input.committed_amount ?? 0,
        grant_id: input.grant_id ?? null,
        notes: input.notes ?? null,
        approved_by: input.approved_by ?? null,
        institution_id: input.institution_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create budget: ' + error.message);
    return data as SSBudget;
  }

  /**
   * Update an existing budget line
   */
  static async updateBudget(budgetId: string, updates: UpdateBudgetInput): Promise<SSBudget> {
    const { data, error } = await this.supabase
      .from('ss_budgets')
      .update(updates)
      .eq('id', budgetId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update budget: ' + error.message);
    return data as SSBudget;
  }

  // ============================================
  // REVENUE
  // ============================================

  /**
   * Get revenue records, optionally filtered
   */
  static async getRevenue(filters?: {
    fiscal_year?: string;
    source?: string;
    institution_id?: string;
  }): Promise<SSRevenue[]> {
    let query = this.supabase
      .from('ss_revenue')
      .select('*')
      .order('fiscal_year', { ascending: false })
      .order('month', { ascending: false });

    if (filters?.fiscal_year) {
      query = query.eq('fiscal_year', filters.fiscal_year);
    }
    if (filters?.source) {
      query = query.eq('source', filters.source);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch revenue: ' + error.message);
    return (data || []) as SSRevenue[];
  }

  /**
   * Record a new revenue entry
   */
  static async recordRevenue(input: RecordRevenueInput): Promise<SSRevenue> {
    const { data, error } = await this.supabase
      .from('ss_revenue')
      .insert({
        fiscal_year: input.fiscal_year,
        month: input.month ?? null,
        source: input.source,
        amount: input.amount,
        currency: input.currency ?? 'INR',
        description: input.description ?? null,
        is_self_generated: input.is_self_generated ?? false,
        institution_id: input.institution_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to record revenue: ' + error.message);
    return data as SSRevenue;
  }

  // ============================================
  // AUDIT RECORDS
  // ============================================

  /**
   * Get audit records, optionally filtered
   */
  static async getAuditRecords(filters?: {
    status?: string;
    audit_type?: string;
    institution_id?: string;
  }): Promise<SSAuditRecord[]> {
    let query = this.supabase
      .from('ss_audit_records')
      .select('*')
      .order('audit_period_start', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.audit_type) {
      query = query.eq('audit_type', filters.audit_type);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch audit records: ' + error.message);
    return (data || []) as SSAuditRecord[];
  }

  /**
   * Create a new audit record
   */
  static async createAuditRecord(input: CreateAuditRecordInput): Promise<SSAuditRecord> {
    const { data, error } = await this.supabase
      .from('ss_audit_records')
      .insert({
        audit_type: input.audit_type,
        audit_period_start: input.audit_period_start,
        audit_period_end: input.audit_period_end,
        auditor_name: input.auditor_name ?? null,
        auditor_organization: input.auditor_organization ?? null,
        status: 'scheduled',
        institution_id: input.institution_id ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create audit record: ' + error.message);
    return data as SSAuditRecord;
  }

  /**
   * Update an existing audit record
   */
  static async updateAuditRecord(auditId: string, updates: UpdateAuditRecordInput): Promise<SSAuditRecord> {
    const { data, error } = await this.supabase
      .from('ss_audit_records')
      .update(updates)
      .eq('id', auditId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update audit record: ' + error.message);
    return data as SSAuditRecord;
  }

  // ============================================
  // ANALYTICS
  // ============================================

  /**
   * Get sustainability metrics: ratio of self-generated vs grant income
   */
  static async getSustainabilityMetrics(filters?: {
    fiscal_year?: string;
    institution_id?: string;
  }): Promise<SustainabilityMetrics> {
    let query = this.supabase
      .from('ss_revenue')
      .select('amount, is_self_generated');

    if (filters?.fiscal_year) {
      query = query.eq('fiscal_year', filters.fiscal_year);
    }
    if (filters?.institution_id) {
      query = query.eq('institution_id', filters.institution_id);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch sustainability metrics: ' + error.message);

    const records = data || [];
    const selfIncome = records
      .filter((r: any) => r.is_self_generated)
      .reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
    const grantIncome = records
      .filter((r: any) => !r.is_self_generated)
      .reduce((sum: number, r: any) => sum + (r.amount || 0), 0);
    const totalRevenue = selfIncome + grantIncome;

    return {
      self_generated_ratio: totalRevenue > 0
        ? Math.round((selfIncome / totalRevenue) * 100) / 100
        : 0,
      total_revenue: totalRevenue,
      grant_income: grantIncome,
      self_income: selfIncome,
    };
  }

  /**
   * Get grant utilization summary for all active grants
   */
  static async getGrantUtilization(institutionId?: string): Promise<GrantUtilization[]> {
    let query = this.supabase
      .from('ss_grants')
      .select('*')
      .order('end_date', { ascending: true });

    if (institutionId) {
      query = query.eq('institution_id', institutionId);
    }

    const { data, error } = await query;
    if (error) throw new Error('Failed to fetch grant utilization: ' + error.message);

    const now = new Date();

    return (data || []).map((g: any) => {
      const sanctioned = g.sanctioned_amount || 0;
      const utilized = g.utilized_amount || 0;
      const utilization_pct = sanctioned > 0
        ? Math.round((utilized / sanctioned) * 10000) / 100
        : 0;
      const remaining = sanctioned - utilized;

      let days_remaining: number | null = null;
      if (g.end_date) {
        const endDate = new Date(g.end_date);
        days_remaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }

      return {
        id: g.id,
        name: g.name,
        funder: g.funder,
        sanctioned_amount: sanctioned,
        received_amount: g.received_amount || 0,
        utilized_amount: utilized,
        utilization_pct,
        remaining,
        end_date: g.end_date,
        days_remaining,
        audit_status: g.audit_status,
      } as GrantUtilization;
    });
  }
}

export const financeService = {
  getGrants: FinanceService.getGrants.bind(FinanceService),
  createGrant: FinanceService.createGrant.bind(FinanceService),
  updateGrant: FinanceService.updateGrant.bind(FinanceService),
  getBudgets: FinanceService.getBudgets.bind(FinanceService),
  createBudget: FinanceService.createBudget.bind(FinanceService),
  updateBudget: FinanceService.updateBudget.bind(FinanceService),
  getRevenue: FinanceService.getRevenue.bind(FinanceService),
  recordRevenue: FinanceService.recordRevenue.bind(FinanceService),
  getAuditRecords: FinanceService.getAuditRecords.bind(FinanceService),
  createAuditRecord: FinanceService.createAuditRecord.bind(FinanceService),
  updateAuditRecord: FinanceService.updateAuditRecord.bind(FinanceService),
  getSustainabilityMetrics: FinanceService.getSustainabilityMetrics.bind(FinanceService),
  getGrantUtilization: FinanceService.getGrantUtilization.bind(FinanceService),
};
