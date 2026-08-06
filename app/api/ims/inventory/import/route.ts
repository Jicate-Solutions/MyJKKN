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
import { stripXlsxComments } from '@/lib/utils/strip-xlsx-comments';
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
  type ImsImportError,
  type ImsImportResult,
  type ImsDistributionRow,
  type ParsedImportRow,
} from '@/lib/services/ims/inventory-service';
import { ImsInventoryServiceServer } from '@/lib/services/ims/inventory-service.server';

// ============================================================================
// ZOD SCHEMA
// ============================================================================

const imsItemRowSchema = z.object({
  // Optional since 20260804120000: a blank cell means "generate one". Sheets that
  // already carry codes keep working — both historical imports supplied them —
  // but the format rule still applies to anything actually typed.
  code: z
    .string()
    .max(50, 'Code max 50 characters')
    .regex(/^[A-Za-z0-9_-]+$/, 'Code: only letters, numbers, _ or -')
    .optional(),
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).nullable(),
  category_name: z.string().nullable().default(null),
  item_type: z.enum(['consumable', 'equipment', 'medicine', 'stationery', 'other']).default('consumable'),
  base_unit_raw: z.string().nullable().default(null),
  purchase_unit_raw: z.string().nullable(),
  sale_unit_raw: z.string().nullable(),
  indent_unit_raw: z.string().nullable(),
  hsn_code: z.string().max(20).nullable(),
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
        // undefined, not '', so the Zod optional passes and the DB trigger fills it.
        code:                     code.trim() || undefined,
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

/**
 * Read the optional "Distribution" sheet: Item Code | Send To Store | Quantity.
 *
 * Absent sheet, or a sheet with only its header, means "no distribution" — a
 * catalog-only upload stays a catalog-only upload. Shape problems are surfaced
 * here as row errors; store and item resolution happens in the service, which
 * is the only place that can check them against the database.
 */
function parseDistributionSheet(workbook: ExcelJS.Workbook): ImsDistributionRow[] {
  const sheet = workbook.getWorksheet('Distribution');
  if (!sheet) return [];

  const rows: ImsDistributionRow[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header

    const itemCode   = getCellStringValue(row.getCell(1).value);
    const storeLabel = getCellStringValue(row.getCell(2).value);
    const qtyRaw     = getCellStringValue(row.getCell(3).value);

    // Fully blank row — the template ships 500 validated rows, so most are empty
    if (!itemCode && !storeLabel && !qtyRaw) return;

    // The template's own sample row, left in place
    if (itemCode.toUpperCase() === 'SAMPLE-001') return;

    const quantity = Number(qtyRaw);

    rows.push({
      row_number: rowNumber,
      item_code: itemCode,
      store_label: storeLabel,
      // NaN and blanks fall through to the service's `quantity > 0` check, which
      // reports them per row rather than throwing the whole sheet away.
      quantity: Number.isFinite(quantity) ? quantity : 0,
    });
  });

  return rows;
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

    // ── Permission ────────────────────────────────────────────────────────────
    // ims.inventory.bulk_import was declared in the catalogue but never checked
    // anywhere, so any logged-in user could push 5,000 rows into inventory.
    // user_has_permission() handles the super-admin bypass and ORs across every
    // role in user_roles, so no separate super-admin branch is needed.
    const { data: canBulkImport } = await supabase.rpc('user_has_permission', {
      permission_name: 'ims.inventory.bulk_import',
    });

    if (!canBulkImport) {
      return NextResponse.json(
        { error: 'You do not have permission to bulk import inventory.' },
        { status: 403 }
      );
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

    // ── Warehouse pinning ─────────────────────────────────────────────────────
    // Full inventory enters an institution at its warehouse and is forwarded to
    // the operating stores from there. Importing directly into an operating
    // store would create a second, divergent source of truth.
    //
    // This REFUSES rather than silently redirecting to the warehouse: a 5,000-row
    // upload landing in a store the user did not choose is undetectable until the
    // stock turns up in the wrong place. Checked before the workbook is parsed so
    // a 10 MB file is rejected immediately.
    if (storeId) {
      const { data: activeStore, error: storeError } = await supabase
        .from('ims_stores')
        .select('id, name, institution_id, is_central_supply_store')
        .eq('id', storeId)
        .maybeSingle();

      if (storeError) {
        console.error('[ims/inventory/import] Failed to resolve store:', storeError);
        return NextResponse.json(
          { error: 'Could not verify the selected store. Please try again.' },
          { status: 500 }
        );
      }

      if (!activeStore) {
        return NextResponse.json(
          { error: 'The selected store no longer exists. Reselect a store and try again.' },
          { status: 400 }
        );
      }

      if (!activeStore.is_central_supply_store) {
        const { data: warehouse } = await supabase
          .from('ims_stores')
          .select('name')
          .eq('institution_id', activeStore.institution_id)
          .eq('is_central_supply_store', true)
          .maybeSingle();

        return NextResponse.json(
          {
            error: warehouse
              ? `Inventory uploads go to the warehouse "${warehouse.name}". Switch to that store and import again.`
              : 'This institution has no warehouse yet. Mark one store as the warehouse in IMS Settings → Stores, then import into it.',
          },
          { status: warehouse ? 403 : 409 }
        );
      }
    }

    // ── Load workbook ─────────────────────────────────────────────────────────
    // Strip cell-note/comment parts first: files saved by WPS Office, Google
    // Sheets or LibreOffice carry threaded comments that crash ExcelJS's
    // xlsx.load() ("Cannot read properties of undefined (reading 'comments')").
    // Comments are irrelevant to item import, so dropping them is lossless.
    const arrayBuffer = await file.arrayBuffer();
    const workbook    = new ExcelJS.Workbook();
    try {
      const sanitized = await stripXlsxComments(arrayBuffer);
      await workbook.xlsx.load(sanitized);
    } catch (loadErr) {
      console.error('[ims/inventory/import] Failed to read workbook:', loadErr);
      return NextResponse.json(
        {
          error:
            'Could not read the Excel file. Please re-save it as .xlsx (Excel 2007+) and remove any cell comments/notes, then try again.',
        },
        { status: 400 }
      );
    }

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
    const result = await ImsInventoryServiceServer.bulkImport(
      parsedRows,
      storeId,
      institutionId,
      user.id
    );

    // ── Optional Distribution sheet ──────────────────────────────────────────
    // Runs only after items exist, so a row can distribute stock this very
    // upload just created via Opening Stock.
    //
    // Gated on the sheet having rows, NOT on successCount. The Item Code column
    // explicitly accepts "an item that already exists", so a file that only
    // distributes existing stock inserts nothing at all — successCount 0 — and
    // the old gate silently forwarded nothing while reporting no error, leaving
    // the user to believe the stock had moved.
    //
    // Only a genuine item-insert FAILURE suppresses distribution: there would be
    // nothing to send and the per-store errors would bury the real cause.
    const distErrors: ImsImportError[] = [];
    let distributionNote: string | null = null;

    const itemInsertFailed =
      parsedRows.length > 0 && result.successCount === 0 && result.errors.length > 0;

    const distRows = storeId ? parseDistributionSheet(workbook) : [];

    if (distRows.length > 0 && storeId && !itemInsertFailed) {
      const dist = await ImsInventoryServiceServer.distributeFromWarehouse(
        distRows,
        storeId,
        institutionId,
        user.id
      );
      distErrors.push(...dist.errors);

      const noteParts: string[] = [];
      if (dist.storesServed > 0) {
        noteParts.push(
          `Sent ${dist.dispatched} item line(s) to ${dist.storesServed} store(s). ` +
            `Each store now confirms receipt to take the stock into its own inventory.`
        );
      }
      if (dist.skipped > 0) {
        noteParts.push(
          `${dist.skipped} store(s) were skipped because this exact list was already ` +
            `sent to them in the last 24 hours.`
        );
      }
      if (noteParts.length > 0) distributionNote = noteParts.join(' ');
    }

    // Merge parse-level errors with service-level errors
    const mergedResult: ImsImportResult = {
      ...result,
      errorCount: result.errorCount + parseErrors.length + distErrors.length,
      errors: [...parseErrors, ...result.errors, ...distErrors],
      ...(distributionNote ? { distributionNote } : {}),
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
