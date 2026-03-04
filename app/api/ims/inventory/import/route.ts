// app/api/ims/inventory/import/route.ts
//
// POST /api/ims/inventory/import  (multipart: file + storeId + institutionId)
//
// Pipeline:
//   1. Auth via createServerSupabaseClient (cookie session)
//   2. Validate: file type, <=10MB, <=5000 data rows
//   3. Parse ExcelJS workbook -> worksheet 'Items'
//   4. Row-by-row: parse -> Zod validate -> push to parsedRows or errors
//   5. Delegate FK resolution, dedup, insert to ImsInventoryService.bulkImport()
//   6. Return ImsImportResult JSON

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import {
  getCellStringValue,
  parseYesNo,
  parseNumericCell,
  parseIntCell,
  parseGstRate,
  parseItemType,
  validationError,
<<<<<<< Updated upstream
  IMS_GST_RATES,
  resolveImsWorksheet,
=======
>>>>>>> Stashed changes
} from '@/lib/utils/ims-item-excel-mappings';
import {
  ImsInventoryService,
  type ImsImportError,
  type ImsImportResult,
  type ParsedImportRow,
} from '@/lib/services/ims/inventory-service';

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
  category_name: z.string().nullable().default(null),
  item_type: z.enum(['consumable', 'equipment', 'medicine', 'stationery', 'other']).default('consumable'),
  base_unit_raw: z.string().nullable().default(null),
  purchase_unit_raw: z.string().nullable(),
  sale_unit_raw: z.string().nullable(),
  indent_unit_raw: z.string().nullable(),
  hsn_code: z.string().max(8).nullable(),
  gst_rate: z.number().min(0).default(0),
  cost_price: z.number().min(0).default(0),
  mrp: z.number().min(0).default(0),
  selling_price: z.number().min(0).default(0),
  reorder_level: z.number().int().min(0).default(10),
  max_stock_level: z.number().int().min(0).default(100),
  track_batch: z.boolean().default(false),
  track_expiry: z.boolean().default(false),
  is_sellable_to_students: z.boolean().default(false),
  is_active: z.boolean().default(true),
  company_name: z.string().max(255).nullable().optional(),
  opening_stock: z.number().int().min(0).default(0),
  batch_number: z.string().max(100).nullable().optional(),
  expiry_date: z.string().nullable().optional(),
});

// ============================================================================
// ROW PARSER
// ============================================================================

function parseRow(
  row: ExcelJS.Row,
  rowNumber: number,
): { data: Partial<ParsedImportRow> | null; errors: ImsImportError[] } {
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

    // Validate numerics — blank defaults to 0; non-numeric text still errors
    const gst = parseGstRate(gstRateRaw);
    if (gst === null && gstRateRaw.trim()) {
      errors.push(validationError(rowNumber, 'GST Rate', 'Must be 0, 5, 12, 18, or 28'));
    }

<<<<<<< Updated upstream
    const costPrice = parseNumericCell(costPriceRaw);
    if (costPrice === null && costPriceRaw.trim()) {
      errors.push(validationError(rowNumber, 'Cost Price', 'Must be a number ≥ 0'));
    }

    const mrp = parseNumericCell(mrpRaw);
    if (mrp === null && mrpRaw.trim()) {
      errors.push(validationError(rowNumber, 'MRP', 'Must be a number ≥ 0'));
    }

    const sellingPrice = parseNumericCell(sellingRaw);
    if (sellingPrice === null && sellingRaw.trim()) {
      errors.push(validationError(rowNumber, 'Selling Price', 'Must be a number ≥ 0'));
=======
    const costPrice = costPriceRaw.trim() ? parseNumericCell(costPriceRaw) : 0;
    if (costPrice === null) {
      errors.push(validationError(rowNumber, 'Cost Price', 'Must be a number >= 0'));
    }

    const mrp = mrpRaw.trim() ? parseNumericCell(mrpRaw) : 0;
    if (mrp === null) {
      errors.push(validationError(rowNumber, 'MRP', 'Must be a number >= 0'));
    }

    const sellingPrice = sellingRaw.trim() ? parseNumericCell(sellingRaw) : 0;
    if (sellingPrice === null) {
      errors.push(validationError(rowNumber, 'Selling Price', 'Must be a number >= 0'));
>>>>>>> Stashed changes
    }

    // Item type — blank defaults to 'consumable'; invalid text still errors
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
        category_name:            categoryName || null,
        item_type:                itemType ?? 'consumable',
        base_unit_raw:            baseUnitRaw || null,
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
    const supabase = await createServerSupabaseClient();

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

    if (!storeId && !institutionId) {
      return NextResponse.json(
        { error: 'Either storeId or institutionId is required' },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.name.endsWith('.xls') && !file.name.endsWith('.xlsx')) {
      return NextResponse.json(
        { error: 'The .xls format is not supported. Please save your file as .xlsx (Excel 2007+) and try again.' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an Excel file (.xlsx)' },
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

<<<<<<< Updated upstream
    const resolved = resolveImsWorksheet(workbook);
    if (!resolved) {
      return NextResponse.json(
        {
          error:
            'Could not find a valid Items sheet. ' +
            'Make sure your file has the correct column headers ' +
            '(Item Code, Item Name, Category Name, Item Type, Base Unit, GST Rate, Cost Price, MRP, Selling Price) ' +
            'in the first row. Download the template for the correct format.',
        },
=======
    const worksheet = workbook.getWorksheet('Items')
      ?? workbook.worksheets.find(ws => ws.state === 'visible')
      ?? workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      return NextResponse.json(
        { error: 'No readable worksheet found. The file must have at least a header row and data rows.' },
>>>>>>> Stashed changes
        { status: 400 }
      );
    }
    const worksheet = resolved.worksheet;
    if (resolved.method !== 'exact-name') {
      console.warn(
        `[ims/inventory/import] Worksheet resolved via "${resolved.method}" (sheet name: "${worksheet.name}")`
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

<<<<<<< Updated upstream
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

    // ── Auto-create missing categories from the file ────────────────────────
    const fileCategoryNames = new Set<string>();
    worksheet.eachRow({ includeEmpty: false }, (row: ExcelJS.Row, rowNumber: number) => {
      if (rowNumber === 1) return;
      const cat = getCellStringValue(row.getCell(4).value).trim();
      if (cat) fileCategoryNames.add(cat);
    });

    const missingCategories = Array.from(fileCategoryNames)
      .filter(name => !categoryByName.has(name.toLowerCase()));

    if (missingCategories.length > 0 && (storeId || institutionId)) {
      const newCats = missingCategories.map(name => ({
        name,
        code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 20),
        is_active: true,
        ...(storeId ? { store_id: storeId } : {}),
        ...(institutionId ? { institution_id: institutionId } : {}),
      }));
      const { data: created, error: createErr } = await supabase
        .from('ims_item_categories')
        .insert(newCats)
        .select('id, name');
      if (!createErr && created) {
        for (const c of created as any[]) {
          categoryByName.set(c.name.toLowerCase(), c.id);
        }
      }
      if (createErr) {
        console.warn('[ims/inventory/import] auto-create categories failed:', createErr.message);
      }
    }

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
      _rowNumber: number; // original Excel row (for error messages)
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
=======
    // ── Parse & validate rows ─────────────────────────────────────────────────
    const parsedRows: ParsedImportRow[] = [];
    const parseErrors: ImsImportError[] = [];
>>>>>>> Stashed changes
    let totalRows = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header

      totalRows++;

      // Parse
      const { data: rowData, errors: rowErrors } = parseRow(row, rowNumber);
      if (rowErrors.length > 0) {
        parseErrors.push(...rowErrors);
        return;
      }
      if (!rowData) return; // blank row

      // Zod validate
      const parsed = imsItemRowSchema.safeParse(rowData);
      if (!parsed.success) {
        parsed.error.errors.forEach((e) => {
          parseErrors.push({
            row: rowNumber,
            field: e.path.join('.'),
            message: `Row ${rowNumber}: ${e.path.join('.')} — ${e.message}`,
          });
        });
        return;
      }

<<<<<<< Updated upstream
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
        _rowNumber:             rowNumber,
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
=======
      parsedRows.push(parsed.data as ParsedImportRow);
>>>>>>> Stashed changes
    });

    // If all rows failed parsing, return early
    if (parsedRows.length === 0) {
      return NextResponse.json<ImsImportResult>(
        {
          success: false,
          successCount: 0,
          errorCount: parseErrors.length,
          totalRows,
          errors: parseErrors,
        },
        { status: 400 }
      );
    }

<<<<<<< Updated upstream
    // ── Duplicate detection within file ───────────────────────────────────────
    const seenCodes = new Map<string, number>(); // code → first row number
    const duplicateCodes: string[] = [];

    const deduped = validItems.filter((item) => {
      const key = item.code.toLowerCase();
      if (seenCodes.has(key)) {
        const firstRow = seenCodes.get(key)!;
        allErrors.push({
          row: item._rowNumber,
          field: 'code',
          message: `Row ${item._rowNumber}: Code "${item.code}" duplicated in this file (first seen row ${firstRow})`,
        });
        duplicateCodes.push(item.code);
        return false;
      }
      seenCodes.set(key, item._rowNumber);
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

    const itemsToInsert = deduped.filter((item) => {
      if (existingCodes.has(item.code.toUpperCase())) {
        allErrors.push({
          row: item._rowNumber,
          field: 'code',
          message: `Row ${item._rowNumber}: Code "${item.code}" already exists in the store`,
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

    // Strip non-DB fields before inserting into ims_items
    const itemDbRecords = itemsToInsert.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ _rowNumber, opening_stock, batch_number, expiry_date, ...item }) => item
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
          ...(storeId ? { store_id: storeId } : {}),
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
=======
    // ── Delegate to service ───────────────────────────────────────────────────
    const result = await ImsInventoryService.bulkImport(
      parsedRows,
      storeId,
      institutionId,
      user.id
    );

    // Merge parse-level errors with service-level errors
    const mergedResult: ImsImportResult = {
      ...result,
      errorCount: result.errorCount + parseErrors.length,
      errors: [...parseErrors, ...result.errors],
    };
>>>>>>> Stashed changes

    return NextResponse.json<ImsImportResult>(
      mergedResult,
      { status: mergedResult.success ? 200 : 400 }
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
