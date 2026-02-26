// lib/services/ims/sales-service.ts
// Updated: 2026-02-21 — Multi-store support (store_id as primary scope),
// optimistic stock validation, new sale number format (PREFIX-YYMMDD-XXXX).

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ImsStockAdjustmentService } from './stock-adjustment-service';
import type {
  ImsSale,
  ImsSaleWithItems,
  ImsSaleFilters,
  ImsSellableItem,
  CreateImsSaleDto,
  ImsSalesSummary,
  ImsCartItem,
} from '@/types/ims';

export class ImsSalesService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List sales with cashier join, filtering, and pagination.
   */
  static async getSales(filters: ImsSaleFilters = {}): Promise<{
    data: ImsSale[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_sales')
        .select(
          `*,
           cashier:profiles!cashier_id(full_name)`,
          { count: 'exact' }
        );

      if (filters.search) {
        query = query.or(
          `sale_number.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%`
        );
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.payment_method) {
        query = query.eq('payment_method', filters.payment_method);
      }

      if (filters.customer_type) {
        query = query.eq('customer_type', filters.customer_type);
      }

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

      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        data: (data || []) as ImsSale[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsSalesService] Error in getSales:', errDetail, error);
      throw error;
    }
  }

  /**
   * Get a single sale with all items.
   */
  static async getSale(id: string, institutionId?: string): Promise<ImsSaleWithItems> {
    try {
      let query = this.supabase
        .from('ims_sales')
        .select(
          `*,
           cashier:profiles!cashier_id(full_name)`
        )
        .eq('id', id);

      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data: sale, error: saleError } = await query.single();

      if (saleError) throw saleError;

      const { data: items, error: itemsError } = await this.supabase
        .from('ims_sale_items')
        .select(
          `*,
           item:ims_items(id,name,code)`
        )
        .eq('sale_id', id)
        .order('id', { ascending: true });

      if (itemsError) throw itemsError;

      return {
        ...sale,
        items: items || [],
      } as ImsSaleWithItems;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsSalesService] Error in getSale:', errDetail, error);
      throw error;
    }
  }

  /**
   * Get items available for sale (sellable, in-stock items).
   * Now scoped by store_id with institution_id fallback.
   */
  static async getSellableItems(
    storeId: string,
    institutionId?: string
  ): Promise<ImsSellableItem[]> {
    try {
      let query = this.supabase
        .from('ims_items')
        .select(
          `id, name, code, selling_price, cost_price,
           base_unit:ims_units!ims_items_base_unit_id_fkey(abbreviation),
           category:ims_item_categories(name),
           stock:ims_stock_summary(available_quantity)`
        )
        .eq('is_active', true)
        .eq('is_sellable_to_students', true);

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        selling_price: item.selling_price,
        cost_price: item.cost_price,
        available_quantity: item.stock?.[0]?.available_quantity || item.stock?.available_quantity || 0,
        unit_abbreviation: item.base_unit?.abbreviation || '',
        category_name: item.category?.name || '',
      })) as ImsSellableItem[];
    } catch (error) {
      console.error('[ImsSalesService] Error in getSellableItems:', error);
      throw error;
    }
  }

  /**
   * Optimistic stock validation — checks if all cart items have
   * sufficient stock at the moment of checkout.
   * Returns list of items with insufficient stock (empty = all OK).
   */
  static async validateStock(
    items: Array<{ item_id: string; quantity: number; name?: string }>,
    storeId: string
  ): Promise<string[]> {
    try {
      const itemIds = items.map((i) => i.item_id);

      const { data: stockRows, error } = await this.supabase
        .from('ims_stock_summary')
        .select('item_id, available_quantity')
        .in('item_id', itemIds)
        .eq('store_id', storeId);

      if (error) throw error;

      const stockMap = new Map<string, number>(
        (stockRows || []).map((s: any) => [s.item_id, s.available_quantity] as [string, number])
      );

      const insufficient: string[] = [];
      for (const item of items) {
        const available = stockMap.get(item.item_id) ?? 0;
        if (item.quantity > available) {
          insufficient.push(
            `${item.name || item.item_id}: need ${item.quantity}, only ${available} available`
          );
        }
      }

      return insufficient;
    } catch (error) {
      console.error('[ImsSalesService] Error in validateStock:', error);
      throw error;
    }
  }

  /**
   * Create a sale (header + items), deduct stock for each item.
   * Uses store_id for all stock operations.
   */
  static async createSale(
    data: CreateImsSaleDto,
    userId: string
  ): Promise<ImsSale> {
    try {
      // Validate inputs before processing
      if (!data.items || data.items.length === 0) {
        throw new Error('Sale must contain at least one item');
      }
      for (const item of data.items) {
        if (item.quantity <= 0) throw new Error(`Item ${item.item_id}: quantity must be > 0`);
        if (item.unit_price < 0) throw new Error(`Item ${item.item_id}: unit_price must be >= 0`);
        if (item.cost_price < 0) throw new Error(`Item ${item.item_id}: cost_price must be >= 0`);
        const dp = item.discount_percent ?? 0;
        if (dp < 0 || dp > 100) throw new Error(`Item ${item.item_id}: discount_percent must be 0-100`);
      }
      if ((data.additional_discount ?? 0) < 0) {
        throw new Error('additional_discount must be >= 0');
      }

      const storeId = data.store_id || null;
      const saleNumber = await this.generateSaleNumber(
        storeId,
        data.institution_id
      );

      // Calculate totals
      let subtotal = 0;
      let totalDiscount = 0;
      let totalTax = 0;
      let totalProfit = 0;

      const saleItemsData = data.items.map((item) => {
        const discountPercent = item.discount_percent || 0;
        // Keep full precision per line — round only at grand total
        const discountAmount = (item.unit_price * item.quantity * discountPercent) / 100;
        const itemTotal = item.unit_price * item.quantity - discountAmount;
        const itemProfit = (item.unit_price - item.cost_price) * item.quantity - discountAmount;

        subtotal += item.unit_price * item.quantity;
        totalDiscount += discountAmount;
        totalProfit += itemProfit;

        return {
          item_id: item.item_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost_price: item.cost_price,
          discount_percent: discountPercent,
          discount_amount: discountAmount,
          tax_percent: 0,
          tax_amount: 0,
          total: itemTotal,
          profit: itemProfit,
        };
      });

      const additionalDiscount = data.additional_discount || 0;
      totalDiscount += additionalDiscount;

      // Round once at the final payable amount — avoids accumulated rounding errors
      const totalAmount = Math.round((subtotal - totalDiscount) * 100) / 100;
      totalProfit -= additionalDiscount;

      // Insert sale header
      const { data: sale, error: saleError } = await this.supabase
        .from('ims_sales')
        .insert({
          sale_number: saleNumber,
          customer_type: data.customer_type,
          customer_name: data.customer_name || null,
          customer_id: data.customer_id || null,
          payment_method: data.payment_method,
          cash_amount: data.cash_amount || 0,
          gpay_amount: data.gpay_amount || 0,
          card_amount: data.card_amount || 0,
          gpay_transaction_id: data.gpay_transaction_id || null,
          upi_qr_amount: data.upi_qr_amount || 0,
          upi_qr_transaction_ref: data.upi_qr_transaction_ref || null,
          subtotal,
          discount_amount: totalDiscount,
          tax_amount: totalTax,
          total_amount: totalAmount,
          profit_amount: totalProfit,
          status: 'completed',
          cashier_id: userId,
          institution_id: data.institution_id,
          store_id: storeId,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      // Insert sale items
      const saleItems = saleItemsData.map((item) => ({
        ...item,
        sale_id: sale.id,
        batch_id: null,
      }));

      const { error: itemsError } = await this.supabase
        .from('ims_sale_items')
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Deduct stock — use store_id for scoping
      for (const item of data.items) {
        let stockQuery = this.supabase
          .from('ims_stock_summary')
          .select('id, current_quantity, available_quantity, total_value')
          .eq('item_id', item.item_id);

        if (storeId) {
          stockQuery = stockQuery.eq('store_id', storeId);
        } else {
          stockQuery = stockQuery.eq('institution_id', data.institution_id);
        }

        const { data: stock } = await stockQuery.maybeSingle();

        if (stock) {
          const deductValue = item.cost_price * item.quantity;
          const { error: stockError } = await this.supabase
            .from('ims_stock_summary')
            .update({
              current_quantity: stock.current_quantity - item.quantity,
              available_quantity: stock.available_quantity - item.quantity,
              total_value: stock.total_value - deductValue,
              updated_at: new Date().toISOString(),
            })
            .eq('id', stock.id);
          if (stockError) {
            throw new Error(`Stock deduction failed for item ${item.item_id}: ${stockError.message}`);
          }
        } else {
          console.warn('[ImsSalesService] No stock row found for item:', item.item_id, '— skipping deduction');
        }
      }

      // Record financial transaction
      const { error: finError } = await this.supabase.from('ims_financial_transactions').insert({
        transaction_type: 'sale',
        reference_id: sale.id,
        reference_type: 'sale',
        amount: totalAmount,
        description: `Sale ${saleNumber}`,
        created_by: userId,
        institution_id: data.institution_id,
        store_id: storeId,
      });
      if (finError) {
        console.error('[ImsSalesService] Financial transaction insert failed:', finError);
      }

      return sale as ImsSale;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsSalesService] Error in createSale:', errDetail, error);
      throw error;
    }
  }

  /**
   * Cancel a sale. Stock behavior depends on itemsReturned:
   * - true (default): restore stock to inventory (existing behavior)
   * - false: do NOT restore stock; create write-off adjustments instead
   */
  static async cancelSale(
    id: string,
    reason: string,
    itemsReturned = true
  ): Promise<ImsSale> {
    try {
      const { data: sale, error: saleError } = await this.supabase
        .from('ims_sales')
        .select('*, institution_id, store_id, cashier_id')
        .eq('id', id)
        .single();

      if (saleError) throw saleError;

      if (sale.status === 'cancelled') {
        throw new Error('Sale is already cancelled');
      }

      const { data: saleItems, error: itemsError } = await this.supabase
        .from('ims_sale_items')
        .select('item_id, quantity, cost_price')
        .eq('sale_id', id);

      if (itemsError) throw itemsError;

      const { data: updatedSale, error: updateError } = await this.supabase
        .from('ims_sales')
        .update({
          status: 'cancelled',
          cancellation_reason: reason,
          items_returned: itemsReturned,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      if (itemsReturned) {
        // Restore stock — existing behavior
        for (const item of saleItems || []) {
          let stockQuery = this.supabase
            .from('ims_stock_summary')
            .select('id, current_quantity, available_quantity, total_value')
            .eq('item_id', item.item_id);

          if (sale.store_id) {
            stockQuery = stockQuery.eq('store_id', sale.store_id);
          } else {
            stockQuery = stockQuery.eq('institution_id', sale.institution_id);
          }

          const { data: stock } = await stockQuery.maybeSingle();

          if (stock) {
            const restoreValue = item.cost_price * item.quantity;
            await this.supabase
              .from('ims_stock_summary')
              .update({
                current_quantity: stock.current_quantity + item.quantity,
                available_quantity: stock.available_quantity + item.quantity,
                total_value: stock.total_value + restoreValue,
                updated_at: new Date().toISOString(),
              })
              .eq('id', stock.id);
          }
        }
      } else {
        // Items NOT returned — create write-off adjustments
        const writeOffErrors: string[] = [];
        for (const item of saleItems || []) {
          try {
            await ImsStockAdjustmentService.createAdjustment(
              {
                item_id: item.item_id,
                adjustment_type: 'write_off',
                quantity: item.quantity,
                reason: `Write-off from cancelled sale ${sale.sale_number || id} — items not returned`,
                institution_id: sale.institution_id,
                store_id: sale.store_id || undefined,
              },
              sale.cashier_id
            );
          } catch (adjError) {
            writeOffErrors.push(item.item_id);
            console.error(
              '[ImsSalesService] Write-off adjustment failed for item:',
              item.item_id,
              adjError
            );
          }
        }
        if (writeOffErrors.length > 0) {
          console.warn(
            '[ImsSalesService] Write-off incomplete for cancelled sale',
            id,
            '— items:',
            writeOffErrors.join(', ')
          );
        }
      }

      return updatedSale as ImsSale;
    } catch (error) {
      console.error('[ImsSalesService] Error in cancelSale:', error);
      throw error;
    }
  }

  /**
   * Get a summary of sales for a specific date.
   */
  static async getDailySalesSummary(
    storeId: string,
    date: string,
    institutionId?: string
  ): Promise<ImsSalesSummary> {
    try {
      const dayStart = `${date}T00:00:00.000Z`;
      const dayEnd = `${date}T23:59:59.999Z`;

      let query = this.supabase
        .from('ims_sales')
        .select('total_amount, profit_amount, payment_method, cash_amount, gpay_amount, card_amount')
        .eq('status', 'completed')
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd);

      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const sales = data || [];
      const totalRevenue = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const totalProfit = sales.reduce((sum, s) => sum + (s.profit_amount || 0), 0);
      const cashTotal = sales.reduce((sum, s) => sum + (s.cash_amount || 0), 0);
      const digitalTotal = sales.reduce(
        (sum, s) => sum + (s.gpay_amount || 0) + (s.card_amount || 0),
        0
      );

      return {
        total_sales: sales.length,
        total_revenue: totalRevenue,
        total_profit: totalProfit,
        average_sale_value: sales.length > 0 ? totalRevenue / sales.length : 0,
        cash_total: cashTotal,
        digital_total: digitalTotal,
      };
    } catch (error) {
      console.error('[ImsSalesService] Error in getDailySalesSummary:', error);
      throw error;
    }
  }

  /**
   * Generate the next sequential sale number.
   * Format: PREFIX-YYMMDD-XXXX (e.g., INV-260224-0001)
   *
   * Uses atomic counter (ims_next_sale_number RPC) when storeId is available,
   * preventing duplicate numbers under concurrent cashier usage.
   * Falls back to COUNT(*)+1 for legacy paths without storeId.
   */
  private static async generateSaleNumber(
    storeId: string | null,
    institutionId: string
  ): Promise<string> {
    try {
      // Get store prefix
      let prefix = 'INV';
      if (storeId) {
        const { data: store } = await this.supabase
          .from('ims_stores')
          .select('sale_number_prefix')
          .eq('id', storeId)
          .maybeSingle();

        if (store?.sale_number_prefix) {
          prefix = store.sale_number_prefix;
        }
      }

      const now = new Date();
      const yy = String(now.getFullYear()).slice(-2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const dateStr = `${yy}${mm}${dd}`;

      let nextNumber: number;

      if (storeId) {
        // Atomic counter via RPC — race-condition-free
        const { data: nextNum, error: rpcError } = await this.supabase.rpc(
          'ims_next_sale_number',
          { p_store_id: storeId, p_date: now.toISOString().split('T')[0] }
        );

        if (rpcError || nextNum == null) {
          console.warn('[ImsSalesService] Atomic counter failed, falling back to COUNT:', rpcError);
          nextNumber = await this.fallbackSaleCount(storeId, institutionId, now);
        } else {
          nextNumber = nextNum;
        }
      } else {
        // Legacy fallback for paths without storeId
        nextNumber = await this.fallbackSaleCount(storeId, institutionId, now);
      }

      return `${prefix}-${dateStr}-${String(nextNumber).padStart(4, '0')}`;
    } catch (error) {
      console.error('[ImsSalesService] Error generating sale number:', error);
      const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
      return `INV-${yymmdd}-${String(Date.now()).slice(-4)}`;
    }
  }

  /**
   * Fallback sale count using COUNT(*)+1 for legacy paths without storeId.
   */
  private static async fallbackSaleCount(
    storeId: string | null,
    institutionId: string,
    now: Date
  ): Promise<number> {
    const dayStart = `${now.toISOString().split('T')[0]}T00:00:00.000Z`;

    let countQuery = this.supabase
      .from('ims_sales')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', dayStart);

    if (storeId) {
      countQuery = countQuery.eq('store_id', storeId);
    } else {
      countQuery = countQuery.eq('institution_id', institutionId);
    }

    const { count } = await countQuery;
    return (count || 0) + 1;
  }
}
