// app/api/ims/inventory/template/route.ts
//
// GET /api/ims/inventory/template?storeId=X&institutionId=Y
//
// Generates a .xlsx import template with:
//   - Store-specific categories baked into a dropdown
//   - All global units baked into a dropdown
//   - 5 sheets: Items (main), Lists (hidden), Categories (hidden),
//     Units (hidden), Instructions (visible)
//   - 500 data rows with Excel data validations
//   - Sample row at row 2 (yellow background)

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';
import { buildUnitDisplay } from '@/lib/utils/ims-item-excel-mappings';
import { ImsInventoryServiceServer } from '@/lib/services/ims/inventory-service.server';

export async function GET(request: NextRequest) {
  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const supabase = await createServerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Query params ─────────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId') ?? null;
    const institutionId = searchParams.get('institutionId') ?? null;

    // ── Fetch reference data via service ─────────────────────────────────────
    const { categories, units } = await ImsInventoryServiceServer.getImportTemplateData(
      institutionId,
      storeId
    );

    if (!categories || categories.length === 0) {
      return NextResponse.json(
        {
          error:
            'No active categories found for this store. Please create categories first.',
        },
        { status: 400 }
      );
    }

    const categoryNames: string[] = categories.map((c) => c.name);
    const unitDisplayStrings: string[] = units.map((u) =>
      buildUnitDisplay(u.name, u.abbreviation)
    );

    // ── Build workbook ───────────────────────────────────────────────────────
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MyJKKN IMS';
    workbook.created = new Date();

    // ── SHEET 1: Items ───────────────────────────────────────────────────────
    const ws = workbook.addWorksheet('Items');

    // Define columns WITHOUT headers — headers are written separately via
    // addRow() below. Mixing ws.columns headers with custom cell-level styling
    // causes ExcelJS 4.x to serialize font colour through the column's implicit
    // style reference, which can silently strip the white font colour during
    // xlsx style deduplication, leaving the text invisible on the blue fill.
    ws.columns = [
      { key: 'code',            width: 16 },
      { key: 'name',            width: 32 },
      { key: 'description',     width: 36 },
      { key: 'category_name',   width: 24 },
      { key: 'item_type',       width: 18 },
      { key: 'base_unit',       width: 18 },
      { key: 'purchase_unit',   width: 18 },
      { key: 'sale_unit',       width: 18 },
      { key: 'indent_unit',     width: 18 },
      { key: 'hsn_code',        width: 14 },
      { key: 'gst_rate',        width: 14 },
      { key: 'cost_price',      width: 14 },
      { key: 'mrp',             width: 14 },
      { key: 'selling_price',   width: 14 },
      { key: 'reorder_level',   width: 14 },
      { key: 'max_stock_level', width: 16 },
      { key: 'track_batch',     width: 14 },
      { key: 'track_expiry',    width: 14 },
      { key: 'sellable',        width: 20 },
      { key: 'is_active',       width: 12 },
      { key: 'company_name',    width: 24 },
      { key: 'opening_stock',   width: 14 },
      { key: 'batch_number',    width: 18 },
      { key: 'expiry_date',     width: 16 },
    ];

    // Header row — added as a plain row so every cell is cleanly materialised
    // with no column-style inheritance. eachCell is then reliable over all 24.
    // Height 40 accommodates wrapped long headers (e.g. "Sellable to Students").
    const headerRow = ws.addRow([
      'Item Code *', 'Item Name *', 'Description', 'Category Name',
      'Item Type', 'Base Unit', 'Purchase Unit', 'Sale Unit', 'Indent Unit',
      'HSN Code', 'GST Rate (%)', 'Cost Price', 'MRP', 'Selling Price',
      'Reorder Level', 'Max Stock Level', 'Track Batch', 'Track Expiry',
      'Sellable to Students', 'Is Active', 'Company Name', 'Opening Stock',
      'Batch Number', 'Expiry Date',
    ]);
    headerRow.height = 40;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, size: 10, name: 'Arial', color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // Sample row (row 2)
    const sampleCategory = categoryNames[0] || 'Sample Category';
    const sampleUnit = unitDisplayStrings[0] || 'Piece (pcs)';

    ws.addRow({
      code:           'ITM-001',
      name:           'Sample Item Name',
      description:    'Optional description of the item',
      category_name:  sampleCategory,
      item_type:      'consumable',
      base_unit:      sampleUnit,
      purchase_unit:  '',
      sale_unit:      '',
      indent_unit:    '',
      hsn_code:       '3004',
      gst_rate:       12,
      cost_price:     100,
      mrp:            150,
      selling_price:  130,
      reorder_level:  10,
      max_stock_level: 100,
      track_batch:    'No',
      track_expiry:   'No',
      sellable:       'No',
      is_active:      'Yes',
      company_name:   'Sun Pharma',
      opening_stock:  0,
      batch_number:   '',
      expiry_date:    '',
    });

    const sampleRow = ws.getRow(2);
    sampleRow.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
    sampleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
    sampleRow.alignment = { vertical: 'middle' };

    // Sample row note
    ws.getCell('A2').note = {
      texts: [
        { font: { bold: true, size: 9, color: { argb: 'FF0000FF' } }, text: 'Sample Data Row\n' },
        { font: { size: 9 }, text: 'Replace this row with your data.\nDelete it when not needed.' },
      ],
    };

    // Default font for data rows 3-500
    for (let row = 3; row <= 500; row++) {
      ws.getRow(row).font = { name: 'Arial', size: 10, color: { argb: 'FF374151' } };
    }

    // ── SHEET 2: Lists (hidden reference data) ───────────────────────────────
    const listsSheet = workbook.addWorksheet('Lists');
    listsSheet.columns = [
      { header: 'Category',  width: 32 },
      { header: 'Item Type', width: 18 },
      { header: 'Unit',      width: 22 },
      { header: 'GST Rate',  width: 10 },
      { header: 'Yes/No',    width: 8  },
    ];

    const ITEM_TYPES = ['consumable', 'equipment', 'medicine', 'stationery', 'other'];
    const GST_RATES  = ['0', '5', '12', '18', '28'];
    const YES_NO     = ['Yes', 'No'];

    const maxLists = Math.max(
      categoryNames.length,
      ITEM_TYPES.length,
      unitDisplayStrings.length,
      GST_RATES.length,
      YES_NO.length,
    );

    for (let i = 0; i < maxLists; i++) {
      listsSheet.addRow([
        categoryNames[i]       ?? null,
        ITEM_TYPES[i]          ?? null,
        unitDisplayStrings[i]  ?? null,
        GST_RATES[i]           ?? null,
        YES_NO[i]              ?? null,
      ]);
    }

    listsSheet.state = 'hidden';

    // ── Data validations on Items sheet ─────────────────────────────────────
    const END_ROW = 500;
    const catCount  = categoryNames.length;
    const unitCount = unitDisplayStrings.length;

    for (let row = 2; row <= END_ROW; row++) {
      // Col D: Category
      ws.getCell(`D${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`Lists!$A$2:$A$${catCount + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Category',
        error: 'Select a category from the dropdown',
      };

      // Col E: Item Type
      ws.getCell(`E${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`Lists!$B$2:$B$${ITEM_TYPES.length + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Item Type',
        error: 'Select: consumable, equipment, medicine, stationery, or other',
      };

      // Col F: Base Unit
      ws.getCell(`F${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`Lists!$C$2:$C$${unitCount + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Unit',
        error: 'Select a unit from the dropdown',
      };

      // Col G: Purchase Unit
      ws.getCell(`G${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`Lists!$C$2:$C$${unitCount + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Unit',
        error: 'Select a unit from the dropdown (or leave blank)',
      };

      // Col H: Sale Unit
      ws.getCell(`H${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`Lists!$C$2:$C$${unitCount + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Unit',
        error: 'Select a unit from the dropdown (or leave blank)',
      };

      // Col I: Indent Unit
      ws.getCell(`I${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`Lists!$C$2:$C$${unitCount + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid Unit',
        error: 'Select a unit from the dropdown (or leave blank)',
      };

      // Col K: GST Rate
      ws.getCell(`K${row}`).dataValidation = {
        type: 'list', allowBlank: true,
        formulae: [`Lists!$D$2:$D$${GST_RATES.length + 1}`],
        showErrorMessage: true, errorStyle: 'warning',
        errorTitle: 'Invalid GST Rate',
        error: 'Select: 0, 5, 12, 18, or 28',
      };

      // Cols Q/R/S/T: Yes/No
      for (const col of ['Q', 'R', 'S', 'T']) {
        ws.getCell(`${col}${row}`).dataValidation = {
          type: 'list', allowBlank: true,
          formulae: [`Lists!$E$2:$E$${YES_NO.length + 1}`],
          showErrorMessage: true, errorStyle: 'warning',
          errorTitle: 'Invalid Value',
          error: 'Select: Yes or No',
        };
      }
    }

    // ── SHEET 5: Instructions ────────────────────────────────────────────────
    const instrSheet = workbook.addWorksheet('Instructions');
    instrSheet.columns = [{ width: 90 }];

    const instructions = [
      'IMS INVENTORY BULK IMPORT — INSTRUCTIONS',
      '',
      '1. REQUIRED FIELDS (marked with * in the header):',
      '   A  Item Code         — Unique code per store (letters, numbers, _ or -)',
      '   B  Item Name         — Full item name',
      '',
      '2. RECOMMENDED FIELDS (leave blank for defaults):',
      '   D  Category Name     — Must match an existing category if provided (use dropdown). Default: none',
      '   E  Item Type         — consumable / equipment / medicine / stationery / other. Default: consumable',
      '   F  Base Unit         — Primary unit of measure (use dropdown). Default: none',
      '   K  GST Rate (%)      — 0, 5, 12, 18, or 28. Default: 0',
      '   L  Cost Price        — Purchase cost (>= 0). Default: 0',
      '   M  MRP               — Maximum retail price (>= 0). Default: 0',
      '   N  Selling Price     — Price charged to students (>= 0). Default: 0',
      '',
      '3. OPTIONAL FIELDS (leave blank for defaults):',
      '   C  Description       — Free text',
      '   G  Purchase Unit     — Defaults to blank if not set',
      '   H  Sale Unit         — Defaults to blank if not set',
      '   I  Indent Unit       — Defaults to blank if not set',
      '   J  HSN Code          — 4-8 digit harmonised code',
      '   O  Reorder Level     — Default: 10',
      '   P  Max Stock Level   — Default: 100',
      '   Q  Track Batch       — Yes/No (default: No)',
      '   R  Track Expiry      — Yes/No (default: No)',
      '   S  Sellable to Students — Yes/No (default: No)',
      '   T  Is Active         — Yes/No (default: Yes)',
      '   U  Company Name      — Manufacturer or brand (free text)',
      '   V  Opening Stock     — Initial stock quantity on import (default: 0)',
      '   W  Batch Number      — Used if Opening Stock > 0',
      '   X  Expiry Date       — Format: YYYY-MM-DD. Used if Opening Stock > 0',
      '',
      '4. IMPORTANT NOTES:',
      '   - Only Code and Name are required — all other fields have defaults',
      '   - Item Codes must be unique within the store (case-insensitive)',
      '   - Categories in the dropdown are scoped to this store',
      '   - Units are global across all stores',
      '   - Opening Stock (col V) creates initial stock records; Batch Number and Expiry Date are ignored if Opening Stock = 0',
      '   - Row 2 is a sample — delete or replace it before uploading',
      '   - Up to 5,000 rows per upload',
      '',
      '5. UPLOAD PROCESS:',
      '   a. Fill in your data starting from row 3 (row 2 is sample)',
      '   b. Save the file',
      '   c. Click "Import Items" on the Inventory Items page',
      '   d. Upload the file — valid rows are inserted, errors are reported',
      '   e. Fix errors and re-upload only the failed rows',
      '',
      'For help, contact your system administrator.',
    ];

    instructions.forEach((line, i) => {
      const r = instrSheet.addRow([line]);
      if (i === 0) {
        r.font = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF1E3A8A' } };
      } else if (/^\d+\./.test(line)) {
        r.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FF1F2937' } };
      } else {
        r.font = { size: 10, name: 'Arial', color: { argb: 'FF374151' } };
      }
    });

    // ── Return file ──────────────────────────────────────────────────────────
    const buffer = await workbook.xlsx.writeBuffer();
    const date   = new Date().toISOString().split('T')[0];

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=ims-items-template-${date}.xlsx`,
      },
    });
  } catch (error) {
    console.error('[ims/inventory/template] Unexpected error:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to generate template', message: msg },
      { status: 500 }
    );
  }
}
