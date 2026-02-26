// lib/services/ims/financial-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsFinancialTransaction,
  ImsFinancialFilters,
  ImsFinancialSummary,
  ImsDepartmentCostSummary,
  ImsItemProfitSummary,
  ImsTodayMetrics,
} from '@/types/ims';

export class ImsFinancialService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List financial transactions with pagination and filtering.
   */
  static async getTransactions(filters: ImsFinancialFilters = {}): Promise<{
    data: ImsFinancialTransaction[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_financial_transactions')
        .select(
          `*,
           department:departments(id,department_name),
           item:ims_items(id,name,code),
           created_by_profile:profiles!created_by(full_name)`,
          { count: 'exact' }
        );

      // Transaction type filter
      if (filters.transaction_type) {
        query = query.eq('transaction_type', filters.transaction_type);
      }

      // Department filter
      if (filters.department_id) {
        query = query.eq('department_id', filters.department_id);
      }

      // Date range
      if (filters.date_from) {
        query = query.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      // Primary: store_id; Fallback: institution_id
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsFinancialTransaction[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsFinancialService] Error in getTransactions:', error);
      throw error;
    }
  }

  /**
   * Get aggregate financial summary for a date range.
   */
  static async getFinancialSummary(
    institution_id: string,
    dateFrom?: string,
    dateTo?: string,
    storeId?: string
  ): Promise<ImsFinancialSummary> {
    try {
      let query = this.supabase
        .from('ims_financial_transactions')
        .select('transaction_type, amount');

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        query = query.eq('store_id', storeId);
      } else {
        query = query.eq('institution_id', institution_id);
      }

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      const transactions = data || [];

      const totalRevenue = transactions
        .filter((t) => t.transaction_type === 'sale')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const totalCosts = transactions
        .filter((t) => t.transaction_type === 'purchase')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const totalIssuesValue = transactions
        .filter((t) => t.transaction_type === 'issue')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const totalWriteOffs = transactions
        .filter((t) => t.transaction_type === 'write_off' || t.transaction_type === 'adjustment')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      return {
        total_revenue: totalRevenue,
        total_costs: totalCosts,
        gross_profit: totalRevenue - totalCosts,
        total_issues_value: totalIssuesValue,
        total_write_offs: totalWriteOffs,
        transaction_count: transactions.length,
      };
    } catch (error) {
      console.error('[ImsFinancialService] Error in getFinancialSummary:', error);
      throw error;
    }
  }

  /**
   * Get costs summarized by department.
   */
  static async getDepartmentCostSummary(
    institution_id: string,
    storeId?: string
  ): Promise<ImsDepartmentCostSummary[]> {
    try {
      let deptQuery = this.supabase
        .from('ims_financial_transactions')
        .select(
          `department_id, amount, item_id,
           department:departments(id,department_name)`
        );

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        deptQuery = deptQuery.eq('store_id', storeId);
      } else {
        deptQuery = deptQuery.eq('institution_id', institution_id);
      }

      const { data, error } = await deptQuery
        .in('transaction_type', ['issue', 'adjustment'])
        .not('department_id', 'is', null);

      if (error) throw error;

      // Aggregate by department
      const deptMap = new Map<
        string,
        { name: string; totalIssued: number; totalConsumed: number; itemIds: Set<string> }
      >();

      for (const t of data || []) {
        if (!t.department_id) continue;
        const existing = deptMap.get(t.department_id) || {
          name: (t.department as any)?.department_name || 'Unknown',
          totalIssued: 0,
          totalConsumed: 0,
          itemIds: new Set<string>(),
        };

        existing.totalIssued += t.amount || 0;
        existing.totalConsumed += t.amount || 0;
        if (t.item_id) existing.itemIds.add(t.item_id);

        deptMap.set(t.department_id, existing);
      }

      return Array.from(deptMap.entries()).map(([deptId, info]) => ({
        department_id: deptId,
        department_name: info.name,
        total_issued_value: info.totalIssued,
        total_consumed_value: info.totalConsumed,
        item_count: info.itemIds.size,
      }));
    } catch (error) {
      console.error('[ImsFinancialService] Error in getDepartmentCostSummary:', error);
      throw error;
    }
  }

  /**
   * Get profit summarized by item (from sales).
   */
  static async getItemProfitSummary(
    institution_id: string,
    storeId?: string
  ): Promise<ImsItemProfitSummary[]> {
    try {
      let profitQuery = this.supabase
        .from('ims_sale_items')
        .select(
          `item_id, quantity, total, profit, cost_price, unit_price,
           item:ims_items(id,name,code),
           sale:ims_sales!inner(institution_id, store_id, status)`
        );

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        profitQuery = profitQuery.eq('sale.store_id', storeId);
      } else {
        profitQuery = profitQuery.eq('sale.institution_id', institution_id);
      }

      const { data, error } = await profitQuery
        .eq('sale.status', 'completed');

      if (error) throw error;

      // Aggregate by item
      const itemMap = new Map<
        string,
        { name: string; code: string; totalSold: number; totalRevenue: number; totalCost: number }
      >();

      for (const si of data || []) {
        const existing = itemMap.get(si.item_id) || {
          name: (si.item as any)?.name || '',
          code: (si.item as any)?.code || '',
          totalSold: 0,
          totalRevenue: 0,
          totalCost: 0,
        };

        existing.totalSold += si.quantity || 0;
        existing.totalRevenue += si.total || 0;
        existing.totalCost += (si.cost_price || 0) * (si.quantity || 0);

        itemMap.set(si.item_id, existing);
      }

      return Array.from(itemMap.entries()).map(([itemId, info]) => {
        const profit = info.totalRevenue - info.totalCost;
        return {
          item_id: itemId,
          item_name: info.name,
          item_code: info.code,
          total_sold: info.totalSold,
          total_revenue: info.totalRevenue,
          total_cost: info.totalCost,
          profit,
          margin_percent: info.totalRevenue > 0 ? (profit / info.totalRevenue) * 100 : 0,
        };
      });
    } catch (error) {
      console.error('[ImsFinancialService] Error in getItemProfitSummary:', error);
      throw error;
    }
  }

  /**
   * Get today's quick financial metrics.
   */
  static async getTodayMetrics(institution_id: string, storeId?: string): Promise<ImsTodayMetrics> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dayStart = `${today}T00:00:00.000Z`;
      const dayEnd = `${today}T23:59:59.999Z`;

      let metricsQuery = this.supabase
        .from('ims_sales')
        .select('total_amount, profit_amount');

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        metricsQuery = metricsQuery.eq('store_id', storeId);
      } else {
        metricsQuery = metricsQuery.eq('institution_id', institution_id);
      }

      const { data: sales, error } = await metricsQuery
        .eq('status', 'completed')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

      if (error) throw error;

      const salesData = sales || [];
      const salesRevenue = salesData.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const profit = salesData.reduce((sum, s) => sum + (s.profit_amount || 0), 0);

      return {
        sales_count: salesData.length,
        sales_revenue: salesRevenue,
        profit,
        pending_payments: 0, // Can be extended with payment tracking
        margin_percent: salesRevenue > 0 ? (profit / salesRevenue) * 100 : 0,
      };
    } catch (error) {
      console.error('[ImsFinancialService] Error in getTodayMetrics:', error);
      throw error;
    }
  }
}
