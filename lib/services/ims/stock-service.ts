// lib/services/ims/stock-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsStockSummary,
  ImsStockBatch,
  ImsStockFilters,
  ImsBatchFilters,
  ImsLowStockItem,
  ImsReorderRow,
  CreateBatchDto,
  UpdateBatchDto,
} from '@/types/ims';

export class ImsStockService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * Get stock summary with item joins, filtering by low stock, category, and search.
   */
  static async getStockSummary(filters: ImsStockFilters = {}): Promise<{
    data: ImsStockSummary[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      // Search spans the joined item, so resolve matching item ids first.
      let searchItemIds: string[] | null = null;
      if (filters.search) {
        const { data: matchingItems } = await this.supabase
          .from('ims_items')
          .select('id')
          .or(
            `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
          );
        if (!matchingItems || matchingItems.length === 0) {
          return {
            data: [],
            metadata: {
              total: 0,
              page: filters.page || 1,
              limit: filters.limit || 20,
              totalPages: 0,
            },
          };
        }
        searchItemIds = matchingItems.map((i: { id: string }) => i.id);
      }

      // A fresh builder per request: the low-stock path below issues several.
      const buildQuery = () => {
        // Filtering on an embedded column only narrows the parent rows when the
        // embed is !inner; without it the category filter just nulls `item`.
        const itemEmbed = filters.category_id ? 'ims_items!inner' : 'ims_items';
        let q = this.supabase
          .from('ims_stock_summary')
          .select(
            `*,
             item:${itemEmbed}(
               id, name, code, reorder_level, max_stock_level, category_id,
               base_unit:ims_units!ims_items_base_unit_id_fkey(abbreviation),
               category:ims_item_categories(name)
             )`,
            { count: 'exact' }
          );

        // Primary: store_id; Fallback: institution_id
        if (filters.store_id) {
          q = q.eq('store_id', filters.store_id);
        } else if (filters.institution_id) {
          q = q.eq('institution_id', filters.institution_id);
        }
        if (filters.category_id) {
          q = q.eq('item.category_id', filters.category_id);
        }
        if (searchItemIds) {
          q = q.in('item_id', searchItemIds);
        }
        return q;
      };

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Low-stock crosses a join boundary (quantity vs item.reorder_level), so fetch
      // every row and filter here. PostgREST caps a response at 1000 rows, so read in
      // chunks rather than trusting one unbounded request.
      if (filters.low_stock_only) {
        const CHUNK = 1000;
        const allData: any[] = [];
        for (let offset = 0; ; offset += CHUNK) {
          const { data: chunk, error: chunkError } = await buildQuery()
            .order('id', { ascending: true })
            .range(offset, offset + CHUNK - 1);
          if (chunkError) throw chunkError;
          allData.push(...(chunk || []));
          if (!chunk || chunk.length < CHUNK) break;
        }

        // Same rule as ims_store_reorder_list: a configured reorder level, and what is
        // actually on the shelf at or below it.
        const filtered = allData
          .filter((s: any) => {
            const reorder = s.item?.reorder_level || 0;
            const onHand = s.available_quantity ?? s.current_quantity ?? 0;
            return s.item && reorder > 0 && onHand <= reorder;
          })
          .sort((a: any, b: any) => String(b.updated_at).localeCompare(String(a.updated_at)));
        const paginated = filtered.slice(from, from + limit);
        return {
          data: paginated as ImsStockSummary[],
          metadata: {
            total: filtered.length,
            page,
            limit,
            totalPages: Math.ceil(filtered.length / limit),
          },
        };
      }

      const { data, error, count } = await buildQuery()
        .range(from, to)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return {
        data: (data || []) as ImsStockSummary[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsStockService] Error in getStockSummary:', error);
      throw error;
    }
  }

  /**
   * List stock batches with item join.
   */
  static async getStockBatches(filters: ImsBatchFilters = {}): Promise<{
    data: ImsStockBatch[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_stock_batches')
        .select(
          '*, item:ims_items(id,name,code)',
          { count: 'exact' }
        );

      if (filters.item_id) {
        query = query.eq('item_id', filters.item_id);
      }

      if (filters.location_type) {
        query = query.eq('location_type', filters.location_type);
      }

      // Primary: store_id; Fallback: institution_id
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      if (filters.expiring_within_days) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + filters.expiring_within_days);
        query = query
          .not('expiry_date', 'is', null)
          .lte('expiry_date', futureDate.toISOString().split('T')[0]);
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
        data: (data || []) as ImsStockBatch[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsStockService] Error in getStockBatches:', error);
      throw error;
    }
  }

  /**
   * Get batches expiring within N days.
   */
  static async getExpiringBatches(
    days: number,
    institution_id: string,
    storeId?: string
  ): Promise<ImsStockBatch[]> {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      let query = this.supabase
        .from('ims_stock_batches')
        .select('*, item:ims_items(id,name,code)')
        .not('expiry_date', 'is', null);

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institution_id) {
        query = query.eq('institution_id', institution_id);
      }

      const { data, error } = await query
        .lte('expiry_date', futureDate.toISOString().split('T')[0])
        // quantity_available, NOT quantity: `quantity` is the as-received amount and
        // never moves, so a batch sold down to zero stayed on the expiring list with
        // its full opening quantity. quantity_available is the live shelf balance.
        .gt('quantity_available', 0)
        .order('expiry_date', { ascending: true });

      if (error) throw error;

      return (data || []) as ImsStockBatch[];
    } catch (error) {
      console.error('[ImsStockService] Error in getExpiringBatches:', error);
      throw error;
    }
  }

  /**
   * The store's reorder list: every active assortment item that is out of stock, at or
   * below its reorder level, or has no reorder level configured. Computed in the DB
   * (ims_store_reorder_list) so the dashboard, the reorder page and the request snapshot
   * all use one definition of "low stock", and never-stocked items count as zero.
   */
  static async getStoreReorderList(storeId: string): Promise<ImsReorderRow[]> {
    const { data, error } = await this.supabase.rpc('ims_store_reorder_list', {
      p_store_id: storeId,
    });
    if (error) throw error;
    // numeric columns arrive as strings from PostgREST.
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      on_hand: Number(r.on_hand ?? 0),
      reorder_level: Number(r.reorder_level ?? 0),
      max_stock_level: Number(r.max_stock_level ?? 0),
      suggested_quantity: r.suggested_quantity == null ? null : Number(r.suggested_quantity),
    })) as ImsReorderRow[];
  }

  /** Dashboard alert list — the reorder list minus items with no reorder level set. */
  static async getLowStockItems(storeId: string): Promise<ImsLowStockItem[]> {
    const rows = await this.getStoreReorderList(storeId);
    return rows
      .filter((r) => r.status !== 'unset_reorder_level')
      .map((r) => ({
        item_id: r.item_id,
        item_name: r.item_name,
        item_code: r.item_code ?? '',
        current_quantity: r.on_hand,
        reorder_level: r.reorder_level,
        unit_abbreviation: r.unit_abbreviation ?? '',
      }));
  }

  // ─── Opening Quantity ─────────────────────────────────────────────────────

  /**
   * Admin override: set opening_quantity on the stock-summary row for an item.
   *
   * This is a DIRECT column update — it does NOT create an adjustment record and
   * does NOT change current_quantity / available_quantity. It is the admin's way
   * of correcting the "as-entered" opening value displayed in the Items table.
   *
   * Resolves the stock-summary row via (item_id, store_id). If no summary row
   * exists yet (item was created without opening stock) a minimal row is inserted.
   *
   * @param itemId         UUID of the ims_items row
   * @param newValue       The new opening_quantity (must be >= 0)
   * @param storeId        UUID of the ims_stores row that scopes this summary
   * @param institutionId  UUID of the institution (required when inserting a new row)
   */
  static async updateOpeningQuantity(
    itemId: string,
    newValue: number,
    storeId: string,
    institutionId: string
  ): Promise<void> {
    if (newValue < 0) {
      throw new Error('Opening quantity cannot be negative');
    }

    try {
      const { data: existing, error: fetchError } = await this.supabase
        .from('ims_stock_summary')
        .select('id')
        .eq('item_id', itemId)
        .eq('store_id', storeId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        const { error: updateError } = await this.supabase
          .from('ims_stock_summary')
          .update({
            opening_quantity: newValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        // No summary row yet — create a minimal one (stock will be at 0 until a batch is added)
        const { error: insertError } = await this.supabase
          .from('ims_stock_summary')
          .insert({
            item_id: itemId,
            store_id: storeId,
            institution_id: institutionId,
            opening_quantity: newValue,
            current_quantity: 0,
            available_quantity: 0,
            reserved_quantity: 0,
            total_value: 0,
          });

        if (insertError) throw insertError;
      }
    } catch (error) {
      console.error('[ImsStockService] Error in updateOpeningQuantity:', error);
      throw error;
    }
  }

  // ─── Batch Management ──────────────────────────────────────────────────────

  /**
   * Get all batches for a specific item in a store, ordered FEFO.
   */
  static async getBatchesForItem(
    itemId: string,
    storeId: string
  ): Promise<ImsStockBatch[]> {
    try {
      const { data, error } = await this.supabase
        .from('ims_stock_batches')
        .select('*, item:ims_items(id,name,code), supplier:ims_suppliers(id,name)')
        .eq('item_id', itemId)
        .eq('store_id', storeId)
        .order('expiry_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as ImsStockBatch[];
    } catch (error) {
      console.error('[ImsStockService] Error in getBatchesForItem:', error);
      throw error;
    }
  }

  /**
   * Add a batch directly (bypasses GRN). Uses direct PostgREST table operations
   * instead of the ims_add_batch RPC to avoid Supabase JS client's empty-{} error
   * serialization gap with SECURITY DEFINER functions.
   * Auto-generates BTH-YYMMDD-XXXXX batch number if none provided.
   */
  static async addBatch(data: CreateBatchDto): Promise<string> {
    try {
      let batchNumber = data.batch_number?.trim() || '';

      // Auto-generate batch number via atomic counter RPC (this simpler RPC works fine)
      if (!batchNumber && data.store_id) {
        const today = new Date().toISOString().split('T')[0];
        const { data: nextNum, error: counterError } = await this.supabase.rpc(
          'ims_next_batch_number',
          { p_store_id: data.store_id, p_date: today }
        );
        if (counterError || nextNum == null) {
          // Fallback: timestamp-based number
          const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
          batchNumber = `BTH-${yymmdd}-${String(Date.now()).slice(-5)}`;
        } else {
          const yymmdd = today.replace(/-/g, '').slice(2);
          batchNumber = `BTH-${yymmdd}-${String(nextNum).padStart(5, '0')}`;
        }
      } else if (!batchNumber) {
        const yymmdd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        batchNumber = `BTH-${yymmdd}-${String(Date.now()).slice(-5)}`;
      }

      // Calculate derived values
      const gstRate    = data.gst_rate ?? 0;
      const totalValue = data.quantity * data.cost_price * (1 + gstRate / 100);

      // Step A: INSERT batch row directly via PostgREST (structured errors, no RPC gap)
      const { data: batchRow, error: batchError } = await this.supabase
        .from('ims_stock_batches')
        .insert({
          item_id:            data.item_id,
          batch_number:       batchNumber,
          quantity:           data.quantity,
          quantity_available: data.quantity,
          cost_price:         data.cost_price,
          gst_rate:           gstRate,
          total_value:        totalValue,
          entry_date:         data.entry_date,
          expiry_date:        data.expiry_date ?? null,
          supplier_id:        data.supplier_id ?? null,
          notes:              data.notes ?? null,
          location_type:      'central_store',
          store_id:           data.store_id ?? null,
          institution_id:     data.institution_id || null,  // coerce '' → null (UUID column)
        })
        .select('id')
        .single();

      if (batchError) {
        console.error('[ImsStockService] batchError raw:', JSON.stringify(batchError), batchError);
        throw new Error(
          batchError.message || batchError.details || JSON.stringify(batchError) || 'Batch insert failed'
        );
      }

      // Step B: Read-modify-write on ims_stock_summary
      const { data: existing } = await this.supabase
        .from('ims_stock_summary')
        .select('id, current_quantity, available_quantity, total_value')
        .eq('item_id', data.item_id)
        .eq('store_id', data.store_id ?? null)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await this.supabase
          .from('ims_stock_summary')
          .update({
            current_quantity:   (existing.current_quantity   ?? 0) + data.quantity,
            available_quantity: (existing.available_quantity ?? 0) + data.quantity,
            total_value:        (existing.total_value        ?? 0) + totalValue,
            updated_at:         new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (updateError) {
          console.warn('[ImsStockService] stock_summary update failed:', updateError);
        }
      } else {
        const isOpeningStock = data.notes === 'Opening stock';
        const { error: insertError } = await this.supabase
          .from('ims_stock_summary')
          .insert({
            item_id:            data.item_id,
            store_id:           data.store_id ?? null,
            institution_id:     data.institution_id,
            // Set opening_quantity only when this is the opening stock batch;
            // subsequent batches (GRN, manual add) do not affect the opening baseline.
            opening_quantity:   isOpeningStock ? data.quantity : 0,
            current_quantity:   data.quantity,
            available_quantity: data.quantity,
            reserved_quantity:  0,
            total_value:        totalValue,
          });
        if (insertError) {
          console.warn('[ImsStockService] stock_summary insert failed:', insertError);
        }
      }

      return batchRow.id as string;
    } catch (error) {
      const e = error as any;
      console.error('[ImsStockService] Error in addBatch:', {
        message: e?.message, code: e?.code, details: e?.details, hint: e?.hint,
      });
      throw error;
    }
  }

  /**
   * Update mutable batch fields (cost, GST, expiry, notes).
   * Quantity is intentionally not editable — create an adjustment if needed.
   */
  static async updateBatch(id: string, data: UpdateBatchDto): Promise<void> {
    try {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.cost_price !== undefined) {
        updates.cost_price = data.cost_price;
        // Recalculate total_value if cost_price changes — use existing gst_rate from DB
      }
      if (data.gst_rate !== undefined) updates.gst_rate = data.gst_rate;
      if (data.expiry_date !== undefined) updates.expiry_date = data.expiry_date || null;
      if (data.notes !== undefined) updates.notes = data.notes || null;

      const { error } = await this.supabase
        .from('ims_stock_batches')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[ImsStockService] Error in updateBatch:', error);
      throw error;
    }
  }

  /**
   * Delete a batch. Service-layer guard: fails if batch appears in any sale.
   * Also reverses the quantity_available from ims_stock_summary.
   */
  static async deleteBatch(id: string): Promise<void> {
    try {
      // Fetch batch details first
      const { data: batch, error: fetchError } = await this.supabase
        .from('ims_stock_batches')
        .select('id, batch_number, quantity_available, item_id, store_id, institution_id')
        .eq('id', id)
        .single();

      if (fetchError || !batch) throw fetchError || new Error('Batch not found');

      // Guard: check if this batch_number appears in any financial transaction (sale)
      if (batch.batch_number) {
        const { count } = await this.supabase
          .from('ims_financial_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('batch_number', batch.batch_number);

        if (count && count > 0) {
          throw new Error(
            'This batch has been used in sales and cannot be deleted. Use a stock adjustment to correct the quantity.'
          );
        }
      }

      // Delete the batch row
      const { error: deleteError } = await this.supabase
        .from('ims_stock_batches')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Reverse quantity from stock_summary
      if (batch.quantity_available > 0) {
        const scopeFilter = batch.store_id
          ? { store_id: batch.store_id }
          : { institution_id: batch.institution_id };

        const { data: summary } = await this.supabase
          .from('ims_stock_summary')
          .select('id, current_quantity, available_quantity')
          .eq('item_id', batch.item_id)
          .match(scopeFilter)
          .maybeSingle();

        if (summary) {
          await this.supabase
            .from('ims_stock_summary')
            .update({
              current_quantity:   Math.max(0, summary.current_quantity - batch.quantity_available),
              available_quantity: Math.max(0, summary.available_quantity - batch.quantity_available),
              updated_at:         new Date().toISOString(),
            })
            .eq('id', summary.id);
        }
      }
    } catch (error) {
      console.error('[ImsStockService] Error in deleteBatch:', error);
      throw error;
    }
  }
}
