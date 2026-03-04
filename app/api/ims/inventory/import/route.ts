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

    const worksheet = workbook.getWorksheet('Items')
      ?? workbook.worksheets.find(ws => ws.state === 'visible')
      ?? workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount < 2) {
      return NextResponse.json(
        { error: 'No readable worksheet found. The file must have at least a header row and data rows.' },
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

    // ── Parse & validate rows ─────────────────────────────────────────────────
    const parsedRows: ParsedImportRow[] = [];
    const parseErrors: ImsImportError[] = [];
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

      parsedRows.push(parsed.data as ParsedImportRow);
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
