// lib/services/ims/inventory-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  buildUnitDisplay,
  resolveUnitId,
} from '@/lib/utils/ims-item-excel-mappings';
import type {
  ImsItem,
  ImsItemWithRelations,
  ImsItemFilters,
  CreateImsItemDto,
  UpdateImsItemDto,
} from '@/types/ims';

// ============================================================================
// Types for bulk import (server-side)
// ============================================================================

export interface ImsImportError {
  row: number;
  field?: string;
  message: string;
}

export interface ImsImportResult {
  success: boolean;
  successCount: number;
  errorCount: number;
  totalRows: number;
  errors: ImsImportError[];
  duplicateCodes?: string[];
  /** Present when the file's Distribution sheet forwarded stock to other stores. */
  distributionNote?: string;
}

/** A single row parsed from the Excel file, after Zod validation. */
export interface ParsedImportRow {
  code: string;
  name: string;
  description: string | null;
  category_name: string | null;
  item_type: string;
  base_unit_raw: string | null;
  purchase_unit_raw: string | null;
  sale_unit_raw: string | null;
  indent_unit_raw: string | null;
  hsn_code: string | null;
  gst_rate: number;
  cost_price: number;
  mrp: number;
  selling_price: number;
  reorder_level: number;
  max_stock_level: number;
  track_batch: boolean;
  track_expiry: boolean;
  is_sellable_to_students: boolean;
  is_active: boolean;
  company_name?: string | null;
  opening_stock: number;
  batch_number?: string | null;
  expiry_date?: string | null;
}

export interface ImsCategoryRow {
  id: string;
  name: string;
  code?: string;
}

export interface ImsUnitRow {
  id: string;
  name: string;
  abbreviation: string;
}

/**
 * A store the warehouse may forward stock to. Feeds the import template's
 * Distribution dropdown, so the sheet can only ever offer stores that actually
 * exist in the institution.
 */
export interface ImsDestinationStoreRow {
  id: string;
  name: string;
  code: string;
  is_central_supply_store: boolean;
}

/** One line of the import file's optional "Distribution" sheet. */
export interface ImsDistributionRow {
  row_number: number;
  item_code: string;
  /** Raw cell text, normally "Store Name (CODE)" from the dropdown. */
  store_label: string;
  quantity: number;
}

/** Shape returned by getItemsForSelect — used by useImsItemsForSelect and the indent form (Teammate C). */
export interface ImsItemForSelect {
  id: string;
  name: string;
  code: string;
  gst_rate: number;
  hsn_code: string | null;
  indent_unit_id: string | null;
  base_unit_id: string | null;
  indent_unit: { id: string; name: string; abbreviation: string } | null;
  base_unit: { id: string; name: string; abbreviation: string } | null;
}

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

      // The CATALOG is institution-scoped, not store-scoped: ims_items is
      // UNIQUE (institution_id, code), so an item code exists once per
      // institution regardless of how many stores it is stocked in.
      // ims_items.store_id is only a stamp of which store created the row.
      // Filtering on it would make an operating store's catalog empty, because
      // every item carries the warehouse's store_id — so a store could never
      // see (or request) an item the warehouse had just sent it.
      // Stock, in contrast, IS per-store and stays store-scoped below.
      if (filters.institution_id) {
        query = query.eq('institution_id', filters.institution_id);
      } else if (filters.store_id) {
        query = query.eq('store_id', filters.store_id);
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
          .select('item_id, current_quantity, available_quantity, opening_quantity')
          .in('item_id', itemIds);

        // Stock is genuinely per-store (ims_stock_summary is UNIQUE(item_id, store_id)),
        // so when a store is active we show ONLY that store's balance.
        if (filters.store_id) {
          stockQuery = stockQuery.eq('store_id', filters.store_id);
        } else if (filters.institution_id) {
          stockQuery = stockQuery.eq('institution_id', filters.institution_id);
        }

        const { data: stockData } = await stockQuery;
        // Without a store filter an item can return one row PER store, so a
        // plain Map would silently keep whichever row arrived last. Accumulate
        // instead: the institution-wide view is the sum across its stores.
        const stockMap = new Map<
          string,
          { current_quantity: number; available_quantity: number; opening_quantity: number }
        >();
        for (const s of stockData || []) {
          const prev = stockMap.get(s.item_id);
          stockMap.set(s.item_id, {
            current_quantity: (prev?.current_quantity ?? 0) + (s.current_quantity ?? 0),
            available_quantity: (prev?.available_quantity ?? 0) + (s.available_quantity ?? 0),
            opening_quantity: (prev?.opening_quantity ?? 0) + (s.opening_quantity ?? 0),
          });
        }
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
   * Includes unit IDs and joined unit objects so the indent form can auto-populate
   * the unit field when the user picks an item (Teammate C dependency).
   */
  static async getItemsForSelect(
    storeId: string,
    institutionId?: string
  ): Promise<ImsItemForSelect[]> {
    try {
      let query = this.supabase
        .from('ims_items')
        .select(
          `id, name, code, gst_rate, hsn_code,
           indent_unit_id, base_unit_id,
           indent_unit:ims_units!ims_items_indent_unit_id_fkey(id, name, abbreviation),
           base_unit:ims_units!ims_items_base_unit_id_fkey(id, name, abbreviation)`
        )
        .eq('is_active', true)
        .order('name');

      // Institution-scoped for the same reason as getItems: the catalog is
      // shared across an institution's stores. storeId is kept in the signature
      // (every caller already passes it) but is only a fallback for the rare
      // case where the institution is not yet resolved.
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      } else if (storeId) {
        query = query.eq('store_id', storeId);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []) as ImsItemForSelect[];
    } catch (error) {
      console.error('[ImsInventoryService] Error in getItemsForSelect:', error);
      throw error;
    }
  }

  // Server-side methods (bulkImport, getImportTemplateData) live in
  // inventory-service.server.ts to avoid pulling next/headers into the client bundle.
}
