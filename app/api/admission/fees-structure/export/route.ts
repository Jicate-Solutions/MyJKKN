export const dynamic = 'force-dynamic';
// app/api/admission/fees-structure/export/route.ts
//
// "Export for Edit" — the download the bulk round-trip is built around.
//
// ONE TAB, one row per INSTALMENT of one FEE of one STRUCTURE. The structure's
// own columns repeat down its rows so every row stands on its own under a
// filter. See the UNIFIED SHEET block in fee-structure-excel-mappings.ts for
// why the grain is long rather than one row per structure with 37 amount
// columns and nowhere to put a schedule.
import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import ExcelJS from 'exceljs';
import {
  FEE_STRUCTURE_SHEET_NAME,
  UNIFIED_HEADERS,
  FIXED_HEADERS,
  DUE_ANCHOR_LABELS,
  APPLIES_TO_LABELS,
  DATE_HEADERS,
  type FeeAppliesTo,
  type ScheduleDueAnchor,
} from '@/lib/utils/mappings/fee-structure-excel-mappings';
import { loadActiveFeeCategories } from '@/lib/services/admission/fee-structure-bulk-lookups';
// The same mirror the on-screen editor uses for its "Amount" column, so the
// rupee figures in the sheet and on the screen come from one implementation.
import { computeInstalmentAmounts } from '@/lib/services/billing/instalments/instalment-plan-service';

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
    // Only used to ORDER the fee rows now — the categories are rows, not
    // columns, on the unified tab.
    const categoryOrder = cats.map((c) => c.category_name);

    let q = supabase.from('admission_fee_structures').select(`
      id, gender, name, status, notes, effective_from, effective_to, package_type,
      institution:institutions(name), degree:degrees(degree_name),
      department:departments(department_name), programme:programs(program_name),
      quota:quotas(name), admission_year:admission_years(admission_year_name),
      accommodation:accommodation_types(name),
      hostel_category:hostel_categories(name),
      mess_category:mess_categories(name),
      communities:admission_fee_structure_communities(community_category:community_categories(name)),
      default_due_offset_days,
      items:admission_fee_structure_items(
        amount, applies_to, applies_year_of_study,
        schedule_mode, due_anchor, due_offset_days, due_date, promotes_to_status_code,
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
    const sheet = wb.addWorksheet(FEE_STRUCTURE_SHEET_NAME);
    // yyyy-mm-dd on the date columns: the export writes ISO text, but the
    // moment an operator types over one Excel makes it a date serial formatted
    // to their locale. Stamping the column keeps written and typed dates
    // looking identical. See DATE_HEADERS.
    sheet.columns = UNIFIED_HEADERS.map((h) => ({
      header: h,
      key: h,
      width: Math.max(16, h.length + 2),
      ...(DATE_HEADERS.has(h) ? { style: { numFmt: 'yyyy-mm-dd' } } : {}),
    }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    // Freeze the header AND the identity columns: with the fee and instalment
    // columns 20 places to the right, scrolling to them otherwise loses sight of
    // which structure the row belongs to. xSplit 4 keeps ID + Institution +
    // Degree + Department on screen.
    sheet.views = [{ state: 'frozen', xSplit: 4, ySplit: 1 }];

    for (const s of (data ?? []) as any[]) {
      // Repeated verbatim on every row of this structure. That repetition is
      // the price of one grain, and it is what lets any single row be read,
      // filtered and sorted without reference to the rows above it.
      const structureCells: Record<string, string | number> = {
        'Fee Structure ID': s.id,
        Institution: s.institution?.name ?? '', Degree: s.degree?.degree_name ?? '',
        Department: s.department?.department_name ?? '', Programme: s.programme?.program_name ?? '',
        'Admission Year': s.admission_year?.admission_year_name ?? '', Quota: s.quota?.name ?? '',
        Gender: s.gender ?? '', Accommodation: s.accommodation?.name ?? '',
        // Only hostel structures carry a tier; a blank here on a day-scholar
        // row round-trips correctly through the importer.
        'Room Category': s.hostel_category?.name ?? '',
        'Mess Category': s.mess_category?.name ?? '',
        Communities: (s.communities ?? []).map((c: any) => c.community_category?.name).filter(Boolean).join(', '),
        Name: s.name, Status: s.status,
        'Effective From': s.effective_from ?? '', 'Effective To': s.effective_to ?? '', Notes: s.notes ?? '',
        'Default Due (Days)': s.default_due_offset_days ?? 30,
        // Blank = unclassified. Written as the label the UI shows, not the
        // stored code.
        'Package Type':
          s.package_type === 'package' ? 'Package'
          : s.package_type === 'non_package' ? 'Non-Package'
          : '',
      };

      const items = [...(s.items ?? [])].sort((a: any, b: any) => {
        // Catalog order, so a structure's fees read the same way every export;
        // unknown categories sort last rather than first.
        const rank = (x: any) => {
          const i = categoryOrder.indexOf(x.billing_category?.category_name);
          return i < 0 ? Number.MAX_SAFE_INTEGER : i;
        };
        return rank(a) - rank(b);
      });

      // A structure with no fee items still gets one row, or it would vanish
      // from its own export and re-importing the file would not find it.
      if (items.length === 0) {
        sheet.addRow({ ...structureCells });
        continue;
      }

      for (const it of items) {
        const category = it.billing_category?.category_name;
        if (!category) continue;

        // Written as the LABEL the picker and the dropdown show, never the
        // stored code — the importer accepts both, but a round-trip that hands
        // back 'first_year_only' teaches the operator the wrong vocabulary.
        const appliesTo = (it.applies_to ?? 'every_year') as FeeAppliesTo;
        const feeCells = {
          ...structureCells,
          'Fee Category': category,
          Amount: Number(it.amount),
          'Applies To': APPLIES_TO_LABELS[appliesTo] ?? APPLIES_TO_LABELS.every_year,
          // Blank on every fee that is not year-specific, mirroring
          // afsi_applies_year_chk — an exported year next to "Every year" would
          // fail its own re-import.
          'Year of Study':
            appliesTo === 'specific_year' ? (it.applies_year_of_study ?? '') : '',
        };

        // The EFFECTIVE anchor, not the stored one. A split item's instalments
        // carry their own dates, so a stored 'fixed_date' there points at
        // nothing — the RPC self-heals it to 'generation_date' on the next
        // write, and the importer rejects it as a contradiction. Exporting the
        // raw value would make an UNTOUCHED export fail to re-import, which is
        // the one property this sheet cannot afford to lose.
        const storedAnchor = (it.due_anchor ?? 'generation_date') as ScheduleDueAnchor;
        const effectiveAnchor: ScheduleDueAnchor =
          it.schedule_mode === 'split' && storedAnchor === 'fixed_date'
            ? 'generation_date'
            : storedAnchor;
        const anchorLabel =
          DUE_ANCHOR_LABELS[effectiveAnchor] ?? DUE_ANCHOR_LABELS.generation_date;

        const lines = [...(it.schedules ?? [])].sort(
          (a: any, b: any) => a.sequence_no - b.sequence_no,
        );

        if (it.schedule_mode === 'split' && lines.length > 0) {
          // What each instalment actually bills. null when the split does not
          // fit the amount (a 0-rupee item, or fixed amounts that overrun it) —
          // the same condition the SQL engine treats as malformed, so leaving
          // the cell blank is the honest answer rather than a made-up figure.
          const amounts = computeInstalmentAmounts(Number(it.amount), lines);
          lines.forEach((l: any, i: number) => {
            sheet.addRow({
              ...feeCells,
              'Instalment #': l.sequence_no,
              'Share %': l.share_percent == null ? '' : Number(l.share_percent),
              'Fixed Amount': l.fixed_amount == null ? '' : Number(l.fixed_amount),
              'Amount (ref)': amounts?.[i] ?? '',
              'Due Anchor': anchorLabel,
              'Due After (Days)': l.due_offset_days ?? '',
              'Due Date': l.due_date ?? '',
              'Promotes To': l.promotes_to_status_code ?? '',
            });
          });
          continue;
        }

        sheet.addRow({
          ...feeCells,
          // Blank = the whole fee, paid in one go.
          'Instalment #': '',
          'Share %': '',
          'Fixed Amount': '',
          'Amount (ref)': Number(it.amount),
          'Due Anchor': anchorLabel,
          'Due After (Days)': it.due_offset_days ?? '',
          'Due Date': it.due_date ?? '',
          'Promotes To': it.promotes_to_status_code ?? '',
        });
      }
    }

    // ~950 rows: without a filter this is unusable for "find the 12 rows I care
    // about". Covers the header row through the last row written.
    if (sheet.rowCount > 1) {
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: UNIFIED_HEADERS.length } };
    }

    // Banding by structure. 950 rows of repeated identity columns are hard to
    // read as blocks; alternating the fill per STRUCTURE (not per row) makes
    // "these four rows are one fee structure" visible at a glance, which is the
    // one thing the long layout costs and this cheaply gives back.
    let shade = false;
    let previousId: string | null = null;
    const idColumn = FIXED_HEADERS.indexOf('Fee Structure ID') + 1;
    sheet.eachRow((r, n) => {
      if (n === 1) return;
      const id = String(r.getCell(idColumn).value ?? '');
      if (id !== previousId) { shade = !shade; previousId = id; }
      if (shade) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });

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
