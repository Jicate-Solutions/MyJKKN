export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/hr/payroll/salaries/import
// ----------------------------------------------------------------------------
// Load the "Salary data import" workbook into hr_staff_salaries.
//
// TWO MODES, ONE CODE PATH. dryRun=true runs everything except the writes and
// returns the same verdict the commit will act on, so the preview can never
// disagree with what happens next. Copied deliberately from the biometric
// importer, where that property is what makes the preview trustworthy.
//
// UNMATCHED IDS ARE SKIPPED, NOT FATAL. 10 of the 62 codes in the reference
// file match no staff record; the instruction was to import the matched ones
// and leave the rest. They come back as an acknowledgeable block so the commit
// still has to be confirmed, rather than a silent partial success.
//
// EXCLUDED CATEGORIES ARE SKIPPED THE SAME WAY. employment_categories.
// included_in_hr gates the whole HR module, and the roster lookup below carries
// the flag so a code belonging to an Ayaah or a Driver is reported as
// 'not_in_hr' rather than silently taking a salary. Reported, not fatal — the
// rest of the file still imports.
//
// CLIENTS: the roster lookup uses the service role because it spans every
// employee in the file, not just the caller's own. Every WRITE goes through
// fn_hr_set_staff_salary on the SESSION client, so hr_staff_salaries_write
// enforces hr.payroll.salary.manage per row — a caller who somehow reached this
// route without the permission writes nothing.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { parseSalarySheet } from '@/lib/hr/payroll/parse-salary-sheet';
import {
  validateSalaryUpload,
  type SalaryStaffRow,
} from '@/lib/hr/payroll/validate-salary-upload';

const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await createClient();
    const { data: { user }, error: authErr } = await session.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in to continue.' }, { status: 401 });
    }

    const [{ data: isAdmin }, { data: canManage }] = await Promise.all([
      session.rpc('is_admin'),
      session.rpc('user_has_permission', { permission_name: 'hr.payroll.salary.manage' }),
    ]);
    if (isAdmin !== true && canManage !== true) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You need Manage Employee Salary to import salaries.' },
        { status: 403 },
      );
    }

    const form = await request.formData();
    const file = form.get('file') as File | null;
    const dryRun = String(form.get('dryRun') ?? '') === 'true';
    const acknowledge = String(form.get('acknowledge') ?? '') === 'true';
    const effectiveFrom = String(form.get('effectiveFrom') ?? '').trim();

    if (!file) {
      return NextResponse.json({ error: 'No file provided', message: 'Upload the salary workbook.' }, { status: 400 });
    }
    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      return NextResponse.json({ error: 'Invalid file type', message: 'Upload .xls or .xlsx.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large', message: 'File exceeds the 5 MB limit.' }, { status: 400 });
    }
    // Every row of the reference file has a blank Effective_Date, so the date
    // cannot come from the sheet. Asked for once and applied to rows that do
    // not carry their own, rather than defaulted to a guess like today.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      return NextResponse.json(
        { error: 'Effective date required', message: 'Pick the date this salary takes effect (YYYY-MM-DD).' },
        { status: 400 },
      );
    }

    const parsed = parseSalarySheet(new Uint8Array(await file.arrayBuffer()));
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        { error: 'No rows found', message: parsed.warnings[0] ?? 'No salary rows were readable.' },
        { status: 400 },
      );
    }

    const svc = createServiceRoleClient();

    // included_in_hr comes along for the ride. This lookup runs under the
    // SERVICE ROLE — it spans every employee in the file, so RLS is not the
    // enforcement point here and nothing else in this route would have stopped a
    // Driver's or an Ayaah's employee code resolving and taking a salary. The
    // read screen has been gated on v_hr_staff all along; this write path was
    // not, which is the half of the module that could still let an excluded
    // category in.
    //
    // A LEFT embed, not `!inner`: a staff row whose category_id is null must
    // still resolve so the verdict can name it, and it falls through to
    // included_in_hr = false below — the same way v_hr_staff's inner join
    // excludes it.
    const { data: staffRows, error: staffErr } = await svc
      .from('staff')
      .select(
        'id, staff_id, first_name, last_name, is_active, employment_categories ( included_in_hr )',
      )
      .limit(5000);
    if (staffErr) {
      console.error('[payroll/salaries/import] staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Staff lookup failed', message: staffErr.message }, { status: 500 });
    }

    const { data: payrollRows, error: payErr } = await svc
      .from('hr_staff_payroll')
      .select('staff_id, hr_organization_id')
      .limit(5000);
    if (payErr) {
      console.error('[payroll/salaries/import] payroll org lookup error:', payErr);
      return NextResponse.json({ error: 'Payroll organisation lookup failed', message: payErr.message }, { status: 500 });
    }
    const orgByStaff = new Map<string, string>();
    for (const p of (payrollRows ?? []) as Array<{ staff_id: string; hr_organization_id: string }>) {
      orgByStaff.set(p.staff_id, p.hr_organization_id);
    }

    const staff: SalaryStaffRow[] = (
      (staffRows ?? []) as Array<{
        id: string; staff_id: string | null; first_name: string | null;
        last_name: string | null; is_active: boolean | null;
        employment_categories:
          | { included_in_hr: boolean | null }
          | Array<{ included_in_hr: boolean | null }>
          | null;
      }>
    ).map(({ employment_categories, ...s }) => {
      // PostgREST returns a many-to-one embed as an object, but the generated
      // types widen it to an array often enough that both shapes are unwrapped
      // here rather than trusting one.
      const category = Array.isArray(employment_categories)
        ? employment_categories[0]
        : employment_categories;
      return {
        ...s,
        included_in_hr: category?.included_in_hr === true,
        hr_organization_id: orgByStaff.get(s.id) ?? null,
      };
    });

    // What each person earns today, so the preview can separate a real change
    // from a re-upload of the same file.
    const { data: currentRows } = await svc
      .from('hr_staff_salaries')
      .select('staff_id, monthly_gross')
      .is('superseded_by', null)
      .limit(5000);
    const currentByStaffId = new Map<string, number>();
    for (const c of (currentRows ?? []) as Array<{ staff_id: string; monthly_gross: number | string }>) {
      currentByStaffId.set(c.staff_id, Number(c.monthly_gross));
    }

    const validation = validateSalaryUpload({
      rows: parsed.rows,
      staff,
      currentByStaffId,
    });

    const base = {
      success: true,
      dry_run: dryRun,
      sheet_name: parsed.sheet_name,
      effective_from: effectiveFrom,
      parser_warnings: parsed.warnings,
      validation,
      written: 0,
      failures: [] as Array<{ employee_code: string; message: string }>,
    };

    if (dryRun) {
      return NextResponse.json(
        { ...base, message: `${validation.counts.importable} of ${validation.counts.total} row(s) ready to import.` },
        { status: 200 },
      );
    }

    if (!validation.can_import) {
      return NextResponse.json(
        { ...base, success: false, error: 'Import blocked', message: 'Resolve the blocking issues and upload again.' },
        { status: 400 },
      );
    }
    if (validation.requires_acknowledgement && !acknowledge) {
      return NextResponse.json(
        { ...base, success: false, error: 'Acknowledgement required',
          message: 'Some rows will be skipped. Confirm to continue.' },
        { status: 400 },
      );
    }

    // Written through the SESSION client, one row at a time. The RPC is
    // per-staff by nature — it supersedes the incumbent and inserts under a
    // per-staff advisory lock — and a per-row failure names the employee
    // instead of losing the whole batch.
    const byRow = new Map(parsed.rows.map((r) => [r.row_number, r]));
    let written = 0;
    const failures: Array<{ employee_code: string; message: string }> = [];

    for (const row of validation.rows) {
      if (!row.importable || !row.staff_uuid || !row.hr_organization_id) continue;
      const src = byRow.get(row.row_number);
      if (!src) continue;

      const { error } = await session.rpc('fn_hr_set_staff_salary', {
        p_staff_id: row.staff_uuid,
        p_hr_organization_id: row.hr_organization_id,
        p_monthly_gross: row.monthly_gross,
        p_effective_from: src.effective_from ?? effectiveFrom,
        p_salary_structure: src.salary_structure ?? 'Monthly',
        p_overtime_level: src.overtime_level ?? 'No overtime',
        p_overtime_amount: src.overtime_amount ?? 0,
        p_eligible_for_pf: src.eligible_for_pf,
        p_exempt_edli: src.exempt_edli,
        p_eligible_for_insurance: src.eligible_for_insurance,
        p_eligible_for_gratuity: src.eligible_for_gratuity,
        p_eligible_for_etf: src.eligible_for_etf,
        p_notes: null,
        // A blank amount cell imports as 0, not as "leave what is there". The
        // sheet is the whole record for the row it describes, and the RPC
        // supersedes rather than patches — a partial write would leave a figure
        // nobody can point at a source for.
        p_epf_amount: src.epf_amount ?? 0,
        p_eligible_for_esi: src.eligible_for_esi,
        p_esi_amount: src.esi_amount ?? 0,
        p_allowance_amount: src.allowance_amount ?? 0,
        p_allowance_label: src.allowance_label,
      });

      if (error) {
        failures.push({ employee_code: row.employee_code, message: error.message });
      } else {
        written += 1;
      }
    }

    return NextResponse.json(
      {
        ...base,
        written,
        failures,
        message:
          failures.length === 0
            ? `${written} salary record(s) imported.`
            : `${written} imported, ${failures.length} failed.`,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[payroll/salaries/import] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Import failed', message }, { status: 500 });
  }
}
