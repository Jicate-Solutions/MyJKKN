export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/hr/attendance/import
// ----------------------------------------------------------------------------
// Biometric punch importer for the attendance-reconciliation engine (spec §16).
// Upload the biometric export (.xlsx) → parse punches → match Employee Id to a
// faculty/hod → upsert one PRESENT day per (profile, date) into
// faculty_attendance_days (source='biometric'). Biometric is the system of
// record, so it wins on conflict (a real punch supersedes any prior work_signal
// reconciliation). Returns a report: loaded / non-faculty-skipped / unmatched.
//
// Identity bridge = staff.staff_id (the file carries NO email — spec §16).
//   Employee Id  ->  staff.staff_id  ->  staff.profile_id  ->  profiles.role
// Match on the CODE, never the name (file names carry "Mr." prefixes).
//
// Auth: admin/super-admin only (matches faculty_attendance_days RLS). The write
// uses the service-role client because the table has no INSERT policy (writes
// are service-role-only by design), so we gate explicitly BEFORE writing.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const IST_OFFSET = '+05:30';
const SHEET_NAME = 'Attendance Import';

interface DayPunch {
  code: string;
  name: string;
  workDate: string; // YYYY-MM-DD (IST calendar day)
  inIso: string;    // earliest punch, IST
  outIso: string;   // latest punch, IST
  inMs: number;
  outMs: number;
}

interface SkippedStaff {
  code: string;
  name: string;
  role: string | null;
  days: number;
}

interface ImportReport {
  success: boolean;
  total_punches: number;
  total_punch_days: number;
  employees_in_file: number;
  loaded: number;            // faculty/hod punch-days upserted
  faculty_matched: number;   // distinct faculty/hod matched
  non_faculty_skipped: SkippedStaff[];
  unmatched_codes: string[];
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
function parsePunch(v: ExcelJS.CellValue): { workDate: string; iso: string; ms: number } | null {
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
  const iso = `${workDate}T${pad(h)}:${pad(mi)}:${pad(s)}${IST_OFFSET}`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return { workDate, iso, ms };
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
    let totalPunches = 0;

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // header
      const code = cellStr(row.getCell(1)).toUpperCase();
      const name = cellStr(row.getCell(2));
      const punch = parsePunch(row.getCell(4)?.value);
      if (!code || !punch) return;

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
          outMs: punch.ms
        });
      } else {
        if (punch.ms < existing.inMs) { existing.inMs = punch.ms; existing.inIso = punch.iso; }
        if (punch.ms > existing.outMs) { existing.outMs = punch.ms; existing.outIso = punch.iso; }
      }
    });

    const dayPunches = [...dayMap.values()];
    if (dayPunches.length === 0) {
      return NextResponse.json(
        { error: 'No punches found', message: 'The file has no readable punch rows (expected Employee Id + Date/Time).' },
        { status: 400 }
      );
    }

    // ---- Resolve codes -> faculty/hod profile (service role, admin-gated) ---
    const svc = createServiceRoleClient();
    const codes = [...new Set(dayPunches.map((d) => d.code))];

    const { data: staffRows, error: staffErr } = await svc
      .from('staff')
      .select('staff_id, profile_id')
      .in('staff_id', codes);
    if (staffErr) {
      console.error('[hr/attendance/import] staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Staff lookup failed', message: staffErr.message }, { status: 500 });
    }

    const profileIds = [...new Set((staffRows ?? []).map((s) => s.profile_id).filter(Boolean))] as string[];
    const { data: profileRows, error: profErr } = profileIds.length
      ? await svc.from('profiles').select('id, role').in('id', profileIds)
      : { data: [] as { id: string; role: string | null }[], error: null };
    if (profErr) {
      console.error('[hr/attendance/import] profile lookup error:', profErr);
      return NextResponse.json({ error: 'Profile lookup failed', message: profErr.message }, { status: 500 });
    }

    const roleByProfile = new Map<string, string | null>();
    for (const p of profileRows ?? []) roleByProfile.set(p.id, p.role);
    // code -> profile_id (first staff row wins; codes are unique in practice)
    const profileByCode = new Map<string, string>();
    for (const s of staffRows ?? []) {
      if (s.profile_id && !profileByCode.has(s.staff_id)) profileByCode.set(s.staff_id, s.profile_id);
    }

    // ---- Classify each code -------------------------------------------------
    const FACULTY_ROLES = new Set(['faculty', 'hod']);
    const unmatchedCodes = new Set<string>();
    const nonFaculty = new Map<string, SkippedStaff>();
    const facultyMatched = new Set<string>();
    const upserts: Array<Record<string, unknown>> = [];
    const nowIso = new Date().toISOString();

    for (const day of dayPunches) {
      const profileId = profileByCode.get(day.code);
      if (!profileId) {
        unmatchedCodes.add(day.code);
        continue;
      }
      const role = roleByProfile.get(profileId) ?? null;
      if (!role || !FACULTY_ROLES.has(role)) {
        const s = nonFaculty.get(day.code) ?? { code: day.code, name: nameByCode.get(day.code) ?? day.name, role, days: 0 };
        s.days += 1;
        nonFaculty.set(day.code, s);
        continue;
      }
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

    const report: ImportReport = {
      success: true,
      total_punches: totalPunches,
      total_punch_days: dayPunches.length,
      employees_in_file: codes.length,
      loaded,
      faculty_matched: facultyMatched.size,
      non_faculty_skipped: [...nonFaculty.values()].sort((a, b) => a.code.localeCompare(b.code)),
      unmatched_codes: [...unmatchedCodes].sort(),
      message: `Loaded ${loaded} faculty/hod punch-day(s) for ${facultyMatched.size} employee(s).`
    };
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    console.error('[hr/attendance/import] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Import failed', message }, { status: 500 });
  }
}
