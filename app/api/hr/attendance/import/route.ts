export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/hr/attendance/import
// ----------------------------------------------------------------------------
// Biometric punch importer for the attendance-reconciliation engine (spec §16).
// Upload the biometric export (.xlsx) → parse punches → match Employee Id to a
// faculty/hod → upsert one PRESENT day per (profile, date) into
// faculty_attendance_days (source='biometric'). Biometric is the system of
// record, so it wins on conflict (a real punch supersedes any prior work_signal
// reconciliation).
//
// TWO MODES, ONE CODE PATH (2026-08-06):
//   dryRun=true   parse + match + classify, return the preview and every error,
//                 write NOTHING. Drives the wizard's Preview and Validate steps.
//   dryRun=false  same work, then upsert. Drives Submit.
// The modes deliberately share every line up to the write, so what the user
// approves in the preview is exactly what gets committed.
//
// Identity bridge = staff.staff_id (the file carries NO email — spec §16).
//   Employee Id  ->  staff.staff_id  ->  staff.profile_id  ->  profiles.role
// Match on the CODE, never the name (file names carry "Mr." prefixes).
// Matching is case-insensitive: the parser uppercases the file's code, and a
// handful of staff.staff_id values are not stored uppercase, so an exact
// .in('staff_id', codes) silently missed them. The staff table is small
// (<1000 rows), so we load it once and index it by UPPER(staff_id) — which also
// avoids a large .in() list blowing the PostgREST URL length limit.
//
// Auth: admin/super-admin only (matches faculty_attendance_days RLS). The write
// uses the service-role client because the table has no INSERT policy (writes
// are service-role-only by design), so we gate explicitly BEFORE writing.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { fetchProfileRoles } from '@/lib/hr/fetch-profile-roles';

const IST_OFFSET = '+05:30';
const SHEET_NAME = 'Attendance Import';
/** Cap on rows shipped to the browser for the preview table. */
const PREVIEW_LIMIT = 500;

interface DayPunch {
  code: string;
  name: string;
  workDate: string; // YYYY-MM-DD (IST calendar day)
  inIso: string;    // earliest punch, IST
  outIso: string;   // latest punch, IST
  inMs: number;
  outMs: number;
  inDisp: string;   // HH:MM:SS
  outDisp: string;  // HH:MM:SS
  punches: number;
}

interface SkippedStaff {
  code: string;
  name: string;
  role: string | null;
  days: number;
}

/** A row the parser could not use. Row numbers are 1-based as Excel shows them. */
interface RowError {
  row: number;
  reason: string;
  value?: string;
}

type DayStatus = 'ok' | 'skipped_role' | 'unmatched';

interface PreviewRow {
  code: string;
  file_name: string;
  staff_name: string | null;
  role: string | null;
  work_date: string;
  in_time: string;
  out_time: string;
  punches: number;
  status: DayStatus;
}

interface ImportReport {
  success: boolean;
  dry_run: boolean;

  // File-level
  total_rows: number;
  total_punches: number;
  parse_errors: RowError[];
  parse_errors_truncated: boolean;

  // Grouped to punch-days
  employees_in_file: number;
  total_punch_days: number;
  date_from: string | null;
  date_to: string | null;

  // Classification
  ok_days: number;
  skipped_role_days: number;
  unmatched_days: number;
  preview: PreviewRow[];
  preview_truncated: boolean;
  non_faculty_skipped: SkippedStaff[];
  unmatched_codes: string[];

  // Commit only
  loaded: number;
  faculty_matched: number;
  message?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Parse a biometric Date/Time cell into an IST calendar day + instant.
 * The export format is DD/MM/YYYY HH:MM:SS in IST. ExcelJS may hand us a JS
 * Date (built from the Excel serial, whose UTC components equal the sheet's
 * displayed wall clock) OR a raw string — handle both, always treating the
 * wall clock as IST.
 */
function parsePunch(
  v: ExcelJS.CellValue,
): { workDate: string; iso: string; ms: number; disp: string } | null {
  if (v === null || v === undefined) return null;

  let y: number, mo: number, d: number, h: number, mi: number, s: number;

  if (v instanceof Date) {
    y = v.getUTCFullYear();
    mo = v.getUTCMonth() + 1;
    d = v.getUTCDate();
    h = v.getUTCHours();
    mi = v.getUTCMinutes();
    s = v.getUTCSeconds();
  } else {
    const raw =
      typeof v === 'object' && v !== null && 'text' in v
        ? String((v as { text: unknown }).text ?? '')
        : String(v);
    const m = raw
      .trim()
      .match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    d = Number(m[1]);
    mo = Number(m[2]);
    y = Number(m[3]);
    h = Number(m[4] ?? 0);
    mi = Number(m[5] ?? 0);
    s = Number(m[6] ?? 0);
  }

  if (!y || !mo || !d) return null;
  const workDate = `${y}-${pad(mo)}-${pad(d)}`;
  const disp = `${pad(h)}:${pad(mi)}:${pad(s)}`;
  const iso = `${workDate}T${disp}${IST_OFFSET}`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return { workDate, iso, ms, disp };
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell?.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text ?? '').trim();
  return String(v).trim();
}

export async function POST(request: NextRequest) {
  try {
    // ---- Auth gate (explicit; never silent) --------------------------------
    const session = await createClient();
    const {
      data: { user },
      error: authErr
    } = await session.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in to import.' }, { status: 401 });
    }
    const { data: isAdmin, error: gateErr } = await session.rpc('is_admin');
    if (gateErr) {
      console.error('[hr/attendance/import] admin gate error:', gateErr);
      return NextResponse.json({ error: 'Authorization check failed' }, { status: 500 });
    }
    if (isAdmin !== true) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Only HR administrators can import biometric attendance.' },
        { status: 403 }
      );
    }

    // ---- File ---------------------------------------------------------------
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const dryRun = String(formData.get('dryRun') ?? '') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided', message: 'Upload the biometric .xlsx export.' }, { status: 400 });
    }
    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'Invalid file type', message: 'Only .xlsx exports are accepted.' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large', message: 'File exceeds the 10 MB limit.' }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const ws = workbook.getWorksheet(SHEET_NAME) ?? workbook.worksheets[0];
    if (!ws) {
      return NextResponse.json({ error: 'Empty workbook', message: 'No sheet found in the file.' }, { status: 400 });
    }

    // ---- Parse: one row = one punch; group by (code, date) -----------------
    // Columns: 1=Employee Id, 2=Employee Name, 3=Biometric Integration Id, 4=Date/Time
    const dayMap = new Map<string, DayPunch>(); // key: code|date
    const nameByCode = new Map<string, string>();
    const parseErrors: RowError[] = [];
    let totalPunches = 0;
    let totalRows = 0;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      totalRows++;

      const code = cellStr(row.getCell(1)).toUpperCase();
      const name = cellStr(row.getCell(2));
      const rawDt = row.getCell(4)?.value;
      const punch = parsePunch(rawDt);

      // Fully blank rows are trailing padding, not errors — ignore silently.
      if (!code && !name && (rawDt === null || rawDt === undefined || cellStr(row.getCell(4)) === '')) {
        totalRows--;
        return;
      }

      if (!code) {
        parseErrors.push({ row: rowNumber, reason: 'Employee Id is empty' });
        return;
      }
      if (!punch) {
        parseErrors.push({
          row: rowNumber,
          reason: 'Date/Time is missing or not DD/MM/YYYY HH:MM:SS',
          value: cellStr(row.getCell(4)) || '(blank)',
        });
        return;
      }

      totalPunches++;
      if (name && !nameByCode.has(code)) nameByCode.set(code, name);

      const key = `${code}|${punch.workDate}`;
      const existing = dayMap.get(key);
      if (!existing) {
        dayMap.set(key, {
          code,
          name,
          workDate: punch.workDate,
          inIso: punch.iso,
          outIso: punch.iso,
          inMs: punch.ms,
          outMs: punch.ms,
          inDisp: punch.disp,
          outDisp: punch.disp,
          punches: 1
        });
      } else {
        existing.punches++;
        if (punch.ms < existing.inMs) { existing.inMs = punch.ms; existing.inIso = punch.iso; existing.inDisp = punch.disp; }
        if (punch.ms > existing.outMs) { existing.outMs = punch.ms; existing.outIso = punch.iso; existing.outDisp = punch.disp; }
      }
    });

    const dayPunches = [...dayMap.values()];
    if (dayPunches.length === 0) {
      return NextResponse.json(
        {
          error: 'No punches found',
          message:
            parseErrors.length > 0
              ? `No readable punch rows. ${parseErrors.length} row(s) failed to parse — check that Employee Id is in column A and Date/Time in column D.`
              : 'The file has no readable punch rows (expected Employee Id + Date/Time).'
        },
        { status: 400 }
      );
    }

    // ---- Resolve codes -> profile (service role, admin-gated) ---------------
    // Load the whole staff table once and index by UPPER(staff_id). See the
    // header comment: this is both the case-insensitivity fix and the reason we
    // no longer pass a potentially huge .in() list.
    const svc = createServiceRoleClient();
    const codes = [...new Set(dayPunches.map((d) => d.code))];

    const { data: staffRows, error: staffErr } = await svc
      .from('staff')
      .select('staff_id, first_name, last_name, profile_id')
      .not('staff_id', 'is', null)
      .limit(5000);
    if (staffErr) {
      console.error('[hr/attendance/import] staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Staff lookup failed', message: staffErr.message }, { status: 500 });
    }

    const profileByCode = new Map<string, string>();
    const staffNameByCode = new Map<string, string>();
    for (const s of staffRows ?? []) {
      const key = String(s.staff_id ?? '').trim().toUpperCase();
      if (!key) continue;
      if (s.profile_id && !profileByCode.has(key)) profileByCode.set(key, s.profile_id);
      if (!staffNameByCode.has(key)) {
        staffNameByCode.set(key, [s.first_name, s.last_name].filter(Boolean).join(' ').trim());
      }
    }

    // Chunked: a month-wide export can carry several hundred codes, and a
    // single .in() with that many uuids overflows the PostgREST URL length and
    // returns a bare `{ message: 'Bad Request' }`.
    const profileIds = [...new Set(codes.map((c) => profileByCode.get(c)).filter(Boolean))] as string[];
    let roleByProfile: Map<string, string | null>;
    try {
      roleByProfile = await fetchProfileRoles(svc, profileIds);
    } catch (profErr) {
      console.error('[hr/attendance/import] profile lookup error:', profErr);
      return NextResponse.json(
        {
          error: 'Profile lookup failed',
          message: profErr instanceof Error ? profErr.message : 'Could not load staff roles.'
        },
        { status: 500 }
      );
    }

    // ---- Classify each punch-day -------------------------------------------
    const FACULTY_ROLES = new Set(['faculty', 'hod']);
    const unmatchedCodes = new Set<string>();
    const nonFaculty = new Map<string, SkippedStaff>();
    const facultyMatched = new Set<string>();
    const upserts: Array<Record<string, unknown>> = [];
    const preview: PreviewRow[] = [];
    const nowIso = new Date().toISOString();

    let okDays = 0;
    let skippedRoleDays = 0;
    let unmatchedDays = 0;
    let dateFrom: string | null = null;
    let dateTo: string | null = null;

    // Stable order so the preview reads like the file: person, then date.
    dayPunches.sort((a, b) => a.code.localeCompare(b.code) || a.workDate.localeCompare(b.workDate));

    for (const day of dayPunches) {
      if (!dateFrom || day.workDate < dateFrom) dateFrom = day.workDate;
      if (!dateTo || day.workDate > dateTo) dateTo = day.workDate;

      const profileId = profileByCode.get(day.code);
      const role = profileId ? (roleByProfile.get(profileId) ?? null) : null;

      let status: DayStatus;
      if (!profileId) {
        status = 'unmatched';
        unmatchedDays++;
        unmatchedCodes.add(day.code);
      } else if (!role || !FACULTY_ROLES.has(role.toLowerCase())) {
        status = 'skipped_role';
        skippedRoleDays++;
        const s =
          nonFaculty.get(day.code) ??
          { code: day.code, name: nameByCode.get(day.code) ?? day.name, role, days: 0 };
        s.days += 1;
        nonFaculty.set(day.code, s);
      } else {
        status = 'ok';
        okDays++;
        facultyMatched.add(profileId);
        upserts.push({
          profile_id: profileId,
          work_date: day.workDate,
          status_code: 'PRESENT',
          source: 'biometric',
          in_at: day.inIso,
          out_at: day.outIso,
          updated_at: nowIso
        });
      }

      if (preview.length < PREVIEW_LIMIT) {
        preview.push({
          code: day.code,
          file_name: day.name || (nameByCode.get(day.code) ?? ''),
          staff_name: staffNameByCode.get(day.code) || null,
          role,
          work_date: day.workDate,
          in_time: day.inDisp,
          out_time: day.outDisp,
          punches: day.punches,
          status
        });
      }
    }

    const baseReport: ImportReport = {
      success: true,
      dry_run: dryRun,
      total_rows: totalRows,
      total_punches: totalPunches,
      parse_errors: parseErrors.slice(0, PREVIEW_LIMIT),
      parse_errors_truncated: parseErrors.length > PREVIEW_LIMIT,
      employees_in_file: codes.length,
      total_punch_days: dayPunches.length,
      date_from: dateFrom,
      date_to: dateTo,
      ok_days: okDays,
      skipped_role_days: skippedRoleDays,
      unmatched_days: unmatchedDays,
      preview,
      preview_truncated: dayPunches.length > PREVIEW_LIMIT,
      non_faculty_skipped: [...nonFaculty.values()].sort((a, b) => a.code.localeCompare(b.code)),
      unmatched_codes: [...unmatchedCodes].sort(),
      loaded: 0,
      faculty_matched: facultyMatched.size
    };

    // ---- Dry run stops here — nothing is written ---------------------------
    if (dryRun) {
      return NextResponse.json(
        {
          ...baseReport,
          message: `${okDays} punch-day(s) ready to import for ${facultyMatched.size} employee(s).`
        },
        { status: 200 }
      );
    }

    // ---- Upsert biometric days (biometric wins on conflict) ----------------
    let loaded = 0;
    if (upserts.length > 0) {
      const { data: inserted, error: upErr } = await svc
        .from('faculty_attendance_days')
        .upsert(upserts, { onConflict: 'profile_id,work_date' })
        .select('id');
      if (upErr) {
        console.error('[hr/attendance/import] upsert error:', upErr);
        return NextResponse.json({ error: 'Import write failed', message: upErr.message }, { status: 500 });
      }
      loaded = inserted?.length ?? upserts.length;
    }

    return NextResponse.json(
      {
        ...baseReport,
        loaded,
        message: `Loaded ${loaded} faculty/hod punch-day(s) for ${facultyMatched.size} employee(s).`
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[hr/attendance/import] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Import failed', message }, { status: 500 });
  }
}
