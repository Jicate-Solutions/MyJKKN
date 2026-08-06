export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/hr/attendance/import/template
// ----------------------------------------------------------------------------
// Downloadable .xlsx template for the biometric punch importer.
//
// Three sheets:
//   1. "Attendance Import"  — the sheet the importer actually reads. Headers in
//      the exact positions the parser expects, plus sample rows showing that one
//      row = one punch (several punches per person per day is normal).
//   2. "Instructions"       — column meanings and the rules that decide whether
//      a row lands.
//   3. "Valid Employee Ids" — every staff code the importer can match, with
//      whether it will actually import. This sheet exists because the single
//      biggest cause of a failed import is a device export whose Employee Id
//      does not equal staff.staff_id — the only identity bridge there is.
//
// Same admin gate as the importer itself: the Employee-Id sheet is staff PII.
// ============================================================================

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { fetchProfileRoles } from '@/lib/hr/fetch-profile-roles';

const SHEET_NAME = 'Attendance Import';
const HEADERS = ['Employee Id', 'Employee Name', 'Biometric Integration Id', 'Date/Time'];

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF2563EB' },
};
const SAMPLE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFBEB' },
};

export async function GET() {
  try {
    const session = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await session.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Sign in to download the template.' },
        { status: 401 },
      );
    }

    const { data: isAdmin, error: gateErr } = await session.rpc('is_admin');
    if (gateErr) {
      console.error('[hr/attendance/import/template] admin gate error:', gateErr);
      return NextResponse.json({ error: 'Authorization check failed' }, { status: 500 });
    }
    if (isAdmin !== true) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Only HR administrators can download the biometric import template.',
        },
        { status: 403 },
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MyJKKN';
    wb.created = new Date();

    // ---- Sheet 1: the sheet the importer reads ------------------------------
    const ws = wb.addWorksheet(SHEET_NAME);
    ws.columns = [
      { key: 'code', width: 18 },
      { key: 'name', width: 30 },
      { key: 'bio', width: 24 },
      { key: 'dt', width: 24 },
    ];

    const header = ws.addRow(HEADERS);
    header.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    header.fill = HEADER_FILL;
    header.height = 22;
    header.alignment = { vertical: 'middle' };

    // Two people, one with four punches on one day (in / lunch out / lunch in /
    // out) and one with a single morning punch — both are valid shapes.
    const samples: Array<[string, string, string, string]> = [
      ['CET233', 'Manuneethi Arasu', '1042', '12/08/2026 09:03:14'],
      ['CET233', 'Manuneethi Arasu', '1042', '12/08/2026 13:01:52'],
      ['CET233', 'Manuneethi Arasu', '1042', '12/08/2026 13:58:07'],
      ['CET233', 'Manuneethi Arasu', '1042', '12/08/2026 16:35:41'],
      ['DCH110', 'Mullai T', '2087', '12/08/2026 08:57:02'],
    ];
    for (const s of samples) {
      const r = ws.addRow(s);
      r.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
      r.fill = SAMPLE_FILL;
      // Text format on Date/Time so Excel does not silently re-interpret it.
      r.getCell(4).numFmt = '@';
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: 'D1' };

    // ---- Sheet 2: instructions ----------------------------------------------
    const info = wb.addWorksheet('Instructions');
    info.columns = [{ width: 26 }, { width: 96 }];

    const addInfo = (a: string, b: string, bold = false) => {
      const r = info.addRow([a, b]);
      r.font = { name: 'Arial', size: 10, bold };
      r.alignment = { vertical: 'top', wrapText: true };
      return r;
    };

    const title = info.addRow(['Biometric punch import — how this file is read', '']);
    title.font = { name: 'Arial', size: 13, bold: true };
    info.addRow([]);

    addInfo('Sheet name', `Data must be on a sheet named "${SHEET_NAME}". If absent, the first sheet is used.`);
    addInfo('Row 1', 'Header row. Always skipped.');
    addInfo('One row = one punch', 'Do NOT pre-aggregate. Import groups by (Employee Id, date) and keeps the earliest punch as IN and the latest as OUT.');
    addInfo('File type / size', '.xlsx only. Maximum 10 MB.');
    info.addRow([]);

    const colHdr = addInfo('COLUMN', 'MEANING', true);
    colHdr.font = { name: 'Arial', size: 10, bold: true };
    addInfo('A — Employee Id', 'REQUIRED. Must equal the staff member\'s Employee Id in MyJKKN (staff.staff_id). Matched case-insensitively. A row whose code matches no staff member is reported as "unmatched" and not imported. See the "Valid Employee Ids" sheet.');
    addInfo('B — Employee Name', 'Optional, display only. NEVER used for matching — device exports carry "Mr."/"Dr." prefixes that do not match MyJKKN records.');
    addInfo('C — Biometric Integration Id', 'Optional. Currently NOT read by the importer; the column exists so raw device exports paste in unchanged. Matching is on column A only.');
    addInfo('D — Date/Time', 'REQUIRED. Format DD/MM/YYYY HH:MM:SS, read as IST. A real Excel date cell also works. Rows with an unreadable value are reported and skipped.');
    info.addRow([]);

    const rulesHdr = addInfo('WHAT GETS IMPORTED', '', true);
    rulesHdr.font = { name: 'Arial', size: 10, bold: true };
    addInfo('Only faculty and HOD', 'Staff whose MyJKKN profile role is not "faculty" or "hod" are listed in the report and SKIPPED. This currently excludes most non-teaching staff.');
    addInfo('One row per person per day', 'Re-importing the same day overwrites it — biometric is the system of record.');
    addInfo('Never removes attendance', 'Import only records present days. It never marks anyone absent and never deletes an existing day.');
    addInfo('No lateness yet', 'This importer stamps PRESENT for any day with at least one punch. It does not yet compare punches against the configured shift timings, so late / half-day is not derived here.');

    // ---- Sheet 3: valid employee ids ----------------------------------------
    const svc = createServiceRoleClient();
    const { data: staffRows, error: staffErr } = await svc
      .from('staff')
      .select('staff_id, first_name, last_name, profile_id, institution_id')
      .not('staff_id', 'is', null)
      .limit(5000);

    if (staffErr) {
      console.error('[hr/attendance/import/template] staff lookup error:', staffErr);
      return NextResponse.json(
        { error: 'Staff lookup failed', message: staffErr.message },
        { status: 500 },
      );
    }

    // Chunked: a single .in() with all ~863 staff profile ids builds a ~32 KB
    // query string and PostgREST answers a bare `{ message: 'Bad Request' }`.
    const profileIds = [
      ...new Set((staffRows ?? []).map((s) => s.profile_id).filter(Boolean)),
    ] as string[];
    let roleByProfile: Map<string, string | null>;
    try {
      roleByProfile = await fetchProfileRoles(svc, profileIds);
    } catch (profErr) {
      console.error('[hr/attendance/import/template] profile lookup error:', profErr);
      return NextResponse.json(
        {
          error: 'Profile lookup failed',
          message: profErr instanceof Error ? profErr.message : 'Could not load staff roles.',
        },
        { status: 500 },
      );
    }

    const { data: institutions, error: instErr } = await svc
      .from('institutions')
      .select('id, name')
      .limit(500);
    if (instErr) {
      console.error('[hr/attendance/import/template] institution lookup error:', instErr);
      return NextResponse.json(
        { error: 'Institution lookup failed', message: instErr.message },
        { status: 500 },
      );
    }
    const instName = new Map<string, string>();
    for (const i of institutions ?? []) instName.set(i.id, i.name);

    const ref = wb.addWorksheet('Valid Employee Ids');
    ref.columns = [
      { key: 'code', width: 18 },
      { key: 'name', width: 32 },
      { key: 'inst', width: 42 },
      { key: 'role', width: 20 },
      { key: 'imp', width: 18 },
    ];
    const refHeader = ref.addRow([
      'Employee Id',
      'Staff Name',
      'Institution',
      'Profile Role',
      'Will import?',
    ]);
    refHeader.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    refHeader.fill = HEADER_FILL;
    refHeader.height = 22;

    const FACULTY_ROLES = new Set(['faculty', 'hod']);
    const sorted = (staffRows ?? [])
      .filter((s) => String(s.staff_id ?? '').trim() !== '')
      .sort((a, b) => String(a.staff_id).localeCompare(String(b.staff_id)));

    for (const s of sorted) {
      const role = s.profile_id ? (roleByProfile.get(s.profile_id) ?? null) : null;
      const importable = role !== null && FACULTY_ROLES.has(role.toLowerCase());
      const full = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
      const r = ref.addRow([
        s.staff_id,
        full || '—',
        (s.institution_id ? instName.get(s.institution_id) : null) ?? '—',
        role ?? '—',
        importable ? 'Yes' : 'No — role skipped',
      ]);
      r.font = { name: 'Arial', size: 10, color: { argb: 'FF374151' } };
      if (!importable) r.getCell(5).font = { name: 'Arial', size: 10, color: { argb: 'FFB91C1C' } };
    }
    ref.views = [{ state: 'frozen', ySplit: 1 }];
    ref.autoFilter = { from: 'A1', to: 'E1' };

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="biometric-attendance-import-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[hr/attendance/import/template] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Template generation failed', message }, { status: 500 });
  }
}
