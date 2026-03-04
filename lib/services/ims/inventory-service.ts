// lib/services/ims/inventory-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
// NOTE: createServerSupabaseClient is imported dynamically inside server-side
// methods (bulkImport, getImportTemplateData) to avoid pulling next/headers
// into the client bundle.
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

  // ==========================================================================
  // SERVER-SIDE METHODS (called from API routes, use createServerSupabaseClient)
  // ==========================================================================

  /**
   * Fetch categories and units needed to build the Excel import template.
   * Server-side only — uses cookie-based Supabase client.
   */
  static async getImportTemplateData(
    institutionId: string | null,
    storeId?: string | null
  ): Promise<{ categories: ImsCategoryRow[]; units: ImsUnitRow[] }> {
    const { createServerSupabaseClient } = await import('@/lib/supabase/server');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createServerSupabaseClient()) as any;

    // Categories (store-scoped)
    let catQuery = supabase
      .from('ims_item_categories')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');

    if (storeId) {
      catQuery = catQuery.eq('store_id', storeId);
    } else if (institutionId) {
      catQuery = catQuery.eq('institution_id', institutionId);
    }

    const { data: categories, error: catError } = await catQuery;
    if (catError) {
      throw new Error(`Failed to fetch categories: ${catError.message}`);
    }

    // Units (global)
    const { data: units, error: unitError } = await supabase
      .from('ims_units')
      .select('id, name, abbreviation')
      .order('name');

    if (unitError) {
      throw new Error(`Failed to fetch units: ${unitError.message}`);
    }

    return {
      categories: (categories || []) as ImsCategoryRow[],
      units: (units || []) as ImsUnitRow[],
    };
  }

  /**
   * Bulk-import parsed & validated rows into ims_items (+ opening stock records).
   * Server-side only — uses cookie-based Supabase client.
   *
   * The caller (route handler) is responsible for:
   *   - Authenticating the user
   *   - Parsing the Excel file into rows
   *   - Zod-validating each row
   * This method handles:
   *   - FK resolution (category name → id, unit display → id)
   *   - Within-file duplicate detection
   *   - DB duplicate detection
   *   - Batch insert of items + opening stock/transaction/batch records
   */
  static async bulkImport(
    rows: ParsedImportRow[],
    storeId: string | null,
    institutionId: string | null,
    userId: string
  ): Promise<ImsImportResult> {
    const { createServerSupabaseClient } = await import('@/lib/supabase/server');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createServerSupabaseClient()) as any;

    const allErrors: ImsImportError[] = [];
    const totalRows = rows.length;

    // ── Fetch reference data ──────────────────────────────────────────────

    // Categories
    let catQuery = supabase
      .from('ims_item_categories')
      .select('id, name')
      .eq('is_active', true);

    if (storeId) catQuery = catQuery.eq('store_id', storeId);
    else if (institutionId) catQuery = catQuery.eq('institution_id', institutionId);

    const { data: categories, error: catError } = await catQuery;
    if (catError) {
      throw new Error(`Failed to load categories: ${catError.message}`);
    }

    const categoryByName = new Map<string, string>(
      (categories || []).map((c: any) => [c.name.toLowerCase(), c.id as string])
    );

    // Units
    const { data: units, error: unitError } = await supabase
      .from('ims_units')
      .select('id, name, abbreviation');

    if (unitError) {
      throw new Error(`Failed to load units: ${unitError.message}`);
    }

    const byDisplay = new Map<string, string>();
    const byAbbr = new Map<string, string>();
    const byName = new Map<string, string>();

    for (const u of (units || []) as any[]) {
      const display = buildUnitDisplay(u.name, u.abbreviation).toLowerCase();
      byDisplay.set(display, u.id);
      byAbbr.set(u.abbreviation.toLowerCase(), u.id);
      byName.set(u.name.toLowerCase(), u.id);
    }

    // ── Resolve FKs row-by-row ────────────────────────────────────────────

    interface ResolvedItem {
      code: string;
      name: string;
      description: string | null;
      category_id: string | null;
      item_type: string;
      base_unit_id: string | null;
      purchase_unit_id: string | null;
      sale_unit_id: string | null;
      indent_unit_id: string | null;
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
      company_name: string | null;
      opening_stock: number;
      batch_number: string | null;
      expiry_date: string | null;
      store_id: string | null;
      institution_id: string | null;
      created_by: string;
    }

    const validItems: ResolvedItem[] = [];

    rows.forEach((d, idx) => {
      const rowNumber = idx + 2; // 1-indexed, skip header

      // Resolve category (optional — null if blank)
      let categoryId: string | null = null;
      if (d.category_name) {
        const resolved = categoryByName.get(d.category_name.toLowerCase());
        if (!resolved) {
          allErrors.push({
            row: rowNumber,
            field: 'Category Name',
            message: `Row ${rowNumber}: Category Name — "${d.category_name}" not found — create it first or check spelling`,
          });
          return;
        }
        categoryId = resolved;
      }

      // Resolve base unit (optional — null if blank)
      let baseUnitId: string | null = null;
      if (d.base_unit_raw) {
        const resolved = resolveUnitId(d.base_unit_raw, byDisplay, byAbbr, byName);
        if (resolved === undefined) {
          allErrors.push({
            row: rowNumber,
            field: 'Base Unit',
            message: `Row ${rowNumber}: Base Unit — "${d.base_unit_raw}" not found — use the dropdown from the template`,
          });
          return;
        }
        baseUnitId = resolved;
      }

      // Resolve optional units
      const purchaseUnitId = d.purchase_unit_raw
        ? resolveUnitId(d.purchase_unit_raw, byDisplay, byAbbr, byName) ?? null
        : null;
      const saleUnitId = d.sale_unit_raw
        ? resolveUnitId(d.sale_unit_raw, byDisplay, byAbbr, byName) ?? null
        : null;
      const indentUnitId = d.indent_unit_raw
        ? resolveUnitId(d.indent_unit_raw, byDisplay, byAbbr, byName) ?? null
        : null;

      validItems.push({
        code: d.code.toUpperCase(),
        name: d.name,
        description: d.description,
        category_id: categoryId,
        item_type: d.item_type,
        base_unit_id: baseUnitId,
        purchase_unit_id: purchaseUnitId,
        sale_unit_id: saleUnitId,
        indent_unit_id: indentUnitId,
        hsn_code: d.hsn_code,
        gst_rate: d.gst_rate,
        cost_price: d.cost_price,
        mrp: d.mrp,
        selling_price: d.selling_price,
        reorder_level: d.reorder_level,
        max_stock_level: d.max_stock_level,
        track_batch: d.track_batch,
        track_expiry: d.track_expiry,
        is_sellable_to_students: d.is_sellable_to_students,
        is_active: d.is_active,
        company_name: d.company_name ?? null,
        opening_stock: d.opening_stock ?? 0,
        batch_number: d.batch_number ?? null,
        expiry_date: d.expiry_date ?? null,
        store_id: storeId,
        institution_id: institutionId,
        created_by: userId,
      });
    });

    // ── Early exit if nothing valid ─────────────────────────────────────────
    if (validItems.length === 0) {
      return {
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors,
      };
    }

    // ── Duplicate detection within file ─────────────────────────────────────
    const seenCodes = new Map<string, number>();
    const duplicateCodes: string[] = [];

    const deduped = validItems.filter((item, idx) => {
      const key = item.code.toLowerCase();
      if (seenCodes.has(key)) {
        const firstRow = seenCodes.get(key)! + 2;
        allErrors.push({
          row: idx + 2,
          field: 'code',
          message: `Row ${idx + 2}: Code "${item.code}" duplicated in this file (first seen row ${firstRow})`,
        });
        duplicateCodes.push(item.code);
        return false;
      }
      seenCodes.set(key, idx);
      return true;
    });

    // ── Duplicate detection against DB ──────────────────────────────────────
    const codesToCheck = deduped.map((i) => i.code.toUpperCase());

    let dbDupQuery = supabase
      .from('ims_items')
      .select('code')
      .in('code', codesToCheck);

    if (storeId) dbDupQuery = dbDupQuery.eq('store_id', storeId);
    else if (institutionId) dbDupQuery = dbDupQuery.eq('institution_id', institutionId);

    const { data: existingItems, error: dupError } = await dbDupQuery;

    if (dupError) {
      console.error('[ImsInventoryService] bulkImport duplicate check:', dupError);
      // Non-fatal: proceed without DB dup check
    }

    const existingCodes = new Set<string>(
      (existingItems || []).map((i: any) => (i.code as string).toUpperCase())
    );

    const itemsToInsert = deduped.filter((item, idx) => {
      if (existingCodes.has(item.code.toUpperCase())) {
        allErrors.push({
          row: idx + 2,
          field: 'code',
          message: `Row ${idx + 2}: Code "${item.code}" already exists in the store`,
        });
        duplicateCodes.push(item.code);
        return false;
      }
      return true;
    });

    if (itemsToInsert.length === 0) {
      return {
        success: false,
        successCount: 0,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors,
        duplicateCodes: [...new Set(duplicateCodes)],
      };
    }

    // ── Insert items ────────────────────────────────────────────────────────
    // Strip stock-only fields before inserting into ims_items
    const itemDbRecords = itemsToInsert.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ opening_stock, batch_number, expiry_date, ...item }) => item
    );

    const { data: inserted, error: insertError } = await supabase
      .from('ims_items')
      .insert(itemDbRecords)
      .select('id');

    if (insertError) {
      console.error('[ImsInventoryService] bulkImport insert error:', insertError);
      throw new Error(`Failed to insert items: ${insertError.message}`);
    }

    // ── Opening stock (non-fatal) ───────────────────────────────────────────
    const insertedCodeMap = new Map<string, string>(
      (inserted || []).map((ins: any, idx: number) => [
        itemsToInsert[idx].code.toUpperCase(),
        ins.id as string,
      ])
    );

    const stockItems = itemsToInsert.filter((item) => item.opening_stock > 0);

    if (stockItems.length > 0) {
      const now = new Date().toISOString();

      // 1. ims_stock_summary
      try {
        const summaries = stockItems.map((item) => ({
          item_id: insertedCodeMap.get(item.code.toUpperCase()),
          current_quantity: item.opening_stock,
          reserved_quantity: 0,
          available_quantity: item.opening_stock,
          total_value: item.opening_stock * item.cost_price,
          institution_id: institutionId,
          updated_at: now,
          ...(storeId ? { store_id: storeId } : {}),
        }));
        const { error: summaryError } = await supabase
          .from('ims_stock_summary')
          .insert(summaries);
        if (summaryError) {
          console.warn('[ImsInventoryService] bulkImport stock summary insert failed:', summaryError.message);
        }
      } catch (e) {
        console.warn('[ImsInventoryService] bulkImport stock summary insert threw:', e);
      }

      // 2. ims_financial_transactions (adjustment ledger)
      try {
        const transactions = stockItems.map((item) => ({
          transaction_type: 'adjustment',
          reference_id: null,
          reference_type: 'adjustment',
          amount: item.opening_stock * item.cost_price,
          description: `Opening stock import — ${item.name} (${item.code})`,
          item_id: insertedCodeMap.get(item.code.toUpperCase()),
          quantity: item.opening_stock,
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          created_by: userId,
          institution_id: institutionId,
          ...(storeId ? { store_id: storeId } : {}),
        }));
        const { error: txError } = await supabase
          .from('ims_financial_transactions')
          .insert(transactions);
        if (txError) {
          console.warn('[ImsInventoryService] bulkImport financial transactions insert failed:', txError.message);
        }
      } catch (e) {
        console.warn('[ImsInventoryService] bulkImport financial transactions insert threw:', e);
      }

      // 3. ims_stock_batches (only for items with a batch_number)
      const batchItems = stockItems.filter((item) => item.batch_number);
      if (batchItems.length > 0) {
        try {
          const batches = batchItems.map((item) => ({
            item_id: insertedCodeMap.get(item.code.toUpperCase()),
            batch_number: item.batch_number,
            expiry_date: item.expiry_date || null,
            quantity: item.opening_stock,
            cost_price: item.cost_price,
            total_value: item.opening_stock * item.cost_price,
            grn_id: null,
            location_type: 'central_store',
            department_id: null,
            institution_id: institutionId,
            ...(storeId ? { store_id: storeId } : {}),
          }));
          const { error: batchError } = await supabase
            .from('ims_stock_batches')
            .insert(batches);
          if (batchError) {
            console.warn('[ImsInventoryService] bulkImport stock batches insert failed:', batchError.message);
          }
        } catch (e) {
          console.warn('[ImsInventoryService] bulkImport stock batches insert threw:', e);
        }
      }
    }

    // ── Result ──────────────────────────────────────────────────────────────
    const successCount = inserted?.length ?? 0;

    return {
      success: successCount > 0,
      successCount,
      errorCount: allErrors.length,
      totalRows,
      errors: allErrors,
      duplicateCodes: duplicateCodes.length > 0 ? [...new Set(duplicateCodes)] : undefined,
    };
  }
}
