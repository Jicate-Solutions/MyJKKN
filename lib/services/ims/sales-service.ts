// lib/services/ims/sales-service.ts
// Updated: 2026-02-21 — Multi-store support (store_id as primary scope),
// optimistic stock validation, new sale number format (PREFIX-YYMMDD-XXXX).
// Updated: 2026-04-28 — Phase F: activity log integration on sale create.
// Updated: 2026-07-30 — POS go-live. createSale/cancelSale now delegate to the
//   ims_pos_checkout / ims_pos_cancel_sale RPCs so the whole sale is one
//   transaction (see 20260730120000_ims_pos_checkout_engine.sql), and every
//   "today" window is anchored to the IST business day instead of UTC.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { istDayBounds } from '@/lib/utils/date-format';
import { ImsStockAdjustmentService } from './stock-adjustment-service';
import { ImsActivityLogService } from './activity-log-service';
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
        // PostgREST parses .or() as a comma-separated expression list, so an
        // unescaped `,` `(` or `)` in the search box does not search for those
        // characters — it rewrites the filter. Strip the structural characters and
        // the PostgREST wildcards, then wrap in quotes so spaces survive.
        const term = filters.search.replace(/[,()*"\\]/g, '').trim();
        if (term) {
          query = query.or(
            `sale_number.ilike."%${term}%",customer_name.ilike."%${term}%"`
          );
        }
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
   * The gateway payment behind a sale, or null for a cash/manual sale.
   *
   * Read through the caller's session, so the payment table's institution-scoped
   * RLS decides visibility — a sale you can open is a payment you can see.
   *
   * Note what is NOT selected: nothing from razorpay_accounts. That table is
   * service_role-only, so "paid to" is the denormalised publishable key id on the
   * payment row rather than a join.
   */
  static async getGatewayPaymentForSale(saleId: string): Promise<{
    id: string;
    status: string;
    amount: number;
    captured_amount_paise: number | null;
    transaction_ref: string;
    gateway_method: string | null;
    payer_vpa: string | null;
    payer_contact: string | null;
    payer_email: string | null;
    payer_bank: string | null;
    payer_wallet: string | null;
    bank_rrn: string | null;
    upi_transaction_id: string | null;
    razorpay_payment_id: string | null;
    razorpay_order_id: string | null;
    razorpay_key_id: string | null;
    gateway_fee_paise: number | null;
    late_credit: boolean;
    paid_at: string | null;
  } | null> {
    try {
      const { data, error } = await this.supabase
        .from('ims_gateway_payments')
        .select(
          `id, status, amount, captured_amount_paise, transaction_ref,
           gateway_method, payer_vpa, payer_contact, payer_email, payer_bank,
           payer_wallet, bank_rrn, upi_transaction_id, razorpay_payment_id,
           razorpay_order_id, razorpay_key_id, gateway_fee_paise, late_credit, paid_at`
        )
        .eq('sale_id', saleId)
        .maybeSingle();

      if (error) throw error;
      return data ?? null;
    } catch (error) {
      console.error('[ImsSalesService] Error in getGatewayPaymentForSale:', error);
      // A missing payment panel must not take the sale page down with it.
      return null;
    }
  }

  /**
   * Get items available for sale at a store.
   *
   * The catalogue row is institution-wide (ims_items is UNIQUE(institution_id, code)),
   * but WHICH of those items this counter sells is per-store (ims_store_items), and
   * so is the quantity (ims_stock_summary).
   */
  static async getSellableItems(
    storeId: string,
    institutionId?: string
  ): Promise<ImsSellableItem[]> {
    // No store, no counter. Previously an empty storeId still returned the whole
    // institution's sellable items with every quantity at 0 — a till full of
    // things that cannot be sold.
    if (!storeId) return [];

    try {
      // What is on THIS counter, not what is on some counter in this institution.
      //
      // This used to read ims_items.is_sellable_to_students, which is an
      // institution-wide column: flagging an item at the student store put it on
      // the warehouse's and the patient store's tills too. The flag now lives on
      // the store's listing, so the inner join answers both questions at once —
      // does this store carry it, and does this store sell it.
      let query = this.supabase
        .from('ims_items')
        .select(
          `id, name, code, selling_price, cost_price, image_url,
           base_unit:ims_units!ims_items_base_unit_id_fkey(abbreviation),
           category:ims_item_categories(name),
           store_link:ims_store_items!inner(store_id)`
        )
        .eq('is_active', true)
        .eq('store_link.store_id', storeId)
        .eq('store_link.is_sellable_to_students', true)
        .eq('store_link.is_active', true);

      // Belt and braces: the listing already implies the institution, but RLS and
      // the caller both expect the filter, and it keeps the plan on the index.
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const items = data || [];
      if (items.length === 0) return [];

      // Quantities are fetched separately rather than embedded. An embedded
      // ims_stock_summary cannot be filtered by store, so once an item is
      // stocked in two stores of the same institution the embed returns both
      // rows and picking [0] shows an ARBITRARY store's quantity at the POS
      // counter. Transfers make that a real possibility, so read the active
      // store's row explicitly — same shape as validateStock() below.
      const stockMap = new Map<string, number>();
      if (storeId) {
        const { data: stockRows } = await this.supabase
          .from('ims_stock_summary')
          .select('item_id, available_quantity')
          .in('item_id', items.map((i: any) => i.id))
          .eq('store_id', storeId);
        for (const row of stockRows || []) {
          stockMap.set(row.item_id, row.available_quantity ?? 0);
        }
      }

      return items.map((item: any) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        selling_price: item.selling_price,
        cost_price: item.cost_price,
        available_quantity: stockMap.get(item.id) ?? 0,
        unit_abbreviation: item.base_unit?.abbreviation || '',
        category_name: item.category?.name || '',
        image_url: item.image_url || null,
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
   * Create a sale.
   *
   * Everything that must not half-happen — the header, the lines, the
   * ims_stock_summary decrement, the FEFO batch deduction, the
   * ims_stock_movements ledger and the financial transaction — is delegated to
   * the ims_pos_checkout RPC so it runs in ONE database transaction.
   *
   * This replaced ~150 lines of client-side orchestration that had four
   * structural problems (see 20260730120000_ims_pos_checkout_engine.sql):
   *   - the stock decrement was a read-modify-write, so two cashiers selling the
   *     same item silently lost one of the deductions, and nothing stopped the
   *     quantity going negative;
   *   - nothing was transactional, so a failure mid-loop left a
   *     status='completed' sale with only some lines deducted;
   *   - it called ims_deduct_batch_fefo, which does not exist, and never read
   *     the error — so batch quantities were never decremented at all;
   *   - totals and tendered amounts were whatever the browser sent.
   *
   * The two steps that genuinely SHOULD survive a failure stay out here: the UPI
   * back-link and the activity log are audit conveniences, and a completed sale
   * must never be rolled back because one of them failed.
   */
  static async createSale(
    data: CreateImsSaleDto,
    userId: string
  ): Promise<ImsSale> {
    try {
      // Cheap client-side pre-checks so the cashier gets an instant message for
      // obvious mistakes. The RPC re-validates all of this server-side — these
      // are for latency, not for safety.
      if (!data.items || data.items.length === 0) {
        throw new Error('Sale must contain at least one item');
      }
      if (!data.store_id) {
        throw new Error('No store selected — pick a store before billing');
      }

      const { data: result, error: rpcError } = await this.supabase.rpc('ims_pos_checkout', {
        p_store_id:               data.store_id,
        p_institution_id:         data.institution_id,
        p_customer_type:          data.customer_type,
        p_customer_name:          data.customer_name || null,
        p_customer_id:            data.customer_id || null,
        p_payment_method:         data.payment_method,
        p_cash_amount:            data.cash_amount || 0,
        p_gpay_amount:            data.gpay_amount || 0,
        p_card_amount:            data.card_amount || 0,
        p_upi_qr_amount:          data.upi_qr_amount || 0,
        p_gpay_transaction_id:    data.gpay_transaction_id || null,
        p_upi_qr_transaction_ref: data.upi_qr_transaction_ref || null,
        p_additional_discount:    data.additional_discount || 0,
        p_lines: data.items.map((item) => ({
          item_id:          item.item_id,
          quantity:         item.quantity,
          unit_price:       item.unit_price,
          cost_price:       item.cost_price,
          discount_percent: item.discount_percent ?? 0,
        })),
      });

      // The error MUST be read. The bug this file used to carry was a bare
      // `await supabase.rpc(...)` — supabase-js returns {data, error} and never
      // throws, so an un-destructured call swallows every failure silently.
      if (rpcError) {
        throw new Error(rpcError.message || 'Checkout failed');
      }
      if (!result?.sale_id) {
        throw new Error('Checkout returned no sale — nothing was recorded');
      }

      // Re-read the committed row so callers keep receiving a full ImsSale
      // (the receipt builder and the success toast both rely on it).
      const { data: sale, error: readError } = await this.supabase
        .from('ims_sales')
        .select('*')
        .eq('id', result.sale_id)
        .single();

      if (readError) throw readError;

      const saleNumber: string = result.sale_number;

      // Back-link the UPI QR payment row to this sale (completes skill step 6).
      // At QR-generation time the payment row was created with sale_id = NULL,
      // because the sale did not exist yet. Now that we have `sale.id`, stamp it
      // onto ims_upi_qr_payments so the audit trail is two-way:
      //   sale.upi_qr_transaction_ref  ->  ims_upi_qr_payments.transaction_ref (forward, already works)
      //   ims_upi_qr_payments.sale_id  ->  ims_sales.id                        (reverse, this block)
      //
      // Design constraints (already verified):
      //  - Guard on `data.upi_qr_transaction_ref` (truthy), NOT payment_method ===
      //    'upi_qr', so a 'mixed' cash+UPI sale still links its UPI row.
      //  - Match the payment row by `transaction_ref === data.upi_qr_transaction_ref`.
      //  - RLS permits this client-side UPDATE (ims_upi_qr_payments policies are
      //    scoped through ims_stores to the caller's accessible institutions).
      //  - NON-FATAL: the sale and its stock deduction are already committed by the
      //    RPC and must never be undone over a missing audit pointer. Log and
      //    continue; do NOT throw. Also set updated_at.
      //
      if (data.upi_qr_transaction_ref) {
        const { error: linkError } = await this.supabase
          .from('ims_upi_qr_payments')
          .update({ sale_id: sale.id, updated_at: new Date().toISOString() })
          .eq('transaction_ref', data.upi_qr_transaction_ref);
        if (linkError) {
          console.error('[ImsSalesService] UPI QR sale_id back-link failed:', linkError);
        }
      }

      // Phase F: log to activity trail (POS audit)
      await ImsActivityLogService.log({
        entityType: 'sale',
        entityId: sale.id,
        institutionId: data.institution_id,
        action: 'raised',
        actorId: userId,
        notes: data.customer_name ? `Sale to ${data.customer_name}` : null,
        metadata: {
          sale_number: saleNumber,
          item_count: data.items.length,
          // Read back from the committed row rather than recomputed here, so the
          // audit trail can never disagree with what was actually billed.
          total_amount: sale.total_amount,
          payment_method: data.payment_method,
          customer_type: data.customer_type,
        },
      });

      return sale as ImsSale;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsSalesService] Error in createSale:', errDetail, error);
      throw error;
    }
  }

  /**
   * Cancel a sale. Stock behaviour depends on itemsReturned:
   * - true (default): restore stock, batch by batch
   * - false: leave stock deducted and raise write-off adjustments instead
   *
   * The restore runs inside the ims_pos_cancel_sale RPC, which replays this
   * sale's ims_stock_movements rows in reverse. That matters for two reasons the
   * old client-side loop got wrong: it never touched ims_stock_batches at all
   * (so every cancellation permanently inflated batch stock relative to summary
   * stock), and a failure part-way through left the sale marked cancelled with
   * only some lines restored — unrecoverable, because the 'already cancelled'
   * guard then blocked every retry.
   */
  static async cancelSale(
    id: string,
    reason: string,
    itemsReturned = true
  ): Promise<ImsSale> {
    try {
      // Read the header first: the write-off branch below needs the line items
      // and the original cashier, and both are gone from reach once the RPC has
      // flipped the status.
      const { data: sale, error: saleError } = await this.supabase
        .from('ims_sales')
        .select('*')
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

      // Status flip + stock/batch restore + reversing financial entry, atomically.
      const { error: rpcError } = await this.supabase.rpc('ims_pos_cancel_sale', {
        p_sale_id:        id,
        p_reason:         reason,
        p_items_returned: itemsReturned,
      });

      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to cancel the sale');
      }

      if (!itemsReturned) {
        // Items were NOT handed back, so the stock stays deducted and we record
        // WHY it left. Kept out of the RPC deliberately: createAdjustment has its
        // own numbering, audit trail and financial posting, and a failed write-off
        // must not undo a cancellation the cashier has already told the customer
        // about.
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

      // Read back the committed row rather than trusting a locally patched copy.
      const { data: updatedSale, error: readError } = await this.supabase
        .from('ims_sales')
        .select('*')
        .eq('id', id)
        .single();

      if (readError) throw readError;

      return updatedSale as ImsSale;
    } catch (error) {
      const errDetail = (error as any)?.message ?? (error as any)?.details ?? JSON.stringify(error);
      console.error('[ImsSalesService] Error in cancelSale:', errDetail, error);
      throw error;
    }
  }

  /**
   * Get a summary of sales for one IST business day.
   *
   * `date` is an IST calendar date (YYYY-MM-DD). The bounds are built with an
   * explicit +05:30 offset rather than `Z`: the previous version asked for
   * 00:00Z..23:59Z, which for an Indian store is 05:30 today to 05:30 tomorrow,
   * so an evening bill landed in the NEXT day's total and the first 5.5 hours of
   * each reported day belonged to the previous business day. Day-close figures
   * could not be tied to the cash drawer.
   */
  static async getDailySalesSummary(
    storeId: string,
    date: string,
    institutionId?: string
  ): Promise<ImsSalesSummary> {
    try {
      const { from: dayStart, to: dayEnd } = istDayBounds(date);

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

  // Sale-number generation moved into the ims_pos_checkout RPC (migration
  // 20260730120000). The old generateSaleNumber()/fallbackSaleCount() pair is gone
  // deliberately:
  //   - it allocated the number BEFORE the header insert, so any failure in
  //     between burnt a number and left a gap in the invoice sequence;
  //   - the printed YYMMDD came from the browser's LOCAL clock while the counter
  //     was keyed on the UTC date, so the two disagreed between 00:00 and 05:30 IST;
  //   - on any RPC hiccup it degraded to COUNT(*)+1, reintroducing exactly the
  //     race the atomic counter existed to remove — and since ims_sales.sale_number
  //     is UNIQUE, a collision blocked the cashier mid-sale with a 23505.
  // Inside the RPC the number is drawn in the same transaction as the sale, from
  // the server's IST business date, with no fallback needed: a failure rolls the
  // whole thing back, number included.
}
