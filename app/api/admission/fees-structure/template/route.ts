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

    const [cats, insts, quotas, comms] = await Promise.all([
      loadActiveFeeCategories(supabase),
      supabase.from('institutions').select('name').order('name'),
      supabase.from('quotas').select('name').order('name'),
      supabase.from('community_categories').select('name').order('name'),
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
      Gender: '', Communities: comms.data?.slice(0, 2).map((c) => c.name).join(', ') ?? 'BC, MBC',
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
    const commNames = (comms.data ?? []).map((r) => r.name);
    lists.columns = [
      { header: 'Institution', key: 'inst', width: 30 },
      { header: 'Quota', key: 'quota', width: 24 },
      { header: 'Gender', key: 'gender', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Community', key: 'comm', width: 30 },
    ];
    const maxLen = Math.max(instNames.length, quotaNames.length, commNames.length, 3);
    for (let i = 0; i < maxLen; i++) {
      lists.addRow({
        inst: instNames[i] ?? null, quota: quotaNames[i] ?? null,
        gender: ['Male', 'Female'][i] ?? null, status: ['draft', 'active', 'archived'][i] ?? null,
        comm: commNames[i] ?? null,
      });
    }
    // Dropdowns on first 200 data rows. Columns: B=Institution, G=Quota, H=Gender, K=Status.
    const colRange = (letter: string, n: number) => `Lists!$${letter}$2:$${letter}$${n + 1}`;
    for (let r = 2; r <= 201; r++) {
      if (instNames.length) sheet.getCell(`B${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: [colRange('A', instNames.length)] };
      if (quotaNames.length) sheet.getCell(`G${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: [colRange('B', quotaNames.length)] };
      sheet.getCell(`H${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['Lists!$C$2:$C$3'] };
      sheet.getCell(`K${r}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['Lists!$D$2:$D$4'] };
    }

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
