// app/api/ims/inventory/prices/route.ts
//
// GET  /api/ims/inventory/prices?institutionId=…   -> .xlsx template, pre-filled
//                                                     with the institution's items
// POST /api/ims/inventory/prices  (multipart: file + institutionId)
//                                                  -> applies prices to existing items
//
// WHY THIS EXISTS
// The main bulk import (app/api/ims/inventory/import) is INSERT-ONLY: it rejects
// any code that already exists in the institution. That makes it unable to fill in
// prices for a catalogue that is already loaded — which is precisely the state
// JKKN Pharmacy was in on POS go-live day: 761 items, all with selling_price = 0,
// mrp = 0 and is_sellable_to_students = false, so the POS grid was empty and any
// bill would have totalled 0.00.
//
// Scope is deliberately tiny — three columns. A general-purpose upsert would let a
// hastily assembled price sheet overwrite names, units, categories or GST rates.
//
// The GET template is pre-filled with the existing code + name so whoever fills it
// in is typing prices next to a name they recognise, rather than transcribing codes.

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ExcelJS from 'exceljs';
import { stripXlsxComments } from '@/lib/utils/strip-xlsx-comments';
import { getCellStringValue, parseYesNo } from '@/lib/utils/ims-item-excel-mappings';
import { ImsInventoryServiceServer } from '@/lib/services/ims/inventory-service.server';

const SHEET_NAME = 'Prices';
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB, same ceiling as the item import
const MAX_ROWS = 5000;

/**
 * Both verbs are gated on the same permission as the item bulk import.
 * user_has_permission() handles the super-admin bypass and ORs across every row in
 * user_roles, so no separate super-admin branch is needed — and it is the same
 * function the POS checkout RPC uses, so UI and API cannot drift apart.
 */
async function requireBulkImport() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: allowed } = await supabase.rpc('user_has_permission', {
    permission_name: 'ims.inventory.bulk_import',
  });

  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: 'You do not have permission to update item prices in bulk.' },
        { status: 403 }
      ),
    };
  }

  return { supabase, user };
}

// ════════════════════════════════════════════════════════════════════════════
// GET — download a pre-filled template
// ════════════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const gate = await requireBulkImport();
    if (gate.error) return gate.error;

    const institutionId = request.nextUrl.searchParams.get('institutionId');
    if (!institutionId) {
      return NextResponse.json({ error: 'institutionId is required' }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = gate.supabase as any;

    const { data: items, error } = await supabase
      .from('ims_items')
      .select('code, name, cost_price, mrp, selling_price, is_sellable_to_students')
      .eq('institution_id', institutionId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[ims/inventory/prices] GET items:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_NAME);

    sheet.columns = [
      { key: 'code', width: 18 },
      { key: 'name', width: 44 },
      { key: 'cost_price', width: 12 },
      { key: 'mrp', width: 12 },
      { key: 'selling_price', width: 14 },
      { key: 'is_sellable', width: 20 },
    ];

    const header = sheet.addRow([
      'Code',
      'Item Name',
      'Cost Price (ref)',
      'MRP',
      'Selling Price',
      'Sellable at POS',
    ]);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const it of items || []) {
      sheet.addRow({
        code: it.code,
        name: it.name,
        cost_price: Number(it.cost_price) || 0,
        // Blank rather than 0 so the person filling it in can see at a glance what
        // is still unpriced, and so a left-blank cell means "leave unchanged".
        mrp: Number(it.mrp) > 0 ? Number(it.mrp) : null,
        selling_price: Number(it.selling_price) > 0 ? Number(it.selling_price) : null,
        is_sellable: it.is_sellable_to_students ? 'Yes' : 'No',
      });
    }

    const lastRow = (items?.length || 0) + 1;
    if (lastRow > 1) {
      // Code and Name are reference data; editing them cannot rename anything (the
      // importer matches on Code), so lock them to avoid confusion.
      sheet.getColumn('code').protection = { locked: true };
      sheet.getColumn('name').protection = { locked: true };
      sheet.getColumn('cost_price').protection = { locked: true };

      for (let r = 2; r <= lastRow; r += 1) {
        sheet.getCell(`F${r}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: ['"Yes,No"'],
          showErrorMessage: true,
          errorTitle: 'Yes or No',
          error: 'Pick Yes or No.',
        };
      }
      sheet.getColumn('mrp').numFmt = '0.00';
      sheet.getColumn('selling_price').numFmt = '0.00';
    }

    const notes = workbook.addWorksheet('How to use');
    notes.columns = [{ width: 100 }];
    [
      'IMS — Item Price & POS Sellability Update',
      '',
      'This sheet UPDATES items that already exist. It never creates new ones.',
      'To add new items, use the Items bulk import instead.',
      '',
      'Only three columns are applied: MRP, Selling Price and Sellable at POS.',
      'Names, units, categories, GST and cost price are never touched by this import.',
      '',
      'Code            — must match an existing item code in this institution. Do not edit.',
      'MRP             — printed maximum retail price. Leave blank to keep the current value.',
      'Selling Price   — what the counter actually charges. Leave blank to keep the current value.',
      'Sellable at POS — Yes puts the item in the POS grid. Leave blank to keep the current setting.',
      '',
      'Rules enforced on upload:',
      '  • An item marked Sellable = Yes must have a Selling Price above 0.',
      '    (Otherwise it reaches the counter and bills at 0.00.)',
      '  • Selling Price cannot exceed MRP.',
      '  • Prices cannot be negative.',
      '  • A code that does not exist is reported per row; the rest of the file still applies.',
      '',
      'Selling price is treated as INCLUSIVE of GST for counter sales, so no tax is',
      'added on top at billing time.',
    ].forEach((line) => notes.addRow([line]));
    notes.getRow(1).font = { bold: true, size: 13 };

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="ims-item-prices.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[ims/inventory/prices] GET failed:', error);
    return NextResponse.json({ error: 'Failed to build the price template' }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// POST — apply an uploaded sheet
// ════════════════════════════════════════════════════════════════════════════

export async function POST(request: NextRequest) {
  try {
    const gate = await requireBulkImport();
    if (gate.error) return gate.error;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const institutionId = (formData.get('institutionId') as string | null) || null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }
    if (!institutionId) {
      return NextResponse.json({ error: 'institutionId is required' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File must be 10 MB or smaller' }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(file.name)) {
      return NextResponse.json(
        { error: 'Upload the .xlsx template (not .xls or .csv)' },
        { status: 400 }
      );
    }

    const raw = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    // Excel writes comment parts that ExcelJS chokes on; the item import hits the
    // same problem and uses this same helper (import/route.ts:353).
    const sanitized = await stripXlsxComments(raw);
    await workbook.xlsx.load(sanitized as Buffer);

    const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
    if (!sheet) {
      return NextResponse.json(
        { error: `Could not find a "${SHEET_NAME}" sheet in the workbook` },
        { status: 400 }
      );
    }

    const rows: Array<{
      row_number: number;
      code: string;
      selling_price: number | null;
      mrp: number | null;
      is_sellable: boolean | null;
    }> = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      if (rows.length >= MAX_ROWS) return;

      const code = getCellStringValue(row.getCell(1).value).trim();
      const mrpRaw = getCellStringValue(row.getCell(4).value).trim();
      const sellRaw = getCellStringValue(row.getCell(5).value).trim();
      const sellableRaw = getCellStringValue(row.getCell(6).value).trim();

      // Blank row, or a row where nothing was filled in — nothing to do either way.
      if (!code) return;
      if (!mrpRaw && !sellRaw && !sellableRaw) return;

      // A blank cell means "leave this field alone", which is why these are null
      // rather than 0 — writing 0 would wipe a price someone had already set.
      const mrp = mrpRaw === '' ? null : Number(mrpRaw);
      const sell = sellRaw === '' ? null : Number(sellRaw);

      rows.push({
        row_number: rowNumber,
        code,
        // NaN is passed through so the service reports it against the row instead
        // of the whole sheet being thrown away.
        mrp: mrp === null ? null : mrp,
        selling_price: sell === null ? null : sell,
        is_sellable: sellableRaw === '' ? null : parseYesNo(sellableRaw),
      });
    });

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          successCount: 0,
          errorCount: 1,
          totalRows: 0,
          errors: [
            {
              row: 0,
              field: 'file',
              message:
                'Nothing to apply — fill in MRP, Selling Price or Sellable at POS on at least one row.',
            },
          ],
        },
        { status: 400 }
      );
    }

    const result = await ImsInventoryServiceServer.bulkUpdatePrices(rows, institutionId);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('[ims/inventory/prices] POST failed:', error);
    return NextResponse.json(
      { error: 'Failed to read the uploaded sheet. Re-download the template and try again.' },
      { status: 500 }
    );
  }
}
