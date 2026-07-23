export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import ExcelJS from 'exceljs';

/**
 * POST /api/hr/recruitment-need/approvals/import
 *
 * Imports institution program approval rows from an uploaded .xlsx file.
 * Resolves institution_name -> id, body_abbreviation -> id, program_name -> id.
 * Inserts into institution_program_approvals.
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
  if (v instanceof Date) return v.toISOString().split('T')[0];
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

    // Parse file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!file.name.endsWith('.xlsx')) return NextResponse.json({ error: 'Only .xlsx files accepted' }, { status: 400 });
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: 'File exceeds 5 MB limit' }, { status: 400 });

    const buf = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buf);

    const ws = workbook.getWorksheet('Approvals');
    if (!ws) return NextResponse.json({ error: 'Missing "Approvals" sheet' }, { status: 400 });

    // Parse rows
    const rawRows: {
      rowNum: number;
      institutionName: string;
      programName: string;
      bodyAbbr: string;
      sanctionedCount: number;
      approvedIntake: number | null;
      approvalDate: string;
      renewalDueDate: string;
      approvalRef: string;
    }[] = [];
    const errors: ImportError[] = [];
    let totalRows = 0;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      totalRows++;
      if (totalRows > 1000) {
        errors.push({ row: rowNumber, message: 'Exceeded 1000 row limit' });
        return;
      }

      const institutionName = cellStr(row.getCell(1));
      const programName = cellStr(row.getCell(2));
      const bodyAbbr = cellStr(row.getCell(3));
      const sanctionedCount = cellNum(row.getCell(4));
      const approvedIntake = cellNum(row.getCell(5));
      const approvalDate = cellStr(row.getCell(6));
      const renewalDueDate = cellStr(row.getCell(7));
      const approvalRef = cellStr(row.getCell(8));

      if (!institutionName && !programName) return; // blank row

      if (!institutionName) {
        errors.push({ row: rowNumber, field: 'institution_name', message: `Row ${rowNumber}: Institution Name is required` });
        return;
      }
      if (!programName) {
        errors.push({ row: rowNumber, field: 'program_name', message: `Row ${rowNumber}: Program Name is required` });
        return;
      }
      if (!bodyAbbr) {
        errors.push({ row: rowNumber, field: 'body_abbreviation', message: `Row ${rowNumber}: Body Abbreviation is required` });
        return;
      }
      if (sanctionedCount === null || sanctionedCount < 0) {
        errors.push({ row: rowNumber, field: 'sanctioned_faculty_count', message: `Row ${rowNumber}: Sanctioned Faculty Count must be >= 0` });
        return;
      }

      // Validate date formats if provided
      if (approvalDate && !/^\d{4}-\d{2}-\d{2}$/.test(approvalDate)) {
        errors.push({ row: rowNumber, field: 'approval_date', message: `Row ${rowNumber}: Approval Date must be YYYY-MM-DD` });
        return;
      }
      if (renewalDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(renewalDueDate)) {
        errors.push({ row: rowNumber, field: 'renewal_due_date', message: `Row ${rowNumber}: Renewal Due Date must be YYYY-MM-DD` });
        return;
      }

      rawRows.push({
        rowNum: rowNumber,
        institutionName,
        programName,
        bodyAbbr,
        sanctionedCount,
        approvedIntake,
        approvalDate,
        renewalDueDate,
        approvalRef,
      });
    });

    if (rawRows.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false, imported: 0, errorCount: errors.length, totalRows, errors,
      }, { status: 400 });
    }

    // ── Resolve institution names ───────────────────────────────────
    const uniqueInstNames = [...new Set(rawRows.map((r) => r.institutionName))];
    const { data: instRows } = await supabase
      .from('institutions')
      .select('id, name')
      .in('name', uniqueInstNames);

    const instMap: Record<string, string> = {};
    for (const inst of (instRows ?? [])) {
      instMap[inst.name.toLowerCase()] = inst.id;
    }

    // ── Resolve body abbreviations ──────────────────────────────────
    const uniqueBodies = [...new Set(rawRows.map((r) => r.bodyAbbr.toUpperCase()))];
    const { data: bodyRows } = await supabase
      .from('hr_regulatory_bodies')
      .select('id, abbreviation');

    const bodyMap: Record<string, string> = {};
    for (const b of (bodyRows ?? [])) {
      bodyMap[b.abbreviation.toUpperCase()] = b.id;
    }

    // ── Resolve program names (per institution) ─────────────────────
    // Fetch all programs for matched institutions
    const instIds = Object.values(instMap);
    const { data: progRows } = instIds.length > 0
      ? await supabase.from('programs').select('id, name, institution_id').in('institution_id', instIds)
      : { data: [] as any[] };

    // Build composite key: inst_id + program_name_lower -> program_id
    const progMap: Record<string, string> = {};
    for (const p of (progRows ?? [])) {
      progMap[`${p.institution_id}::${p.name.toLowerCase()}`] = p.id;
    }

    // ── Build inserts ───────────────────────────────────────────────
    const inserts: any[] = [];
    for (const r of rawRows) {
      const instId = instMap[r.institutionName.toLowerCase()];
      if (!instId) {
        errors.push({ row: r.rowNum, field: 'institution_name', message: `Row ${r.rowNum}: Institution "${r.institutionName}" not found` });
        continue;
      }

      const bodyId = bodyMap[r.bodyAbbr.toUpperCase()];
      if (!bodyId) {
        errors.push({ row: r.rowNum, field: 'body_abbreviation', message: `Row ${r.rowNum}: Body "${r.bodyAbbr}" not found` });
        continue;
      }

      const progId = progMap[`${instId}::${r.programName.toLowerCase()}`];
      if (!progId) {
        errors.push({ row: r.rowNum, field: 'program_name', message: `Row ${r.rowNum}: Program "${r.programName}" not found under institution` });
        continue;
      }

      inserts.push({
        institution_id: instId,
        program_id: progId,
        body_id: bodyId,
        sanctioned_faculty_count: r.sanctionedCount,
        approved_intake: r.approvedIntake,
        approval_date: r.approvalDate || null,
        renewal_due_date: r.renewalDueDate || null,
        approval_reference: r.approvalRef || null,
        is_active: true,
      });
    }

    if (inserts.length === 0) {
      return NextResponse.json<ImportResult>({
        success: false, imported: 0, errorCount: errors.length, totalRows, errors,
      }, { status: 400 });
    }

    // Insert
    const { data: inserted, error: insertErr } = await supabase
      .from('institution_program_approvals')
      .insert(inserts)
      .select('id');

    if (insertErr) {
      console.error('[approvals/import] Insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to insert approvals', message: insertErr.message }, { status: 500 });
    }

    return NextResponse.json<ImportResult>({
      success: true,
      imported: inserted?.length ?? 0,
      errorCount: errors.length,
      totalRows,
      errors,
    });
  } catch (error) {
    console.error('[approvals/import] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Failed to import approvals', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
