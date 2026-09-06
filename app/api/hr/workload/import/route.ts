export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import ExcelJS from 'exceljs';

/**
 * POST /api/hr/workload/import
 *
 * Imports faculty workload rows from an uploaded .xlsx file.
 * Resolves staff_email -> staff.id via staff JOIN profiles.
 * Inserts into hr_faculty_workload with source='manual'.
 */

interface ImportError {
  row: number;
  field?: string;
  message: string;
}

interface ImportResult {
  success: boolean;
  imported: number;
  errorCount: number;
  totalRows: number;
  errors: ImportError[];
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  try {
    // Auth
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) { return cookieStore.get(name)?.value; },
          set(name: string, value: string, options: CookieOptions) {
            try { cookieStore.set({ name, value, ...options }); } catch {}
          },
          remove(name: string, options: CookieOptions) {
            try { cookieStore.set({ name, value: '', ...options }); } catch {}
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse multipart
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Only .xlsx files are accepted' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 400 });
    }

    // Read workbook
    const buf = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    const ws = workbook.getWorksheet('Workload');
    if (!ws) {
      return NextResponse.json({ error: 'Missing "Workload" sheet' }, { status: 400 });
    }

    // Collect rows (skip header)
    const rows: { rowNum: number; email: string; year: string; semester: number; contact: number; admin: number | null; research: number | null; notes: string }[] = [];
    const errors: ImportError[] = [];
    let totalRows = 0;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      totalRows++;

      if (totalRows > 1000) {
        errors.push({ row: rowNumber, message: 'Exceeded 1000 row limit' });
        return;
      }

      const email = cellStr(row.getCell(1)).toLowerCase();
      const year = cellStr(row.getCell(2));
      const semesterRaw = cellNum(row.getCell(3));
      const contact = cellNum(row.getCell(4));
      const admin = cellNum(row.getCell(5));
      const research = cellNum(row.getCell(6));
      const notes = cellStr(row.getCell(7));

      // Skip blank rows
      if (!email && !year) return;

      // Validate required fields
      if (!email) {
        errors.push({ row: rowNumber, field: 'staff_email', message: `Row ${rowNumber}: Staff Email is required` });
        return;
      }
      if (!year || !/^\d{4}-\d{4}$/.test(year)) {
        errors.push({ row: rowNumber, field: 'academic_year', message: `Row ${rowNumber}: Academic Year must be YYYY-YYYY format` });
        return;
      }
      if (semesterRaw !== 1 && semesterRaw !== 2) {
        errors.push({ row: rowNumber, field: 'semester', message: `Row ${rowNumber}: Semester must be 1 or 2` });
        return;
      }
      if (contact === null || contact < 0) {
        errors.push({ row: rowNumber, field: 'weekly_contact_hours', message: `Row ${rowNumber}: Weekly Contact Hours is required and must be >= 0` });
        return;
      }

      rows.push({ rowNum: rowNumber, email, year, semester: semesterRaw, contact, admin, research, notes });
    });

    if (rows.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false, imported: 0, errorCount: errors.length, totalRows, errors,
      }, { status: 400 });
    }

    // Resolve emails -> staff IDs
    const uniqueEmails = [...new Set(rows.map((r) => r.email))];

    // Look up profiles by email first, then find staff by profile_id
    const { data: profileRows, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email')
      .in('email', uniqueEmails);

    if (profileErr) {
      console.error('[hr/workload/import] Profile lookup error:', profileErr);
      return NextResponse.json({ error: 'Failed to resolve staff emails', message: profileErr.message }, { status: 500 });
    }

    const profileIds = (profileRows ?? []).map((p) => p.id);
    const emailByProfileId: Record<string, string> = {};
    for (const p of (profileRows ?? [])) {
      emailByProfileId[p.id] = p.email.toLowerCase();
    }

    // Find staff rows matching those profile_ids
    const { data: staffRows, error: staffErr } = profileIds.length > 0
      ? await supabase.from('staff').select('id, institution_id, profile_id').in('profile_id', profileIds)
      : { data: [] as any[], error: null };

    if (staffErr) {
      console.error('[hr/workload/import] Staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Failed to resolve staff records', message: staffErr.message }, { status: 500 });
    }

    // Build email -> { staff_id, institution_id } map
    const emailMap: Record<string, { staff_id: string; institution_id: string }> = {};
    for (const s of (staffRows ?? [])) {
      const email = emailByProfileId[s.profile_id];
      if (email) {
        emailMap[email] = { staff_id: s.id, institution_id: s.institution_id };
      }
    }

    // Build insert payloads
    const inserts: any[] = [];
    for (const r of rows) {
      const match = emailMap[r.email];
      if (!match) {
        errors.push({ row: r.rowNum, field: 'staff_email', message: `Row ${r.rowNum}: No staff found for email "${r.email}"` });
        continue;
      }

      inserts.push({
        staff_id: match.staff_id,
        institution_id: match.institution_id,
        academic_year: r.year,
        semester: r.semester,
        weekly_contact_hours: r.contact,
        weekly_admin_hours: r.admin,
        weekly_research_hours: r.research,
        source: 'manual',
        entered_by: user.id,
        notes: r.notes || null,
      });
    }

    if (inserts.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false, imported: 0, errorCount: errors.length, totalRows, errors,
      }, { status: 400 });
    }

    // Insert
    const { data: inserted, error: insertErr } = await supabase
      .from('hr_faculty_workload')
      .insert(inserts)
      .select('id');

    if (insertErr) {
      console.error('[hr/workload/import] Insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to insert workload rows', message: insertErr.message }, { status: 500 });
    }

    return NextResponse.json<ImportResult>({
      success: true,
      imported: inserted?.length ?? 0,
      errorCount: errors.length,
      totalRows,
      errors,
    });
  } catch (error) {
    console.error('[hr/workload/import] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to import workload', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
