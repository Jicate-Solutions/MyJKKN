export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/export/route.ts
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import { FIXED_HEADERS } from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadActiveFeeCategories } from '@/lib/services/admission/fee-structure-bulk-lookups';

export async function GET(req: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value, set: () => {}, remove: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const institutionId = req.nextUrl.searchParams.get('institution_id');
    const status = req.nextUrl.searchParams.get('status');

    const cats = await loadActiveFeeCategories(supabase);
    const amountHeaders = cats.map((c) => c.category_name);

    let q = supabase.from('admission_fee_structures').select(`
      id, gender, name, status, notes, effective_from, effective_to,
      institution:institutions(name), degree:degrees(degree_name),
      department:departments(department_name), programme:programs(program_name),
      quota:quotas(name), admission_year:admission_years(admission_year_name),
      communities:admission_fee_structure_communities(community_category:community_categories(name)),
      items:admission_fee_structure_items(amount, billing_category:billing_categories(category_name))
    `).order('updated_at', { ascending: false });
    if (institutionId) q = q.eq('institution_id', institutionId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Fee Structures');
    const headers = [...FIXED_HEADERS, ...amountHeaders];
    sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(16, h.length + 2) }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const s of (data ?? []) as any[]) {
      const row: Record<string, string | number> = {
        'Fee Structure ID': s.id,
        Institution: s.institution?.name ?? '', Degree: s.degree?.degree_name ?? '',
        Department: s.department?.department_name ?? '', Programme: s.programme?.program_name ?? '',
        'Admission Year': s.admission_year?.admission_year_name ?? '', Quota: s.quota?.name ?? '',
        Gender: s.gender ?? '', Name: s.name, Status: s.status,
        'Effective From': s.effective_from ?? '', 'Effective To': s.effective_to ?? '', Notes: s.notes ?? '',
        Communities: (s.communities ?? []).map((c: any) => c.community_category?.name).filter(Boolean).join(', '),
      };
      for (const it of s.items ?? []) {
        const name = it.billing_category?.category_name;
        if (name && amountHeaders.includes(name)) row[name] = Number(it.amount);
      }
      sheet.addRow(row);
    }

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=fee-structures-export-${new Date().toISOString().split('T')[0]}.xlsx`,
      },
    });
  } catch (e) {
    console.error('[fees-structure/export] error:', e);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}
