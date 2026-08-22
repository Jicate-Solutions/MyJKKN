export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/export/route.ts
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {
  FIXED_HEADERS,
  FEE_SCHEDULE_SHEET_NAME,
  SCHEDULE_HEADERS,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';
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
      accommodation:accommodation_types(name),
      hostel_category:hostel_categories(name),
      mess_category:mess_categories(name),
      communities:admission_fee_structure_communities(community_category:community_categories(name)),
      default_due_offset_days,
      items:admission_fee_structure_items(
        amount, schedule_mode, due_offset_days, due_date, promotes_to_status_code,
        billing_category:billing_categories(category_name),
        schedules:admission_fee_structure_item_schedules(
          sequence_no, share_percent, fixed_amount, due_offset_days, due_date,
          promotes_to_status_code
        )
      )
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
        Gender: s.gender ?? '', Accommodation: s.accommodation?.name ?? '',
        // Only hostel structures carry a tier; a blank here on a day-scholar
        // row round-trips correctly through the importer.
        'Room Category': s.hostel_category?.name ?? '',
        'Mess Category': s.mess_category?.name ?? '',
        Name: s.name, Status: s.status,
        'Effective From': s.effective_from ?? '', 'Effective To': s.effective_to ?? '', Notes: s.notes ?? '',
        'Default Due (Days)': s.default_due_offset_days ?? 30,
        Communities: (s.communities ?? []).map((c: any) => c.community_category?.name).filter(Boolean).join(', '),
      };
      for (const it of s.items ?? []) {
        const name = it.billing_category?.category_name;
        if (name && amountHeaders.includes(name)) row[name] = Number(it.amount);
      }
      sheet.addRow(row);
    }

    // ── Sheet 2: the schedules, one row per instalment ────────────────────
    // Exported even when empty, so the tab is always there to fill in. An
    // operator who has to know to create a sheet by hand will not use it.
    const sched = wb.addWorksheet(FEE_SCHEDULE_SHEET_NAME);
    sched.columns = SCHEDULE_HEADERS.map((h) => ({
      header: h,
      key: h,
      width: Math.max(16, h.length + 4),
    }));
    sched.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sched.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } };
    sched.views = [{ state: 'frozen', ySplit: 1 }];

    for (const st of (data ?? []) as any[]) {
      for (const it of st.items ?? []) {
        const category = it.billing_category?.category_name;
        if (!category) continue;

        const lines = [...(it.schedules ?? [])].sort(
          (a: any, b: any) => a.sequence_no - b.sequence_no,
        );

        if (it.schedule_mode === 'split' && lines.length > 0) {
          for (const l of lines) {
            sched.addRow({
              'Fee Structure ID': st.id,
              'Fee Category': category,
              'Instalment #': l.sequence_no,
              'Share %': l.share_percent == null ? '' : Number(l.share_percent),
              'Fixed Amount': l.fixed_amount == null ? '' : Number(l.fixed_amount),
              'Due After (Days)': l.due_offset_days ?? '',
              'Due Date': l.due_date ?? '',
              'Promotes To': l.promotes_to_status_code ?? '',
            });
          }
          continue;
        }

        // Unsplit items are exported ONLY when they actually carry schedule
        // config. Emitting a blank row for all 946 items would bury the ~few
        // that matter and invite an accidental edit that clears one.
        const hasConfig =
          it.due_offset_days != null || it.due_date != null || it.promotes_to_status_code != null;
        if (!hasConfig) continue;

        sched.addRow({
          'Fee Structure ID': st.id,
          'Fee Category': category,
          // Blank = the whole fee. See FEE_SCHEDULE_SHEET_NAME docs.
          'Instalment #': '',
          'Share %': '',
          'Fixed Amount': '',
          'Due After (Days)': it.due_offset_days ?? '',
          'Due Date': it.due_date ?? '',
          'Promotes To': it.promotes_to_status_code ?? '',
        });
      }
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
