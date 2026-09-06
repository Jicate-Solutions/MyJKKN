export const dynamic = 'force-dynamic';

// ============================================================================
// POST /api/hr/biometric-mapping/suggest
// ----------------------------------------------------------------------------
// Reads a biometric export and proposes a staff match for each enrolment code,
// for a human to confirm. Writes nothing.
// Plan: docs/superpowers/plans/2026-08-06-biometric-attendance-ingestion.md
//
// Suggestions come from honorific-stripped name comparison and are offered ONLY
// when exactly one staff member matches. Measured on the real July export that
// resolves 36 of 48 with zero ambiguity — good enough to review, deliberately
// not good enough to trust unattended, which is why import-time matching uses
// the stored code and never the name.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { parseMonthlyReportFile } from '@/lib/hr/biometric/parse-monthly-report';
import { resolveInstitutionFromReport } from '@/lib/hr/biometric/resolve-institution';
import { normBiometricCode } from '@/lib/hr/biometric/normalize-code';
import { normPersonName } from '@/lib/hr/biometric/normalize-name';
import type {
  BiometricIdentityKind,
  BiometricMappingRow,
  BiometricStaffOption,
  BiometricSuggestResponse,
} from '@/types/hr-biometric';

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await session.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized', message: 'Sign in to continue.' }, { status: 401 });
    }

    const [{ data: isAdmin }, { data: canEditStaff }] = await Promise.all([
      session.rpc('is_admin'),
      session.rpc('user_has_permission', { permission_name: 'staff.edit' }),
    ]);
    if (isAdmin !== true && canEditStaff !== true) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You need Edit Staff to map biometric codes.' },
        { status: 403 },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided', message: 'Upload a machine export.' }, { status: 400 });
    }
    if (!/\.(xls|xlsx)$/i.test(file.name)) {
      return NextResponse.json({ error: 'Invalid file type', message: 'Upload .xls or .xlsx.' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large', message: 'File exceeds the 10 MB limit.' }, { status: 400 });
    }

    const report = parseMonthlyReportFile(new Uint8Array(await file.arrayBuffer()));
    if (report.employees.length === 0) {
      return NextResponse.json(
        { error: 'No employees found', message: report.warnings[0] ?? 'No employee blocks were readable.' },
        { status: 400 },
      );
    }

    const svc = createServiceRoleClient();

    const resolution = await resolveInstitutionFromReport(svc, report.institutionCode, report.institutionName);
    if (!resolution.institution) {
      return NextResponse.json(
        { error: 'Institution not identified', message: resolution.error, candidates: resolution.candidates },
        { status: 400 },
      );
    }
    const machine = resolution.institution;

    // Every staff member is a candidate: a machine routinely enrols people from
    // other institutions (13 of 36 on the real Main Office export).
    const { data: staffRows, error: staffErr } = await svc
      .from('staff')
      .select('id, staff_id, first_name, last_name, institution_id, biometric_id, biometric_institution_id, is_active')
      .limit(5000);
    if (staffErr) {
      console.error('[biometric-mapping/suggest] staff lookup error:', staffErr);
      return NextResponse.json({ error: 'Staff lookup failed', message: staffErr.message }, { status: 500 });
    }

    const { data: institutions, error: instErr } = await svc
      .from('institutions')
      .select('id, name')
      .limit(500);
    if (instErr) {
      console.error('[biometric-mapping/suggest] institution lookup error:', instErr);
      return NextResponse.json({ error: 'Institution lookup failed', message: instErr.message }, { status: 500 });
    }
    const instName = new Map<string, string>();
    for (const i of (institutions ?? []) as Array<{ id: string; name: string }>) instName.set(i.id, i.name);

    interface Row {
      id: string; staff_id: string | null; first_name: string | null; last_name: string | null;
      institution_id: string | null; biometric_id: string | null; biometric_institution_id: string | null;
      is_active: boolean | null;
    }
    const rows = (staffRows ?? []) as Row[];

    const staff: BiometricStaffOption[] = rows.map((s) => ({
      id: s.id,
      staff_id: s.staff_id,
      full_name: [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '(no name)',
      institution_id: s.institution_id,
      institution_name: s.institution_id ? (instName.get(s.institution_id) ?? null) : null,
      current_code: s.biometric_institution_id === machine.id ? s.biometric_id : null,
      other_machine: Boolean(s.biometric_id) && s.biometric_institution_id !== machine.id,
      is_active: s.is_active,
    }));

    const activeById = new Map<string, boolean | null>();
    for (const s of rows) activeById.set(s.id, s.is_active);

    // Name index — only unambiguous names become suggestions.
    const byName = new Map<string, string[]>();
    for (const s of rows) {
      const key = normPersonName([s.first_name, s.last_name].filter(Boolean).join(' '));
      if (!key) continue;
      const list = byName.get(key);
      if (list) list.push(s.id);
      else byName.set(key, [s.id]);
    }

    // Existing mappings on this machine, by normalised code.
    const mappedByCode = new Map<string, string>();
    for (const s of rows) {
      if (s.biometric_institution_id !== machine.id) continue;
      const key = normBiometricCode(s.biometric_id);
      if (key) mappedByCode.set(key, s.id);
    }

    let alreadyMapped = 0;
    let suggested = 0;

    // A machine never forgets an enrolment, so a monthly export carries everyone
    // who ever punched on it. Classifying identity separately from link state is
    // what tells HR "link this" apart from "this person is not ours" — the
    // second can never import however many times the file is re-uploaded.
    const mappingRows: BiometricMappingRow[] = report.employees.map((emp) => {
      const codeKey = normBiometricCode(emp.code);
      const mapped = codeKey ? (mappedByCode.get(codeKey) ?? null) : null;
      if (mapped) alreadyMapped++;

      const hits = mapped ? [] : (byName.get(normPersonName(emp.name)) ?? []);

      let suggestion: string | null = null;
      if (!mapped && hits.length === 1) {
        suggestion = hits[0];
        suggested++;
      }

      let identity: BiometricIdentityKind;
      if (mapped) identity = 'linked';
      else if (hits.length === 1) identity = 'name_match';
      else if (hits.length > 1) identity = 'ambiguous';
      else identity = 'not_in_myjkkn';

      const known = mapped ?? suggestion;

      return {
        code: emp.code,
        device_name: emp.name,
        mapped_staff_id: mapped,
        suggested_staff_id: suggestion,
        suggestion_reason: suggestion ? 'exact_name' : null,
        identity,
        name_candidates: hits.length,
        staff_is_active: known ? (activeById.get(known) ?? null) : null,
      };
    });

    const inMyjkkn = mappingRows.filter((r) => r.identity !== 'not_in_myjkkn');

    const body: BiometricSuggestResponse = {
      institution: {
        id: machine.id, name: machine.name,
        code: machine.counselling_code, matched_by: resolution.matchedBy,
      },
      month_label: report.monthLabel,
      rows: mappingRows,
      staff,
      warnings: report.warnings,
      roster: {
        total: rows.length,
        active: rows.filter((s) => s.is_active !== false).length,
      },
      counts: {
        total: mappingRows.length,
        already_mapped: alreadyMapped,
        suggested,
        unresolved: mappingRows.length - alreadyMapped - suggested,
        in_myjkkn: inMyjkkn.length,
        not_in_myjkkn: mappingRows.length - inMyjkkn.length,
        ambiguous: mappingRows.filter((r) => r.identity === 'ambiguous').length,
        inactive_staff: inMyjkkn.filter((r) => r.staff_is_active === false).length,
      },
    };

    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error('[biometric-mapping/suggest] unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: 'Suggestion failed', message }, { status: 500 });
  }
}
