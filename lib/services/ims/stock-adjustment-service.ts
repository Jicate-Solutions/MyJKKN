// lib/services/ims/stock-adjustment-service.ts
// Updated: 2026-02-21 — Multi-store support (store_id as primary scope)

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsFinancialTransaction,
  ImsAdjustmentType,
} from '@/types/ims';

export class ImsStockAdjustmentService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List adjustments (financial transactions where reference_type = 'adjustment').
   */
  static async getAdjustments(filters: {
    institution_id?: string;
    store_id?: string;
    adjustment_type?: string;
    page?: number;
    limit?: number;
  }): Promise<{
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
        )
        .eq('reference_type', 'adjustment');

      // Primary: store_id; Fallback: institution_id
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.adjustment_type) {
        query = query.eq('adjustment_type', filters.adjustment_type);
      }

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
      console.error('[ImsStockAdjustmentService] Error in getAdjustments:', error);
      throw error;
    }
  }

  /**
   * Create a stock adjustment. Updates both the financial transactions table
   * and the stock summary.
   */
  static async createAdjustment(
    data: {
      item_id: string;
      adjustment_type: string;
      quantity: number;
      reason: string;
      department_id?: string;
      institution_id: string;
      store_id?: string;
    },
    userId: string
  ): Promise<ImsFinancialTransaction> {
    try {
      const isNegative = [
        'damage',
        'expiry',
        'theft',
        'return_to_supplier',
        'write_off',
      ].includes(data.adjustment_type);

      const quantityDelta = isNegative ? -Math.abs(data.quantity) : Math.abs(data.quantity);

      const { data: item, error: itemError } = await this.supabase
        .from('ims_items')
        .select('cost_price, name, code')
        .eq('id', data.item_id)
        .single();

      if (itemError) throw itemError;

      const adjustmentValue = Math.abs(data.quantity) * (item.cost_price || 0);

      // Record financial transaction
      const { data: transaction, error: txError } = await this.supabase
        .from('ims_financial_transactions')
        .insert({
          transaction_type: 'adjustment',
          reference_id: null,
          reference_type: 'adjustment',
          amount: adjustmentValue,
          description: `${data.adjustment_type.replace(/_/g, ' ')} - ${item.name} (${item.code}): ${data.reason}`,
          department_id: data.department_id || null,
          item_id: data.item_id,
          quantity: data.quantity,
          created_by: userId,
          institution_id: data.institution_id,
          store_id: data.store_id || null,
        })
        .select()
        .single();

      if (txError) throw txError;

      // Update stock summary — use store_id for scoping
      let stockQuery = this.supabase
        .from('ims_stock_summary')
        .select('id, current_quantity, available_quantity, total_value')
        .eq('item_id', data.item_id);

      if (data.store_id) {
        stockQuery = stockQuery.eq('store_id', data.store_id);
      } else {
        stockQuery = stockQuery.eq('institution_id', data.institution_id);
      }

      const { data: stock, error: stockError } = await stockQuery.maybeSingle();

      if (stockError) throw stockError;

      if (stock) {
        const newQuantity = stock.current_quantity + quantityDelta;
        const newAvailable = stock.available_quantity + quantityDelta;
        const valueChange = isNegative ? -adjustmentValue : adjustmentValue;

        await this.supabase
          .from('ims_stock_summary')
          .update({
            current_quantity: Math.max(0, newQuantity),
            available_quantity: Math.max(0, newAvailable),
            total_value: Math.max(0, stock.total_value + valueChange),
            updated_at: new Date().toISOString(),
          })
          .eq('id', stock.id);
      } else if (!isNegative) {
        await this.supabase.from('ims_stock_summary').insert({
          item_id: data.item_id,
          current_quantity: Math.abs(data.quantity),
          reserved_quantity: 0,
          available_quantity: Math.abs(data.quantity),
          total_value: adjustmentValue,
          institution_id: data.institution_id,
          store_id: data.store_id || null,
        });
      }

      return transaction as ImsFinancialTransaction;
    } catch (error) {
      console.error('[ImsStockAdjustmentService] Error in createAdjustment:', error);
      throw error;
    }
  }

  /**
   * Get a summary of adjustments by type.
   */
  static async getAdjustmentSummary(
    storeId: string,
    institutionId?: string
  ): Promise<{
    total_adjustments: number;
    total_value: number;
    by_type: Array<{ type: string; count: number; value: number }>;
  }> {
    try {
      let query = this.supabase
        .from('ims_financial_transactions')
        .select('amount, description')
        .eq('reference_type', 'adjustment');

      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const transactions = data || [];
      const totalValue = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

      const typeMap = new Map<string, { count: number; value: number }>();

      for (const t of transactions) {
        const typeMatch = t.description?.match(/^([^-]+)\s*-/);
        const typeName = typeMatch ? typeMatch[1].trim() : 'unknown';

        const existing = typeMap.get(typeName) || { count: 0, value: 0 };
        existing.count++;
        existing.value += t.amount || 0;
        typeMap.set(typeName, existing);
      }

      return {
        total_adjustments: transactions.length,
        total_value: totalValue,
        by_type: Array.from(typeMap.entries()).map(([type, info]) => ({
          type,
          count: info.count,
          value: info.value,
        })),
      };
    } catch (error) {
      console.error('[ImsStockAdjustmentService] Error in getAdjustmentSummary:', error);
      throw error;
    }
  }
}
