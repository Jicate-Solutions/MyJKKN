// lib/services/ims/stock-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsStockSummary,
  ImsStockBatch,
  ImsStockFilters,
  ImsBatchFilters,
  ImsLowStockItem,
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
      let query = this.supabase
        .from('ims_stock_summary')
        .select(
          `*,
           item:ims_items(
             id, name, code, reorder_level, max_stock_level,
             base_unit:ims_units!ims_items_base_unit_id_fkey(abbreviation),
             category:ims_item_categories(name)
           )`,
          { count: 'exact' }
        );

      // Primary: store_id; Fallback: institution_id
      if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
      } else if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      }

      // Low stock only - filter where current_quantity <= item.reorder_level
      // We apply this filter after fetching since it crosses a join boundary.
      // For DB-level filtering we use a reasonable approach:
      // fetch all and filter, or use an RPC. For now we use client filtering
      // when low_stock_only is set, with a larger page size.

      // Category filter via item relationship
      if (filters.category_id) {
        query = query.eq('item.category_id', filters.category_id);
      }

      // Search on item name or code
      if (filters.search) {
        // Since search spans joined tables, we filter via the item foreign key
        // Supabase doesn't support ilike on joined columns in .select()
        // We'll use a subquery approach: get item IDs matching search first
        const { data: matchingItems } = await this.supabase
          .from('ims_items')
          .select('id')
          .or(
            `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
          );

        if (matchingItems && matchingItems.length > 0) {
          const itemIds = matchingItems.map((i) => i.id);
          query = query.in('item_id', itemIds);
        } else {
          // No matching items - return empty
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
      }

      // Pagination
      const page = filters.page || 1;
      const limit = filters.limit || 20;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      // Low-stock path: fetch ALL rows (no range) so we can filter accurately,
      // then paginate in JS. This prevents the bug where total/totalPages were
      // computed from a single page's worth of already-filtered rows.
      if (filters.low_stock_only) {
        const { data: allData, error: allError } = await query
          .order('updated_at', { ascending: false });

        if (allError) throw allError;

        const filtered = (allData || []).filter(
          (s: any) => s.item && s.current_quantity <= (s.item.reorder_level || 0)
        );
        const paginated = filtered.slice((page - 1) * limit, page * limit);
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

      query = query.range(from, to).order('updated_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) throw error;

      let result = (data || []) as ImsStockSummary[];

      // Client-side low stock filtering
      if (filters.low_stock_only) {
        result = result.filter(
          (s) =>
            s.item &&
            s.current_quantity <= (s.item.reorder_level || 0)
        );
      }

      return {
        data: result,
        metadata: {
          total: filters.low_stock_only ? result.length : (count || 0),
          page,
          limit,
          totalPages: filters.low_stock_only
            ? Math.ceil(result.length / limit)
            : count
              ? Math.ceil(count / limit)
              : 0,
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
        .gt('quantity', 0)
        .order('expiry_date', { ascending: true });

      if (error) throw error;

      return (data || []) as ImsStockBatch[];
    } catch (error) {
      console.error('[ImsStockService] Error in getExpiringBatches:', error);
      throw error;
    }
  }

  /**
   * Get items where current_quantity <= reorder_level.
   */
  static async getLowStockItems(institution_id: string, storeId?: string): Promise<ImsLowStockItem[]> {
    try {
      let query = this.supabase
        .from('ims_stock_summary')
        .select(
          `item_id, current_quantity,
           item:ims_items(
             id, name, code, reorder_level,
             base_unit:ims_units!ims_items_base_unit_id_fkey(abbreviation)
           )`
        );

      // Primary: store_id; Fallback: institution_id
      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institution_id) {
        query = query.eq('institution_id', institution_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter low stock items client-side (cross-join comparison)
      const lowStock = (data || [])
        .filter(
          (s: any) =>
            s.item && s.current_quantity <= (s.item.reorder_level || 0)
        )
        .map((s: any) => ({
          item_id: s.item_id,
          item_name: s.item?.name || '',
          item_code: s.item?.code || '',
          current_quantity: s.current_quantity,
          reorder_level: s.item?.reorder_level || 0,
          unit_abbreviation: s.item?.base_unit?.abbreviation || '',
        }));

      return lowStock as ImsLowStockItem[];
    } catch (error) {
      console.error('[ImsStockService] Error in getLowStockItems:', error);
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
        const { error: insertError } = await this.supabase
          .from('ims_stock_summary')
          .insert({
            item_id:            data.item_id,
            store_id:           data.store_id ?? null,
            institution_id:     data.institution_id,
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
