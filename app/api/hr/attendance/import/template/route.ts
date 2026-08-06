export const dynamic = 'force-dynamic';

// ============================================================================
// GET /api/hr/attendance/import/template
// ----------------------------------------------------------------------------
// A worked sample of the format the importer reads — the machine's own
// "Monthly Performance Report", not a shape we invented. HR should upload the
// device file unchanged; this exists to show what "unchanged" must look like,
// and to document the two fields that have to be configured on the machine.
// Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
//
// Sheet 3 lists the enrolment codes currently linked to staff, so a mismatch
// between machine and MyJKKN can be spotted before an import rather than after.
// That sheet is staff PII, hence the same admin gate as the importer.
// ============================================================================

import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

const SHEET = 'Monthly_Performance_Report';
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
const SAMPLE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };

export async function GET() {
  try {
    const session = await createClient();
    const { data: { user }, error: authErr } = await session.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in to download the sample.' }, { status: 401 });
    }
    const [{ data: isAdmin }, { data: canOverride }] = await Promise.all([
      session.rpc('is_admin'),
      session.rpc('user_has_permission', { permission_name: 'hr.attendance.override' }),
    ]);
    if (isAdmin !== true && canOverride !== true) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You need Override Attendance Records to download this.' },
        { status: 403 },
      );
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'MyJKKN';
    wb.created = new Date();

    // ---- Sheet 1: the shape the parser reads --------------------------------
    const ws = wb.addWorksheet(SHEET);
    ws.getColumn(1).width = 14;
    for (let c = 2; c <= 32; c++) ws.getColumn(c).width = 8;

    const blank = (n: number) => Array.from({ length: n }, () => '');
    const days = Array.from({ length: 31 }, (_, i) => String(i + 1));
    // 2026-07-01 was a Wednesday.
    const DOW = ['Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue'];
    const dows = Array.from({ length: 31 }, (_, i) => DOW[i % 7]);

    const addBlock = (code: string, name: string, inT: string, outT: string, work: string) => {
      const h = ws.addRow(['Dept. Name', '', 'MO', ...blank(8), 'CompName', ...blank(3),
        'JKKN Main Office', ...blank(10), 'Report Month', '', '', 'July-2026']);
      h.font = { name: 'Arial', size: 10, bold: true };

      const m = ws.addRow(['Empcode', '', code, '', '', '', 'Name', '', name, ...blank(6),
        'Present', '', '27', 'WO', '0', 'Absent', '', '4', 'Total Work', '', '', '212:30', '', 'Total OT', '', '20:50']);
      m.font = { name: 'Arial', size: 10, bold: true };

      ws.addRow(['', ...days]).font = { name: 'Arial', size: 9, bold: true };
      ws.addRow(['', ...dows]).font = { name: 'Arial', size: 9 };

      const mk = (label: string, val: (i: number) => string) => {
        const r = ws.addRow(['', ...Array.from({ length: 31 }, (_, i) => val(i))]);
        r.getCell(1).value = label;
        r.font = { name: 'Arial', size: 9 };
        r.fill = SAMPLE_FILL;
        return r;
      };
      // Sundays (index 4, 11, 18, 25) carry no punch.
      const isSun = (i: number) => dows[i] === 'Sun';
      mk('IN', (i) => (isSun(i) ? '--:--' : inT));
      mk('OUT', (i) => (isSun(i) ? '--:--' : outT));
      mk('WORK', (i) => (isSun(i) ? '00:00' : work));
      mk('Break', () => '00:00');
      mk('OT', () => '00:00');
      mk('Status', (i) => (isSun(i) ? 'A' : 'P'));
    };

    addBlock('00002', 'Gunasekaran S', '08:58', '17:32', '08:30');
    addBlock('605', 'Saveetha K', '09:01', '17:30', '08:29');

    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 0 }];

    // ---- Sheet 2: instructions ---------------------------------------------
    const info = wb.addWorksheet('Instructions');
    info.columns = [{ width: 30 }, { width: 100 }];
    const title = info.addRow(['Biometric monthly report — how this file is read', '']);
    title.font = { name: 'Arial', size: 13, bold: true };
    info.addRow([]);
    const add = (a: string, b: string, bold = false) => {
      const r = info.addRow([a, b]);
      r.font = { name: 'Arial', size: 10, bold };
      r.alignment = { vertical: 'top', wrapText: true };
    };

    add('CONFIGURE THE MACHINE', '', true);
    add('Dept. Name', 'Set to the institution CODE (MO, DCH, CET, COP, CAS, CNR, AHS, NV, MATRIC, COE, JS). This is how the file says which machine it came from.');
    add('CompName', 'Set to the institution\'s full name. Used to break a tie when a code is shared — "CAS" belongs to both Arts and Science (Self) and (Aided).');
    info.addRow([]);

    add('UPLOAD THE FILE UNCHANGED', '', true);
    add('Format', 'Either .xls or .xlsx, exactly as the machine exports it. Do not reshape, unmerge or re-sort it.');
    add('Layout', '10 rows per employee: a Dept. Name row, an Empcode row, a day-number row, a weekday row, then IN / OUT / WORK / Break / OT / Status.');
    add('Sheet name', `"${SHEET}", or the first sheet if that name is absent.`);
    add('No punch', 'Printed as --:-- and read as "no punch".');
    info.addRow([]);

    add('WHAT MyJKKN DOES WITH IT', '', true);
    add('Identity', 'Empcode is matched to a staff member using the links set on the Biometric Mapping page. Names are never matched — the machine drops the honorifics MyJKKN stores. An unlinked code imports nothing.');
    add('The verdict is ours', 'Present / half day / absent is recomputed from IN and OUT against the configured shift timings. The machine\'s own P/A is stored beside it but never used in its place — the machines have no weekly off set and mark every Sunday Absent.');
    add('Half days', 'A half counts only if the person was on site across the whole of it: in at or before its start (plus grace, morning only) and out at or after its end.');
    add('Lateness', 'Recorded in minutes and flagged. It does not cost the day.');
    add('Single punch', 'A day with only one punch cannot be judged and is raised as an attendance exception for regularization. The machine files a lone evening punch under IN, so it cannot be read as an arrival.');
    add('Re-importing', 'Safe. The same month overwrites cleanly — the biometric record is the system of record.');

    // ---- Sheet 3: enrolment codes currently linked ---------------------------
    const svc = createServiceRoleClient();
    const [{ data: staffRows, error: staffErr }, { data: insts, error: instErr }] = await Promise.all([
      svc.from('staff')
        .select('staff_id, first_name, last_name, biometric_id, biometric_institution_id, institution_id')
        .not('biometric_id', 'is', null)
        .limit(5000),
      svc.from('institutions').select('id, name, counselling_code').limit(500),
    ]);
    if (staffErr) {
      console.error('[import/template] staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Staff lookup failed', message: staffErr.message }, { status: 500 });
    }
    if (instErr) {
      console.error('[import/template] institution lookup error:', instErr);
      return NextResponse.json({ error: 'Institution lookup failed', message: instErr.message }, { status: 500 });
    }
    const instById = new Map<string, { name: string; code: string | null }>();
    for (const i of (insts ?? []) as Array<{ id: string; name: string; counselling_code: string | null }>) {
      instById.set(i.id, { name: i.name, code: i.counselling_code });
    }

    const ref = wb.addWorksheet('Linked Codes');
    ref.columns = [{ width: 16 }, { width: 14 }, { width: 34 }, { width: 18 }, { width: 40 }];
    const rh = ref.addRow(['Machine (code)', 'Empcode', 'Staff Name', 'MyJKKN Staff Id', "Staff's Institution"]);
    rh.font = { bold: true, size: 11, name: 'Arial', color: { argb: 'FFFFFFFF' } };
    rh.fill = HEADER_FILL;
    rh.height = 22;

    type SRow = {
      staff_id: string | null; first_name: string | null; last_name: string | null;
      biometric_id: string | null; biometric_institution_id: string | null; institution_id: string | null;
    };
    const linked = ((staffRows ?? []) as SRow[]).sort((a, b) =>
      String(a.biometric_institution_id).localeCompare(String(b.biometric_institution_id)) ||
      String(a.biometric_id).localeCompare(String(b.biometric_id)));

    if (linked.length === 0) {
      const r = ref.addRow(['—', '—', 'No enrolment codes linked yet. Use HR › Admin › Biometric Mapping.', '—', '—']);
      r.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFB91C1C' } };
    } else {
      for (const s of linked) {
        const machine = s.biometric_institution_id ? instById.get(s.biometric_institution_id) : undefined;
        const own = s.institution_id ? instById.get(s.institution_id) : undefined;
        const r = ref.addRow([
          machine?.code ?? machine?.name ?? '—',
          s.biometric_id ?? '—',
          [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '—',
          s.staff_id ?? '—',
          own?.name ?? '—',
        ]);
        r.font = { name: 'Arial', size: 10, color: { argb: 'FF374151' } };
      }
    }
    ref.views = [{ state: 'frozen', ySplit: 1 }];
    ref.autoFilter = { from: 'A1', to: 'E1' };

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="biometric-monthly-report-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[import/template] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Template generation failed', message }, { status: 500 });
  }
}
