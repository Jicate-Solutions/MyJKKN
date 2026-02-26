// lib/services/ims/stock-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsStockSummary,
  ImsStockBatch,
  ImsStockFilters,
  ImsBatchFilters,
  ImsLowStockItem,
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
}
