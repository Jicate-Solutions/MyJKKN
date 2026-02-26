// lib/services/ims/inventory-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  ImsItem,
  ImsItemWithRelations,
  ImsItemFilters,
  CreateImsItemDto,
  UpdateImsItemDto,
} from '@/types/ims';

export class ImsInventoryService {
  private static get supabase() {
    // IMS tables are not yet in the Supabase-generated Database type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClientSupabaseClient() as any;
  }

  /**
   * List items with category and unit joins, search, filtering, and pagination.
   */
  static async getItems(filters: ImsItemFilters): Promise<{
    data: ImsItemWithRelations[];
    metadata: { total: number; page: number; limit: number; totalPages: number };
  }> {
    try {
      let query = this.supabase
        .from('ims_items')
        .select(
          '*, category:ims_item_categories(id,name,code), base_unit:ims_units!ims_items_base_unit_id_fkey(id,name,abbreviation)',
          { count: 'exact' }
        );

      // Search on name or code
      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`
        );
      }

      // Category filter
      if (filters.category_id) {
        query = query.eq('category_id', filters.category_id);
      }

      // Item type filter
      if (filters.item_type) {
        query = query.eq('item_type', filters.item_type);
      }

      // Active filter
      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
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

      query = query.range(from, to).order('name', { ascending: true });

      const { data, error, count } = await query;

      if (error) throw error;

      // Enrich items with stock data from ims_stock_summary
      let enrichedData = (data || []) as any[];
      if (enrichedData.length > 0) {
        const itemIds = enrichedData.map((i) => i.id);
        let stockQuery = this.supabase
          .from('ims_stock_summary')
          .select('item_id, current_quantity, available_quantity')
          .in('item_id', itemIds);

        if (filters.store_id) {
          stockQuery = stockQuery.eq('store_id', filters.store_id);
        } else if (filters.institution_id) {
          stockQuery = stockQuery.eq('institution_id', filters.institution_id);
        }

        const { data: stockData } = await stockQuery;
        const stockMap = new Map(
          (stockData || []).map((s) => [
            s.item_id,
            { current_quantity: s.current_quantity, available_quantity: s.available_quantity },
          ])
        );
        enrichedData = enrichedData.map((item) => ({
          ...item,
          stock: stockMap.get(item.id) || null,
        }));
      }

      return {
        data: enrichedData as ImsItemWithRelations[],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    } catch (error) {
      console.error('[ImsInventoryService] Error in getItems:', error);
      throw error;
    }
  }

  /**
   * Get a single item by ID with all unit relations.
   */
  static async getItem(id: string): Promise<ImsItemWithRelations> {
    try {
      const { data, error } = await this.supabase
        .from('ims_items')
        .select(
          `*,
           category:ims_item_categories(id,name,code),
           base_unit:ims_units!ims_items_base_unit_id_fkey(id,name,abbreviation),
           purchase_unit:ims_units!ims_items_purchase_unit_id_fkey(id,name,abbreviation),
           sale_unit:ims_units!ims_items_sale_unit_id_fkey(id,name,abbreviation),
           indent_unit:ims_units!ims_items_indent_unit_id_fkey(id,name,abbreviation)`
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return data as ImsItemWithRelations;
    } catch (error) {
      console.error('[ImsInventoryService] Error in getItem:', error);
      throw error;
    }
  }

  /**
   * Create a new inventory item.
   */
  static async createItem(data: CreateImsItemDto): Promise<ImsItem> {
    try {
      const { data: item, error } = await this.supabase
        .from('ims_items')
        .insert(data)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`Item code "${data.code}" already exists`);
        }
        throw error;
      }

      return item as ImsItem;
    } catch (error) {
      console.error('[ImsInventoryService] Error in createItem:', error);
      throw error;
    }
  }

  /**
   * Update an existing inventory item.
   */
  static async updateItem(id: string, data: UpdateImsItemDto): Promise<ImsItem> {
    try {
      const { data: item, error } = await this.supabase
        .from('ims_items')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return item as ImsItem;
    } catch (error) {
      console.error('[ImsInventoryService] Error in updateItem:', error);
      throw error;
    }
  }

  /**
   * Delete an inventory item by ID.
   */
  static async deleteItem(id: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('ims_items')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (error) {
      console.error('[ImsInventoryService] Error in deleteItem:', error);
      throw error;
    }
  }

  /**
   * Toggle item active/inactive status.
   */
  static async toggleItemActive(id: string, is_active: boolean): Promise<ImsItem> {
    try {
      const { data, error } = await this.supabase
        .from('ims_items')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return data as ImsItem;
    } catch (error) {
      console.error('[ImsInventoryService] Error in toggleItemActive:', error);
      throw error;
    }
  }

  /**
   * Lightweight item list for dropdown selects.
   */
  static async getItemsForSelect(
    storeId: string,
    institutionId?: string
  ): Promise<{ id: string; name: string; code: string; gst_rate: number; hsn_code: string | null }[]> {
    try {
      let query = this.supabase
        .from('ims_items')
        .select('id, name, code, gst_rate, hsn_code')
        .eq('is_active', true)
        .order('name');

      if (storeId) {
        query = query.eq('store_id', storeId);
      } else if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[ImsInventoryService] Error in getItemsForSelect:', error);
      throw error;
    }
  }
}
