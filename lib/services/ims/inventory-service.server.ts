// lib/services/ims/inventory-service.server.ts
//
// SERVER-ONLY methods that use createServerSupabaseClient (next/headers).
// Import this file ONLY from API routes / Server Actions — never from hooks or
// client components, otherwise the build will fail with a next/headers error.

import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  buildUnitDisplay,
  resolveUnitId,
} from '@/lib/utils/ims-item-excel-mappings';
import type {
  ImsImportError,
  ImsImportResult,
  ParsedImportRow,
  ImsCategoryRow,
  ImsUnitRow,
} from '@/lib/services/ims/inventory-service';

export class ImsInventoryServiceServer {
  /**
   * Fetch categories and units needed to build the Excel import template.
   * Server-side only — uses cookie-based Supabase client.
   */
  static async getImportTemplateData(
    institutionId: string | null,
    storeId?: string | null
  ): Promise<{ categories: ImsCategoryRow[]; units: ImsUnitRow[] }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createServerSupabaseClient()) as any;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await createServerSupabaseClient()) as any;

    const allErrors: ImsImportError[] = [];
    const totalRows = rows.length;

    // ── Fetch reference data ──────────────────────────────────────────────

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
      const rowNumber = idx + 2;

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
    // Codes are unique per institution (constraint: ims_items_institution_code_unique).
    // Filter the pre-flight check by institution so we match the constraint scope —
    // otherwise the check passes but the INSERT collides with rows from another store.
    const codesToCheck = deduped.map((i) => i.code.toUpperCase());

    let dbDupQuery = supabase
      .from('ims_items')
      .select('code')
      .in('code', codesToCheck);

    if (institutionId) dbDupQuery = dbDupQuery.eq('institution_id', institutionId);

    const { data: existingItems, error: dupError } = await dbDupQuery;

    if (dupError) {
      console.error('[ImsInventoryServiceServer] bulkImport duplicate check:', dupError);
    }

    const existingCodes = new Set<string>(
      (existingItems || []).map((i: any) => (i.code as string).toUpperCase())
    );

    const itemsToInsert = deduped.filter((item, idx) => {
      if (existingCodes.has(item.code.toUpperCase())) {
        allErrors.push({
          row: idx + 2,
          field: 'code',
          message: `Row ${idx + 2}: Code "${item.code}" already exists in this institution`,
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
    const itemDbRecords = itemsToInsert.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ opening_stock, batch_number, expiry_date, ...item }) => item
    );

    const { data: inserted, error: insertError } = await supabase
      .from('ims_items')
      .insert(itemDbRecords)
      .select('id');

    if (insertError) {
      console.error('[ImsInventoryServiceServer] bulkImport insert error:', insertError);

      // Postgres 23505 = unique_violation. Extract the offending code so the
      // user sees which row to fix instead of the opaque "Row 0" message.
      if ((insertError as any).code === '23505') {
        const detail = (insertError as any).details || insertError.message || '';
        const codeMatch = detail.match(/=\([^,]*,\s*([^)]+)\)/);
        const offending = codeMatch?.[1]?.trim();
        if (offending) {
          const offenderRow = itemsToInsert.findIndex(
            (it) => it.code.toUpperCase() === offending.toUpperCase()
          );
          allErrors.push({
            row: offenderRow >= 0 ? offenderRow + 2 : 0,
            field: 'code',
            message: offenderRow >= 0
              ? `Row ${offenderRow + 2}: Code "${offending}" already exists in this institution`
              : `Code "${offending}" already exists in this institution`,
          });
          return {
            success: false,
            successCount: 0,
            errorCount: allErrors.length,
            totalRows,
            errors: allErrors,
            duplicateCodes: [...new Set([...duplicateCodes, offending])],
          };
        }
      }

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
          console.warn('[ImsInventoryServiceServer] bulkImport stock summary insert failed:', summaryError.message);
        }
      } catch (e) {
        console.warn('[ImsInventoryServiceServer] bulkImport stock summary insert threw:', e);
      }

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
          console.warn('[ImsInventoryServiceServer] bulkImport financial transactions insert failed:', txError.message);
        }
      } catch (e) {
        console.warn('[ImsInventoryServiceServer] bulkImport financial transactions insert threw:', e);
      }

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
            console.warn('[ImsInventoryServiceServer] bulkImport stock batches insert failed:', batchError.message);
          }
        } catch (e) {
          console.warn('[ImsInventoryServiceServer] bulkImport stock batches insert threw:', e);
        }
      }
    }

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
