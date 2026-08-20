export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/template/route.ts
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { FIXED_HEADERS } from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadActiveFeeCategories } from '@/lib/services/admission/fee-structure-bulk-lookups';

function serverClient(cookieStore: any) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set: (n: string, v: string, o: any) => cookieStore.set(n, v, o),
        remove: (n: string, o: any) => cookieStore.set(n, '', { ...o, maxAge: 0 }),
      },
    },
  );
}

export async function GET(_req: NextRequest) {
  await connection();
  try {
    const supabase = serverClient(await cookies());
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const [cats, insts, quotas, accs, comms, rooms, messes] = await Promise.all([
      loadActiveFeeCategories(supabase),
      supabase.from('institutions').select('name').order('name'),
      supabase.from('quotas').select('name').order('name'),
      supabase.from('accommodation_types').select('name').eq('is_active', true).order('sort_order'),
      supabase.from('community_categories').select('name').order('name'),
      // Gender-partitioned: de-duplicate by name, since a fee structure names
      // the tier and each learner resolves to their own gender's variant.
      supabase.from('hostel_categories').select('name, sort_order').eq('is_active', true).order('sort_order'),
      supabase.from('mess_categories').select('name, sort_order').eq('is_active', true).order('sort_order'),
    ]);
    const amountHeaders = cats.map((c) => c.category_name);
    const headers = [...FIXED_HEADERS, ...amountHeaders];

    const wb = new ExcelJS.Workbook();

    // ---- Sheet 1: Fee Structures ----
    const sheet = wb.addWorksheet('Fee Structures');
    sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(16, h.length + 2) }));
    sheet.getRow(1).font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Sample row (yellow) — leave Fee Structure ID blank to mean "create".
    const sample: Record<string, string | number> = {
      'Fee Structure ID': '',
      Institution: insts.data?.[0]?.name ?? 'JKKN College',
      Degree: 'Undergraduate', Department: 'Sample Department', Programme: 'Sample Programme',
      'Admission Year': '2026 - 2027', Quota: quotas.data?.[0]?.name ?? 'Management Quota',
      Gender: '', Accommodation: '',
      'Room Category': '', 'Mess Category': '',
      Communities: comms.data?.slice(0, 2).map((c) => c.name).join(', ') ?? 'BC, MBC',
      Name: 'BE CSE — General — 2026', Status: 'draft', 'Effective From': '', 'Effective To': '', Notes: '',
    };
    if (amountHeaders[0]) sample[amountHeaders[0]] = 1000;
    sheet.addRow(sample);
    sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
    sheet.getCell('A2').note = { texts: [{ font: { bold: true, size: 9 }, text: 'Sample row — delete before importing.' }] };

    // ---- Sheet 2: Lists (hidden) ----
    const lists = wb.addWorksheet('Lists');
    lists.state = 'hidden';
    const instNames = (insts.data ?? []).map((r) => r.name);
    const quotaNames = (quotas.data ?? []).map((r) => r.name);
    const accNames = (accs.data ?? []).map((r) => r.name);
    const commNames = (comms.data ?? []).map((r) => r.name);
    const uniqueNames = (rowsIn: Array<{ name: string }> | null) =>
      [...new Set((rowsIn ?? []).map((r) => r.name))];
    const roomNames = uniqueNames(rooms.data);
    const messNames = uniqueNames(messes.data);
    lists.columns = [
      { header: 'Institution', key: 'inst', width: 30 },
      { header: 'Quota', key: 'quota', width: 24 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Community', key: 'comm', width: 30 },
      { header: 'Accommodation', key: 'acc', width: 18 },
      { header: 'Room Category', key: 'room', width: 24 },
      { header: 'Mess Category', key: 'mess', width: 20 },
    ];
    const maxLen = Math.max(
      instNames.length, quotaNames.length, commNames.length, accNames.length,
      roomNames.length, messNames.length, 3,
    );
    for (let i = 0; i < maxLen; i++) {
      lists.addRow({
        inst: instNames[i] ?? null, quota: quotaNames[i] ?? null,
        gender: ['Male', 'Female'][i] ?? null, status: ['draft', 'active', 'archived'][i] ?? null,
        comm: commNames[i] ?? null, acc: accNames[i] ?? null,
        room: roomNames[i] ?? null, mess: messNames[i] ?? null,
      });
    }

    // Dropdowns on the first 200 data rows.
    //
    // Target columns are DERIVED from FIXED_HEADERS rather than hardcoded:
    // inserting "Room Category"/"Mess Category" after "Accommodation" shifted
    // Status from L to N, and the previous hardcoded letters would have
    // silently attached the Status dropdown to the Communities column.
    const sheetCol = (header: string): string | null => {
      const idx = (FIXED_HEADERS as readonly string[]).indexOf(header);
      if (idx < 0) return null;
      let n = idx + 1;
      let letter = '';
      while (n > 0) {
        const rem = (n - 1) % 26;
        letter = String.fromCharCode(65 + rem) + letter;
        n = Math.floor((n - 1) / 26);
      }
      return letter;
    };
    const colRange = (letter: string, n: number) => `Lists!$${letter}$2:$${letter}$${n + 1}`;
    const validate = (
      header: string,
      formulae: string[],
      allowBlank: boolean,
      enabled = true,
    ) => {
      const col = sheetCol(header);
      if (!col || !enabled) return;
      for (let r = 2; r <= 201; r++) {
        sheet.getCell(`${col}${r}`).dataValidation = { type: 'list', allowBlank, formulae };
      }
    };

    validate('Institution', [colRange('A', instNames.length)], false, instNames.length > 0);
    validate('Quota', [colRange('B', quotaNames.length)], false, quotaNames.length > 0);
    validate('Gender', ['Lists!$C$2:$C$3'], true);
    validate('Accommodation', [colRange('F', accNames.length)], true, accNames.length > 0);
    validate('Room Category', [colRange('G', roomNames.length)], true, roomNames.length > 0);
    validate('Mess Category', [colRange('H', messNames.length)], true, messNames.length > 0);
    validate('Status', ['Lists!$D$2:$D$4'], true);

    // ---- Sheet 3: Instructions ----
    const instr = wb.addWorksheet('Instructions');
    instr.columns = [{ width: 100 }];
    [
      'INSTRUCTIONS — BULK FEE STRUCTURE IMPORT',
      '',
      '1. ONE ROW = ONE FEE STRUCTURE.',
      '2. Leave "Fee Structure ID" BLANK to create. Filled = update an existing structure (from Export for Edit).',
      '3. Dimensions (Institution/Degree/Department/Programme/Admission Year/Quota): type the exact NAME.',
      '   Degree/Department/Programme/Admission Year must be valid WITHIN the chosen parent.',
      '4. Communities: comma-separated names, e.g. "BC, MBC, OBC".',
      '5. Gender: Male, Female, or blank (= applies to any gender).',
      '   Accommodation: Hostel, Day Scholar, etc., or blank (= applies to any accommodation).',
      '5a. Room Category / Mess Category: ONLY for Accommodation = Hostel, and BOTH are',
      '    REQUIRED when Status is active. Leave blank on every other row. Name the tier',
      '    (e.g. "Classic Room" / "Classic") — each learner resolves to their own gender’s variant.',
      '6. Fee amount columns: enter a number for each fee that applies; leave blank where it does not.',
      '   Transport and Hostel fees are intentionally NOT here (managed in their own modules).',
      '7. Status: draft (default), active, or archived. Dates: yyyy-mm-dd.',
      '8. Valid rows are saved even if others fail; the import dialog lists per-row errors to fix and re-upload.',
      '9. On UPDATE rows, the 6 dimensions are read-only identity — changing them rejects the row.',
    ].forEach((line, i) => {
      const row = instr.addRow([line]);
      row.font = i === 0 ? { bold: true, size: 14 } : line.match(/^\d+\./) ? { bold: true, size: 11 } : { size: 10 };
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=fee-structures-template-${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });
  } catch (e) {
    console.error('[fees-structure/template] error:', e);
    return NextResponse.json({ error: 'Failed to generate template' }, { status: 500 });
  }
}
