// lib/services/ims/reports-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsDashboardStats,
  ImsStockValuation,
  ImsExpiringItem,
  ImsIndentSummary,
  ImsIndentByDepartment,
  ImsDepartmentConsumption,
  ImsItemConsumption,
  ImsRecentActivity,
  ImsAlertSummary,
  ImsStockStatus,
} from '@/types/ims';
import { getStockStatus } from '@/types/ims';

export class ImsReportsService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * Dashboard overview stats combining multiple queries.
   */
  static async getDashboardStats(storeId: string, institutionId?: string): Promise<ImsDashboardStats> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dayStart = `${today}T00:00:00.000Z`;
      const dayEnd = `${today}T23:59:59.999Z`;

      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      // Helper to apply store_id/institution_id filter
      const applyFilter = (query: any) => {
        if (storeId) {
          return query.eq('store_id', storeId);
        }
        if (institutionId) return query.eq('institution_id', institutionId);
        return query;
      };

      const [
        itemsResult,
        stockResult,
        pendingIndentsResult,
        todaySalesResult,
        expiringResult,
      ] = await Promise.all([
        // Total items
        applyFilter(
          this.supabase
            .from('ims_items')
            .select('id', { count: 'exact', head: true })
        ).eq('is_active', true),

        // Stock data for value and low/out-of-stock counts
        applyFilter(
          this.supabase
            .from('ims_stock_summary')
            .select(
              `current_quantity, total_value,
               item:ims_items(reorder_level, max_stock_level)`
            )
        ),

        // Pending indents
        applyFilter(
          this.supabase
            .from('ims_indent_requests')
            .select('id', { count: 'exact', head: true })
        ).eq('status', 'pending_approval'),

        // Today's sales
        applyFilter(
          this.supabase
            .from('ims_sales')
            .select('total_amount')
        )
          .eq('status', 'completed')
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd),

        // Expiring within 30 days
        applyFilter(
          this.supabase
            .from('ims_stock_batches')
            .select('id', { count: 'exact', head: true })
        )
          .not('expiry_date', 'is', null)
          .lte('expiry_date', thirtyDaysFromNow.toISOString().split('T')[0])
          .gt('quantity', 0),
      ]);

      const stockData = stockResult.data || [];
      const totalStockValue = stockData.reduce((sum, s) => sum + (s.total_value || 0), 0);

      let lowStockCount = 0;
      let outOfStockCount = 0;

      for (const s of stockData) {
        const reorderLevel = (s.item as any)?.reorder_level || 0;
        if (s.current_quantity <= 0) {
          outOfStockCount++;
        } else if (s.current_quantity <= reorderLevel) {
          lowStockCount++;
        }
      }

      const todaySales = todaySalesResult.data || [];
      const todayRevenue = todaySales.reduce((sum, s) => sum + (s.total_amount || 0), 0);

      return {
        total_items: itemsResult.count || 0,
        total_stock_value: totalStockValue,
        low_stock_count: lowStockCount,
        pending_indents: pendingIndentsResult.count || 0,
        today_sales: todaySales.length,
        today_revenue: todayRevenue,
        expiring_soon_count: expiringResult.count || 0,
        out_of_stock_count: outOfStockCount,
      };
    } catch (error) {
      console.error('[ImsReportsService] Error in getDashboardStats:', error);
      throw error;
    }
  }

  /**
   * Get all stock with status classification.
   */
  static async getStockLevels(storeId: string, institutionId?: string): Promise<
    Array<{
      item_id: string;
      item_name: string;
      item_code: string;
      current_quantity: number;
      reorder_level: number;
      max_stock_level: number;
      unit_abbreviation: string;
      category_name: string;
      status: ImsStockStatus;
    }>
  > {
    try {
      let stockQuery = this.supabase
        .from('ims_stock_summary')
        .select(
          `item_id, current_quantity,
           item:ims_items(
             id, name, code, reorder_level, max_stock_level,
             base_unit:ims_units!ims_items_base_unit_id_fkey(abbreviation),
             category:ims_item_categories(name)
           )`
        );

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        stockQuery = stockQuery.eq('store_id', storeId);
      } else if (institutionId) {
        stockQuery = stockQuery.eq('institution_id', institutionId);
      }

      const { data, error } = await stockQuery;

      if (error) throw error;

      return (data || []).map((s: any) => ({
        item_id: s.item_id,
        item_name: s.item?.name || '',
        item_code: s.item?.code || '',
        current_quantity: s.current_quantity,
        reorder_level: s.item?.reorder_level || 0,
        max_stock_level: s.item?.max_stock_level || 0,
        unit_abbreviation: s.item?.base_unit?.abbreviation || '',
        category_name: s.item?.category?.name || '',
        status: getStockStatus(
          s.current_quantity,
          s.item?.reorder_level || 0,
          s.item?.max_stock_level || 0
        ),
      }));
    } catch (error) {
      console.error('[ImsReportsService] Error in getStockLevels:', error);
      throw error;
    }
  }

  /**
   * Get items expiring within a given number of days.
   */
  static async getExpiringItems(
    storeId: string,
    days: number,
    institutionId?: string
  ): Promise<ImsExpiringItem[]> {
    try {
      const today = new Date();
      const futureDate = new Date();
      futureDate.setDate(today.getDate() + days);

      let expiringQuery = this.supabase
        .from('ims_stock_batches')
        .select(
          `item_id, batch_number, quantity, expiry_date,
           item:ims_items(id,name,code)`
        );

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        expiringQuery = expiringQuery.eq('store_id', storeId);
      } else if (institutionId) {
        expiringQuery = expiringQuery.eq('institution_id', institutionId);
      }

      const { data, error } = await expiringQuery
        .not('expiry_date', 'is', null)
        .lte('expiry_date', futureDate.toISOString().split('T')[0])
        .gt('quantity', 0)
        .order('expiry_date', { ascending: true });

      if (error) throw error;

      return (data || []).map((b: any) => {
        const expiryDate = new Date(b.expiry_date);
        const daysUntil = Math.ceil(
          (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          item_id: b.item_id,
          item_name: b.item?.name || '',
          item_code: b.item?.code || '',
          batch_number: b.batch_number || '',
          quantity: b.quantity,
          expiry_date: b.expiry_date,
          days_until_expiry: daysUntil,
        };
      }) as ImsExpiringItem[];
    } catch (error) {
      console.error('[ImsReportsService] Error in getExpiringItems:', error);
      throw error;
    }
  }

  /**
   * Get stock valuation grouped by category.
   */
  static async getStockValuation(storeId: string, institutionId?: string): Promise<ImsStockValuation[]> {
    try {
      let valuationQuery = this.supabase
        .from('ims_stock_summary')
        .select(
          `item_id, current_quantity, total_value,
           item:ims_items(category_id, category:ims_item_categories(id,name))`
        );

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        valuationQuery = valuationQuery.eq('store_id', storeId);
      } else if (institutionId) {
        valuationQuery = valuationQuery.eq('institution_id', institutionId);
      }

      const { data, error } = await valuationQuery;

      if (error) throw error;

      // Aggregate by category
      const categoryMap = new Map<
        string,
        { name: string; itemCount: number; totalQuantity: number; totalValue: number }
      >();

      let grandTotal = 0;

      for (const s of data || []) {
        const categoryId = (s.item as any)?.category_id || 'uncategorized';
        const categoryName = (s.item as any)?.category?.name || 'Uncategorized';

        const existing = categoryMap.get(categoryId) || {
          name: categoryName,
          itemCount: 0,
          totalQuantity: 0,
          totalValue: 0,
        };

        existing.itemCount++;
        existing.totalQuantity += s.current_quantity || 0;
        existing.totalValue += s.total_value || 0;
        grandTotal += s.total_value || 0;

        categoryMap.set(categoryId, existing);
      }

      return Array.from(categoryMap.entries()).map(([catId, info]) => ({
        category_id: catId,
        category_name: info.name,
        item_count: info.itemCount,
        total_quantity: info.totalQuantity,
        total_value: info.totalValue,
        percentage: grandTotal > 0 ? (info.totalValue / grandTotal) * 100 : 0,
      }));
    } catch (error) {
      console.error('[ImsReportsService] Error in getStockValuation:', error);
      throw error;
    }
  }

  /**
   * Get indent status distribution summary.
   */
  static async getIndentSummary(storeId: string, institutionId?: string): Promise<ImsIndentSummary> {
    try {
      let indentQuery = this.supabase
        .from('ims_indent_requests')
        .select('status');

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        indentQuery = indentQuery.eq('store_id', storeId);
      } else if (institutionId) {
        indentQuery = indentQuery.eq('institution_id', institutionId);
      }

      const { data, error } = await indentQuery;

      if (error) throw error;

      const indents = data || [];

      return {
        total: indents.length,
        pending: indents.filter((i) => i.status === 'pending_approval').length,
        approved: indents.filter((i) => i.status === 'approved').length,
        rejected: indents.filter((i) => i.status === 'rejected').length,
        issued: indents.filter((i) => i.status === 'issued' || i.status === 'partially_issued').length,
        delivered: indents.filter((i) => i.status === 'delivered').length,
      };
    } catch (error) {
      console.error('[ImsReportsService] Error in getIndentSummary:', error);
      throw error;
    }
  }

  /**
   * Get indents grouped by department.
   */
  static async getIndentsByDepartment(
    storeId: string,
    institutionId?: string
  ): Promise<ImsIndentByDepartment[]> {
    try {
      let deptIndentQuery = this.supabase
        .from('ims_indent_requests')
        .select(
          `department_id, status,
           department:departments(id,department_name)`
        );

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        deptIndentQuery = deptIndentQuery.eq('store_id', storeId);
      } else if (institutionId) {
        deptIndentQuery = deptIndentQuery.eq('institution_id', institutionId);
      }

      const { data, error } = await deptIndentQuery;

      if (error) throw error;

      // Aggregate by department
      const deptMap = new Map<
        string,
        { name: string; total: number; pending: number; approved: number; completed: number }
      >();

      for (const indent of data || []) {
        if (!indent.department_id) continue;

        const existing = deptMap.get(indent.department_id) || {
          name: (indent.department as any)?.department_name || 'Unknown',
          total: 0,
          pending: 0,
          approved: 0,
          completed: 0,
        };

        existing.total++;
        if (indent.status === 'pending_approval') existing.pending++;
        if (indent.status === 'approved') existing.approved++;
        if (indent.status === 'delivered' || indent.status === 'issued') existing.completed++;

        deptMap.set(indent.department_id, existing);
      }

      return Array.from(deptMap.entries()).map(([deptId, info]) => ({
        department_id: deptId,
        department_name: info.name,
        total_requests: info.total,
        pending: info.pending,
        approved: info.approved,
        completed: info.completed,
        estimated_value: 0, // Would require joining indent items for cost estimation
      }));
    } catch (error) {
      console.error('[ImsReportsService] Error in getIndentsByDepartment:', error);
      throw error;
    }
  }

  /**
   * Get department consumption (issues and adjustments by department).
   */
  static async getDepartmentConsumption(
    storeId: string,
    dateFrom?: string,
    dateTo?: string,
    institutionId?: string
  ): Promise<ImsDepartmentConsumption[]> {
    try {
      let query = this.supabase
        .from('ims_financial_transactions')
        .select(
          `department_id, item_id, quantity, amount,
           department:departments(id,department_name)`
        );

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      query = query
        .in('transaction_type', ['issue', 'adjustment'])
        .not('department_id', 'is', null);

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Aggregate by department
      const deptMap = new Map<
        string,
        {
          name: string;
          itemIds: Set<string>;
          totalQuantity: number;
          totalValue: number;
        }
      >();

      let grandTotal = 0;

      for (const t of data || []) {
        if (!t.department_id) continue;

        const existing = deptMap.get(t.department_id) || {
          name: (t.department as any)?.department_name || 'Unknown',
          itemIds: new Set<string>(),
          totalQuantity: 0,
          totalValue: 0,
        };

        if (t.item_id) existing.itemIds.add(t.item_id);
        existing.totalQuantity += t.quantity || 0;
        existing.totalValue += t.amount || 0;
        grandTotal += t.amount || 0;

        deptMap.set(t.department_id, existing);
      }

      return Array.from(deptMap.entries()).map(([deptId, info]) => ({
        department_id: deptId,
        department_name: info.name,
        total_items: info.itemIds.size,
        total_quantity: info.totalQuantity,
        total_value: info.totalValue,
        percentage: grandTotal > 0 ? (info.totalValue / grandTotal) * 100 : 0,
      }));
    } catch (error) {
      console.error('[ImsReportsService] Error in getDepartmentConsumption:', error);
      throw error;
    }
  }

  /**
   * Get consumption by item with department breakdown.
   */
  static async getItemConsumption(
    storeId: string,
    institutionId?: string
  ): Promise<ImsItemConsumption[]> {
    try {
      let query = this.supabase
        .from('ims_financial_transactions')
        .select(
          `item_id, quantity, amount, department_id,
           item:ims_items(id,name,code),
           department:departments(id,department_name)`
        )
        .in('transaction_type', ['issue', 'adjustment'])
        .not('item_id', 'is', null);

      if (storeId) query = query.eq('store_id', storeId);
      else if (institutionId) query = query.eq('institution_id', institutionId);

      const { data, error } = await query;

      if (error) throw error;

      // Aggregate by item
      const itemMap = new Map<
        string,
        {
          name: string;
          code: string;
          totalQuantity: number;
          totalValue: number;
          departments: Map<string, { name: string; quantity: number }>;
        }
      >();

      for (const t of data || []) {
        if (!t.item_id) continue;

        const existing = itemMap.get(t.item_id) || {
          name: (t.item as any)?.name || '',
          code: (t.item as any)?.code || '',
          totalQuantity: 0,
          totalValue: 0,
          departments: new Map(),
        };

        existing.totalQuantity += t.quantity || 0;
        existing.totalValue += t.amount || 0;

        if (t.department_id) {
          const deptName = (t.department as any)?.department_name || 'Unknown';
          const deptExisting = existing.departments.get(t.department_id) || {
            name: deptName,
            quantity: 0,
          };
          deptExisting.quantity += t.quantity || 0;
          existing.departments.set(t.department_id, deptExisting);
        }

        itemMap.set(t.item_id, existing);
      }

      return Array.from(itemMap.entries()).map(([itemId, info]) => ({
        item_id: itemId,
        item_name: info.name,
        item_code: info.code,
        total_quantity: info.totalQuantity,
        total_value: info.totalValue,
        departments: Array.from(info.departments.values()),
      }));
    } catch (error) {
      console.error('[ImsReportsService] Error in getItemConsumption:', error);
      throw error;
    }
  }

  /**
   * Get recent activity feed (sales, indents, GRNs, etc.).
   */
  static async getRecentActivity(
    storeId: string,
    limit: number = 20,
    institutionId?: string
  ): Promise<ImsRecentActivity[]> {
    try {
      const activities: ImsRecentActivity[] = [];

      const scopeFilter = (q: any) => {
        if (storeId) return q.eq('store_id', storeId);
        if (institutionId) return q.eq('institution_id', institutionId);
        return q;
      };

      // Fetch recent events in parallel
      const [salesResult, indentsResult, grnsResult] = await Promise.all([
        scopeFilter(
          this.supabase
            .from('ims_sales')
            .select('id, sale_number, total_amount, status, created_at, cashier:profiles!cashier_id(full_name)')
        )
          .order('created_at', { ascending: false })
          .limit(limit),

        scopeFilter(
          this.supabase
            .from('ims_indent_requests')
            .select('id, indent_number, status, purpose, created_at, requested_by_profile:profiles!requested_by(full_name)')
        )
          .order('created_at', { ascending: false })
          .limit(limit),

        scopeFilter(
          this.supabase
            .from('ims_goods_received_notes')
            .select('id, grn_number, status, created_at, received_by_profile:profiles!received_by(full_name)')
        )
          .order('created_at', { ascending: false })
          .limit(limit),
      ]);

      // Map sales
      for (const sale of salesResult.data || []) {
        activities.push({
          id: sale.id,
          type: 'sale',
          title: `Sale ${sale.sale_number}`,
          description: `${sale.status === 'completed' ? 'Completed' : 'Cancelled'} sale of RM ${(sale.total_amount || 0).toFixed(2)}`,
          timestamp: sale.created_at,
          user_name: (sale.cashier as any)?.full_name || undefined,
        });
      }

      // Map indents
      for (const indent of indentsResult.data || []) {
        activities.push({
          id: indent.id,
          type: 'indent',
          title: `Indent ${indent.indent_number}`,
          description: `${indent.status.replace(/_/g, ' ')} - ${indent.purpose}`,
          timestamp: indent.created_at,
          user_name: (indent.requested_by_profile as any)?.full_name || undefined,
        });
      }

      // Map GRNs
      for (const grn of grnsResult.data || []) {
        activities.push({
          id: grn.id,
          type: 'grn',
          title: `GRN ${grn.grn_number}`,
          description: `Goods received - ${grn.status.replace(/_/g, ' ')}`,
          timestamp: grn.created_at,
          user_name: (grn.received_by_profile as any)?.full_name || undefined,
        });
      }

      // Sort by timestamp descending and limit
      activities.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return activities.slice(0, limit);
    } catch (error) {
      console.error('[ImsReportsService] Error in getRecentActivity:', error);
      throw error;
    }
  }

  /**
   * Get UPI QR payment audit report for bank reconciliation.
   * Returns sales where upi_qr_amount > 0 within a date range.
   */
  static async getUpiAuditReport(
    storeId: string,
    dateFrom: string,
    dateTo: string,
    institutionId?: string
  ): Promise<{
    transactions: Array<{
      id: string;
      sale_number: string;
      upi_qr_amount: number;
      upi_qr_transaction_ref: string | null;
      customer_name: string | null;
      cashier_name: string;
      status: string;
      created_at: string;
    }>;
    summary: {
      total_upi_amount: number;
      transaction_count: number;
      avg_amount: number;
    };
  }> {
    try {
      let query = this.supabase
        .from('ims_sales')
        .select(
          `id, sale_number, upi_qr_amount, upi_qr_transaction_ref,
           customer_name, status, created_at,
           cashier:profiles!cashier_id(full_name)`
        )
        .gt('upi_qr_amount', 0)
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo)
        .order('created_at', { ascending: false });

      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const transactions = (data || []).map((row: any) => ({
        id: row.id,
        sale_number: row.sale_number,
        upi_qr_amount: row.upi_qr_amount,
        upi_qr_transaction_ref: row.upi_qr_transaction_ref,
        customer_name: row.customer_name,
        cashier_name: row.cashier?.full_name || 'N/A',
        status: row.status,
        created_at: row.created_at,
      }));

      const totalAmount = transactions.reduce((sum, t) => sum + t.upi_qr_amount, 0);

      return {
        transactions,
        summary: {
          total_upi_amount: totalAmount,
          transaction_count: transactions.length,
          avg_amount: transactions.length > 0 ? totalAmount / transactions.length : 0,
        },
      };
    } catch (error) {
      console.error('[ImsReportsService] Error in getUpiAuditReport:', error);
      throw error;
    }
  }

  /**
   * Get alert summary (out-of-stock, low stock, expiring, expired).
   */
  static async getAlertSummary(storeId: string, institutionId?: string): Promise<ImsAlertSummary> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);

      const applyScope = (q: any) => {
        if (storeId) return q.eq('store_id', storeId);
        if (institutionId) return q.eq('institution_id', institutionId);
        return q;
      };

      const [stockResult, expiringResult, expiredResult] = await Promise.all([
        // Stock with item reorder levels
        applyScope(
          this.supabase
            .from('ims_stock_summary')
            .select('current_quantity, item:ims_items(reorder_level)')
        ),

        // Expiring within 30 days (but not yet expired)
        applyScope(
          this.supabase
            .from('ims_stock_batches')
            .select('id', { count: 'exact', head: true })
        )
          .not('expiry_date', 'is', null)
          .gt('expiry_date', today)
          .lte('expiry_date', thirtyDays.toISOString().split('T')[0])
          .gt('quantity', 0),

        // Already expired
        applyScope(
          this.supabase
            .from('ims_stock_batches')
            .select('id', { count: 'exact', head: true })
        )
          .not('expiry_date', 'is', null)
          .lte('expiry_date', today)
          .gt('quantity', 0),
      ]);

      let outOfStock = 0;
      let lowStock = 0;

      for (const s of stockResult.data || []) {
        const reorderLevel = (s.item as any)?.reorder_level || 0;
        if (s.current_quantity <= 0) {
          outOfStock++;
        } else if (s.current_quantity <= reorderLevel) {
          lowStock++;
        }
      }

      return {
        out_of_stock: outOfStock,
        low_stock: lowStock,
        expiring_soon: expiringResult.count || 0,
        expired: expiredResult.count || 0,
      };
    } catch (error) {
      console.error('[ImsReportsService] Error in getAlertSummary:', error);
      throw error;
    }
  }
}
