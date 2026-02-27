// app/api/ims/inventory/import/route.ts
//
// POST /api/ims/inventory/import  (multipart: file + storeId + institutionId)
//
// Pipeline:
//   1. Auth via createServerClient (cookie session)
//   2. Validate: file type, ≤10MB, ≤5000 data rows
//   3. Parse ExcelJS workbook → worksheet 'Items'
//   4. Fetch categories  → Map<nameLower, uuid>  (store-scoped)
//   5. Fetch units       → Maps by display / abbreviation / name
//   6. Row-by-row: parse → Zod validate → resolve FK → push to validItems or errors
//   7. Duplicate detection: within-file + DB query
//   8. Batch insert (supabase cast as any — IMS tables not in generated types)
//   9. Return ImsImportResult JSON

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  getCellStringValue,
  parseYesNo,
  parseNumericCell,
  parseIntCell,
  parseGstRate,
  parseItemType,
  buildUnitDisplay,
  resolveUnitId,
  validationError,
  IMS_GST_RATES,
} from '@/lib/utils/ims-item-excel-mappings';

// ============================================================================
// TYPES
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

// ============================================================================
// ZOD SCHEMA
// ============================================================================

const imsItemRowSchema = z.object({
  code: z
    .string()
    .min(1, 'Code is required')
    .max(50, 'Code max 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Code: only letters, numbers, _ or -'),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).nullable(),
  category_name: z.string().min(1, 'Category Name is required'),
  item_type: z.enum(['consumable', 'equipment', 'medicine', 'stationery', 'other'], {
    errorMap: () => ({ message: 'Item Type must be one of: consumable, equipment, medicine, stationery, other' }),
  }),
  base_unit_raw: z.string().min(1, 'Base Unit is required'),
  purchase_unit_raw: z.string().nullable(),
  sale_unit_raw: z.string().nullable(),
  indent_unit_raw: z.string().nullable(),
  hsn_code: z.string().max(8).nullable(),
  gst_rate: z.number().refine(
    (v) => (IMS_GST_RATES as readonly number[]).includes(v),
    { message: 'GST Rate must be 0, 5, 12, 18, or 28' }
  ),
  cost_price: z.number().min(0, 'Cost Price must be ≥ 0'),
  mrp: z.number().min(0, 'MRP must be ≥ 0'),
  selling_price: z.number().min(0, 'Selling Price must be ≥ 0'),
  reorder_level: z.number().int().min(0).default(10),
  max_stock_level: z.number().int().min(0).default(100),
  track_batch: z.boolean().default(false),
  track_expiry: z.boolean().default(false),
  is_sellable_to_students: z.boolean().default(false),
  is_active: z.boolean().default(true),
  company_name: z.string().max(255).nullable().optional(),
  opening_stock: z.number().int().min(0).default(0),
  batch_number:  z.string().max(100).nullable().optional(),
  expiry_date:   z.string().nullable().optional(),
});

type ImsItemRow = z.infer<typeof imsItemRowSchema>;

// ============================================================================
// ROW PARSER
// ============================================================================

function parseRow(
  row: ExcelJS.Row,
  rowNumber: number,
): { data: Partial<ImsItemRow> | null; errors: ImsImportError[] } {
  const errors: ImsImportError[] = [];

  try {
    const code         = getCellStringValue(row.getCell(1).value);
    const name         = getCellStringValue(row.getCell(2).value);
    const description  = getCellStringValue(row.getCell(3).value) || null;
    const categoryName = getCellStringValue(row.getCell(4).value);
    const itemTypeRaw  = getCellStringValue(row.getCell(5).value);
    const baseUnitRaw  = getCellStringValue(row.getCell(6).value);
    const purchaseUnit = getCellStringValue(row.getCell(7).value) || null;
    const saleUnit     = getCellStringValue(row.getCell(8).value) || null;
    const indentUnit   = getCellStringValue(row.getCell(9).value) || null;
    const hsnCode      = getCellStringValue(row.getCell(10).value) || null;
    const gstRateRaw   = getCellStringValue(row.getCell(11).value);
    const costPriceRaw = getCellStringValue(row.getCell(12).value);
    const mrpRaw       = getCellStringValue(row.getCell(13).value);
    const sellingRaw   = getCellStringValue(row.getCell(14).value);
    const reorderRaw   = getCellStringValue(row.getCell(15).value);
    const maxStockRaw  = getCellStringValue(row.getCell(16).value);
    const trackBatch   = getCellStringValue(row.getCell(17).value);
    const trackExpiry  = getCellStringValue(row.getCell(18).value);
    const sellable     = getCellStringValue(row.getCell(19).value);
    const isActiveRaw  = getCellStringValue(row.getCell(20).value);
    const companyName      = getCellStringValue(row.getCell(21).value) || null;
    const openingStockRaw  = getCellStringValue(row.getCell(22).value);
    const batchNumber      = getCellStringValue(row.getCell(23).value) || null;
    const expiryDateRaw    = getCellStringValue(row.getCell(24).value) || null;

    // Skip fully empty rows
    if (!code && !name) return { data: null, errors: [] };

    // Validate required numerics
    const gst = parseGstRate(gstRateRaw);
    if (gst === null && gstRateRaw.trim()) {
      errors.push(validationError(rowNumber, 'GST Rate', 'Must be 0, 5, 12, 18, or 28'));
    }

    const costPrice = parseNumericCell(costPriceRaw);
    if (costPrice === null) {
      errors.push(validationError(rowNumber, 'Cost Price', 'Must be a number ≥ 0'));
    }

    const mrp = parseNumericCell(mrpRaw);
    if (mrp === null) {
      errors.push(validationError(rowNumber, 'MRP', 'Must be a number ≥ 0'));
    }

    const sellingPrice = parseNumericCell(sellingRaw);
    if (sellingPrice === null) {
      errors.push(validationError(rowNumber, 'Selling Price', 'Must be a number ≥ 0'));
    }

    // Item type
    const itemType = parseItemType(itemTypeRaw);
    if (!itemType && itemTypeRaw.trim()) {
      errors.push(validationError(rowNumber, 'Item Type',
        'Must be: consumable, equipment, medicine, stationery, or other'));
    }

    if (errors.length > 0) return { data: null, errors };

    return {
      data: {
        code:                     code.trim(),
        name:                     name.trim(),
        description,
        category_name:            categoryName,
        item_type:                itemType ?? 'consumable',
        base_unit_raw:            baseUnitRaw,
        purchase_unit_raw:        purchaseUnit,
        sale_unit_raw:            saleUnit,
        indent_unit_raw:          indentUnit,
        hsn_code:                 hsnCode,
        gst_rate:                 gst ?? 0,
        cost_price:               costPrice ?? 0,
        mrp:                      mrp ?? 0,
        selling_price:            sellingPrice ?? 0,
        reorder_level:            parseIntCell(reorderRaw, 10),
        max_stock_level:          parseIntCell(maxStockRaw, 100),
        track_batch:              parseYesNo(trackBatch, false),
        track_expiry:             parseYesNo(trackExpiry, false),
        is_sellable_to_students:  parseYesNo(sellable, false),
        is_active:                parseYesNo(isActiveRaw, true),
        company_name:             companyName,
        opening_stock:            parseIntCell(openingStockRaw, 0),
        batch_number:             batchNumber,
        expiry_date:              expiryDateRaw,
      },
      errors: [],
    };
  } catch (err) {
    return {
      data: null,
      errors: [
        {
          row: rowNumber,
          message: `Row ${rowNumber}: Failed to parse — ${err instanceof Error ? err.message : 'Unknown error'}`,
        },
      ],
    };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options);
          },
          remove(name: string, options: any) {
            cookieStore.set(name, '', { ...options, maxAge: 0 });
          },
        },
      }
    ) as any;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse form data ───────────────────────────────────────────────────────
    const formData    = await request.formData();
    const file        = formData.get('file') as File | null;
    const storeId     = (formData.get('storeId') as string | null) || null;
    const institutionId = (formData.get('institutionId') as string | null) || null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx or .xls)' },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds the 10 MB limit' },
        { status: 400 }
      );
    }

    // ── Load workbook ─────────────────────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer();
    const workbook    = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const worksheet = workbook.getWorksheet('Items');
    if (!worksheet) {
      return NextResponse.json(
        { error: 'Invalid template — missing "Items" sheet. Download the template and try again.' },
        { status: 400 }
      );
    }

    // Guard against monster uploads
    const dataRowCount = worksheet.rowCount - 1; // exclude header
    if (dataRowCount > 5000) {
      return NextResponse.json(
        { error: `Too many rows (${dataRowCount}). Maximum is 5,000 per upload.` },
        { status: 400 }
      );
    }

    // ── Fetch reference data ──────────────────────────────────────────────────

    // Categories
    let catQuery = supabase
      .from('ims_item_categories')
      .select('id, name')
      .eq('is_active', true);

    if (storeId) catQuery = catQuery.eq('store_id', storeId);
    else if (institutionId) catQuery = catQuery.eq('institution_id', institutionId);

    const { data: categories, error: catError } = await catQuery;
    if (catError) {
      console.error('[ims/inventory/import] category fetch:', catError);
      return NextResponse.json(
        { error: 'Failed to load categories', message: catError.message },
        { status: 500 }
      );
    }

    const categoryByName = new Map<string, string>(
      (categories || []).map((c: any) => [c.name.toLowerCase(), c.id as string])
    );

    // Units
    const { data: units, error: unitError } = await supabase
      .from('ims_units')
      .select('id, name, abbreviation');

    if (unitError) {
      console.error('[ims/inventory/import] unit fetch:', unitError);
      return NextResponse.json(
        { error: 'Failed to load units', message: unitError.message },
        { status: 500 }
      );
    }

    const byDisplay = new Map<string, string>();
    const byAbbr    = new Map<string, string>();
    const byName    = new Map<string, string>();

    for (const u of (units || []) as any[]) {
      const display = buildUnitDisplay(u.name, u.abbreviation).toLowerCase();
      byDisplay.set(display, u.id);
      byAbbr.set(u.abbreviation.toLowerCase(), u.id);
      byName.set(u.name.toLowerCase(), u.id);
    }

    // ── Parse & validate rows ─────────────────────────────────────────────────
    interface ResolvedItem {
      code: string;
      name: string;
      description: string | null;
      category_id: string;
      item_type: string;
      base_unit_id: string;
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
    const allErrors: ImsImportError[] = [];
    let totalRows = 0;

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      totalRows++;

      // Parse
      const { data: rowData, errors: parseErrors } = parseRow(row, rowNumber);
      if (parseErrors.length > 0) {
        allErrors.push(...parseErrors);
        return;
      }
      if (!rowData) return; // blank row

      // Zod validate
      const parsed = imsItemRowSchema.safeParse(rowData);
      if (!parsed.success) {
        parsed.error.errors.forEach((e) => {
          allErrors.push({
            row: rowNumber,
            field: e.path.join('.'),
            message: `Row ${rowNumber}: ${e.path.join('.')} — ${e.message}`,
          });
        });
        return;
      }

      const d = parsed.data;

      // Resolve category
      const categoryId = categoryByName.get(d.category_name.toLowerCase());
      if (!categoryId) {
        allErrors.push(validationError(
          rowNumber, 'Category Name',
          `"${d.category_name}" not found — create it first or check spelling`
        ));
        return;
      }

      // Resolve base unit (required)
      const baseUnitId = resolveUnitId(d.base_unit_raw, byDisplay, byAbbr, byName);
      if (baseUnitId === undefined) {
        allErrors.push(validationError(
          rowNumber, 'Base Unit',
          `"${d.base_unit_raw}" not found — use the dropdown from the template`
        ));
        return;
      }
      if (baseUnitId === null) {
        allErrors.push(validationError(rowNumber, 'Base Unit', 'Base Unit is required'));
        return;
      }

      // Resolve optional units (silent null on not-found)
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
        code:                   d.code.toUpperCase(),
        name:                   d.name,
        description:            d.description,
        category_id:            categoryId,
        item_type:              d.item_type,
        base_unit_id:           baseUnitId,
        purchase_unit_id:       purchaseUnitId,
        sale_unit_id:           saleUnitId,
        indent_unit_id:         indentUnitId,
        hsn_code:               d.hsn_code,
        gst_rate:               d.gst_rate,
        cost_price:             d.cost_price,
        mrp:                    d.mrp,
        selling_price:          d.selling_price,
        reorder_level:          d.reorder_level,
        max_stock_level:        d.max_stock_level,
        track_batch:            d.track_batch,
        track_expiry:           d.track_expiry,
        is_sellable_to_students: d.is_sellable_to_students,
        is_active:              d.is_active,
        company_name:           d.company_name ?? null,
        opening_stock:          d.opening_stock ?? 0,
        batch_number:           d.batch_number ?? null,
        expiry_date:            d.expiry_date ?? null,
        store_id:               storeId,
        institution_id:         institutionId,
        created_by:             user.id,
      });
    });

    // ── Early exit if nothing valid ───────────────────────────────────────────
    if (validItems.length === 0) {
      return NextResponse.json<ImsImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: allErrors.length,
          totalRows,
          errors: allErrors,
        },
        { status: 400 }
      );
    }

    // ── Duplicate detection within file ───────────────────────────────────────
    const seenCodes = new Map<string, number>(); // code → first index
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

    // ── Duplicate detection against DB ────────────────────────────────────────
    const codesToCheck = deduped.map((i) => i.code.toUpperCase());

    let dbDupQuery = supabase
      .from('ims_items')
      .select('code')
      .in('code', codesToCheck);

    if (storeId) dbDupQuery = dbDupQuery.eq('store_id', storeId);
    else if (institutionId) dbDupQuery = dbDupQuery.eq('institution_id', institutionId);

    const { data: existingItems, error: dupError } = await dbDupQuery;

    if (dupError) {
      console.error('[ims/inventory/import] duplicate check:', dupError);
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

    // ── Insert ────────────────────────────────────────────────────────────────
    if (itemsToInsert.length === 0) {
      return NextResponse.json<ImsImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: allErrors.length,
          totalRows,
          errors: allErrors,
          duplicateCodes: [...new Set(duplicateCodes)],
        },
        { status: 400 }
      );
    }

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
      console.error('[ims/inventory/import] insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to insert items', message: insertError.message },
        { status: 500 }
      );
    }

    // ── Opening stock (non-fatal) ─────────────────────────────────────────────
    // Build a code→inserted-id map (Supabase preserves insert order)
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
          item_id:            insertedCodeMap.get(item.code.toUpperCase()),
          current_quantity:   item.opening_stock,
          reserved_quantity:  0,
          available_quantity: item.opening_stock,
          total_value:        item.opening_stock * item.cost_price,
          institution_id:     institutionId,
          updated_at:         now,
        }));
        const { error: summaryError } = await supabase
          .from('ims_stock_summary')
          .insert(summaries);
        if (summaryError) {
          console.warn('[ims/inventory/import] stock summary insert failed:', summaryError.message);
        }
      } catch (e) {
        console.warn('[ims/inventory/import] stock summary insert threw:', e);
      }

      // 2. ims_financial_transactions (adjustment ledger)
      try {
        const transactions = stockItems.map((item) => ({
          transaction_type: 'adjustment',
          reference_id:     null,
          reference_type:   'adjustment',
          amount:           item.opening_stock * item.cost_price,
          description:      `Opening stock import — ${item.name} (${item.code})`,
          item_id:          insertedCodeMap.get(item.code.toUpperCase()),
          quantity:         item.opening_stock,
          batch_number:     item.batch_number || null,
          expiry_date:      item.expiry_date || null,
          created_by:       user.id,
          institution_id:   institutionId,
          ...(storeId ? { store_id: storeId } : {}),
        }));
        const { error: txError } = await supabase
          .from('ims_financial_transactions')
          .insert(transactions);
        if (txError) {
          console.warn('[ims/inventory/import] financial transactions insert failed:', txError.message);
        }
      } catch (e) {
        console.warn('[ims/inventory/import] financial transactions insert threw:', e);
      }

      // 3. ims_stock_batches (only for items with a batch_number)
      const batchItems = stockItems.filter((item) => item.batch_number);
      if (batchItems.length > 0) {
        try {
          const batches = batchItems.map((item) => ({
            item_id:        insertedCodeMap.get(item.code.toUpperCase()),
            batch_number:   item.batch_number,
            expiry_date:    item.expiry_date || null,
            quantity:       item.opening_stock,
            cost_price:     item.cost_price,
            total_value:    item.opening_stock * item.cost_price,
            grn_id:         null,
            location_type:  'central_store',
            department_id:  null,
            institution_id: institutionId,
            ...(storeId ? { store_id: storeId } : {}),
          }));
          const { error: batchError } = await supabase
            .from('ims_stock_batches')
            .insert(batches);
          if (batchError) {
            console.warn('[ims/inventory/import] stock batches insert failed:', batchError.message);
          }
        } catch (e) {
          console.warn('[ims/inventory/import] stock batches insert threw:', e);
        }
      }
    }

    // ── Result ────────────────────────────────────────────────────────────────
    const successCount = inserted?.length ?? 0;

    return NextResponse.json<ImsImportResult>(
      {
        success: successCount > 0,
        successCount,
        errorCount: allErrors.length,
        totalRows,
        errors: allErrors,
        duplicateCodes: duplicateCodes.length > 0 ? [...new Set(duplicateCodes)] : undefined,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[ims/inventory/import] Unexpected error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to import items', message: msg },
      { status: 500 }
    );
  }
}
