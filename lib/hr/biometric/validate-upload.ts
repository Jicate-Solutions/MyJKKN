/**
 * Pre-commit validation for a biometric monthly-report upload.
 * Created: 2026-08-07.
 * Spec: docs/superpowers/specs/2026-08-07-biometric-import-validation-design.md
 *
 * Pure and synchronous so scripts/biometric-parser.test.ts exercises it with no
 * database.
 *
 * TWO PHASES. Everything decidable from the file plus the roster is phase 1
 * (validateUpload). The reconciliation block is only knowable once every day of
 * every matched employee has been evaluated, so it arrives in phase 2
 * (finaliseValidation) — which is also the ONLY place can_import is decided, so
 * no caller can read a half-formed verdict.
 *
 * NAME MATCHING CLASSIFIES, IT NEVER IMPORTS. normPersonName reaches 36 of 48 on
 * the real July export; lib/hr/biometric/normalize-name.ts explains why that is
 * fine for a suggestion a human reviews and not fine for attributing a month of
 * attendance. unlinked_match and ambiguous_match are ALWAYS importable:false —
 * only a stored enrolment code makes a row importable.
 */
import { normBiometricCode } from './normalize-code';
import { normPersonName } from './normalize-name';
import type { BiometricEmployee } from './parse-monthly-report';
import type {
  BiometricBlock,
  BiometricEmployeeValidation,
  BiometricUploadValidation,
  BiometricWarning,
} from '@/types/hr-biometric';

/** A bad month can name hundreds of people; cap what each block carries. */
const DETAIL_LIMIT = 50;

export interface ValidationStaffRow {
  id: string;
  staff_id: string | null;
  first_name: string | null;
  last_name: string | null;
  institution_id: string | null;
  biometric_id: string | null;
  biometric_institution_id: string | null;
}

function fullName(s: ValidationStaffRow): string {
  return [s.first_name, s.last_name].filter(Boolean).join(' ').trim() || '(no name)';
}

export function validateUpload(input: {
  employees: BiometricEmployee[];
  /** FULL roster — needed to tell "not our employee" from "not linked yet". */
  staff: ValidationStaffRow[];
  machineInstitutionId: string;
  organisationByInstitution: Map<string, string>;
}): BiometricUploadValidation {
  const { employees, staff, machineInstitutionId, organisationByInstitution } = input;

  const byId = new Map<string, ValidationStaffRow>();
  for (const s of staff) byId.set(s.id, s);

  // Codes enrolled on THIS machine only: an enrolment number means nothing
  // apart from the machine that issued it.
  const staffByCode = new Map<string, ValidationStaffRow>();
  for (const s of staff) {
    if (s.biometric_institution_id !== machineInstitutionId) continue;
    const key = normBiometricCode(s.biometric_id);
    if (key && !staffByCode.has(key)) staffByCode.set(key, s);
  }

  // Name index — classification only, never a write path.
  const byName = new Map<string, string[]>();
  for (const s of staff) {
    const key = normPersonName([s.first_name, s.last_name].filter(Boolean).join(' '));
    if (!key) continue;
    const list = byName.get(key);
    if (list) list.push(s.id);
    else byName.set(key, [s.id]);
  }

  // Duplicates are grouped on the NORMALISED key. Comparing raw strings would
  // read '0017' and '017' as two people right up until Postgres rejected them.
  const blocksByCode = new Map<string, BiometricEmployee[]>();
  const invalid: BiometricEmployee[] = [];
  for (const emp of employees) {
    const key = normBiometricCode(emp.code);
    if (!key) { invalid.push(emp); continue; }
    const list = blocksByCode.get(key);
    if (list) list.push(emp);
    else blocksByCode.set(key, [emp]);
  }
  const duplicates = [...blocksByCode.entries()].filter(([, l]) => l.length > 1);

  const rows: BiometricEmployeeValidation[] = employees.map((emp) => {
    const key = normBiometricCode(emp.code);
    const linked = key ? (staffByCode.get(key) ?? null) : null;

    if (linked) {
      return {
        code: emp.code, normalised_code: key, device_name: emp.name,
        match: 'linked', staff_uuid: linked.id, staff_name: fullName(linked),
        staff_code: linked.staff_id, candidate_count: 1,
        importable: true, reason: null,
      };
    }

    const hits = byName.get(normPersonName(emp.name)) ?? [];

    if (hits.length === 1) {
      const s = byId.get(hits[0]);
      return {
        code: emp.code, normalised_code: key, device_name: emp.name,
        match: 'unlinked_match', staff_uuid: s ? s.id : null,
        staff_name: s ? fullName(s) : null, staff_code: s ? s.staff_id : null,
        candidate_count: 1, importable: false,
        reason: 'In the staff table, but this enrolment code is not linked yet. Link it in the Link codes step.',
      };
    }

    if (hits.length > 1) {
      return {
        code: emp.code, normalised_code: key, device_name: emp.name,
        match: 'ambiguous_match', staff_uuid: null, staff_name: null,
        staff_code: null, candidate_count: hits.length, importable: false,
        reason: `${hits.length} staff members share this name — link this code manually.`,
      };
    }

    return {
      code: emp.code, normalised_code: key, device_name: emp.name,
      match: 'absent', staff_uuid: null, staff_name: null, staff_code: null,
      candidate_count: 0, importable: false,
      reason: 'No staff record matches this person. They will not be imported.',
    };
  });

  const counts = {
    total: rows.length,
    importable: rows.filter((r) => r.importable).length,
    unlinked_match: rows.filter((r) => r.match === 'unlinked_match').length,
    ambiguous_match: rows.filter((r) => r.match === 'ambiguous_match').length,
    absent: rows.filter((r) => r.match === 'absent').length,
  };

  const blocks: BiometricBlock[] = [];

  if (duplicates.length > 0) {
    blocks.push({
      kind: 'duplicate_code_in_file',
      severity: 'hard',
      count: duplicates.length,
      message:
        `${duplicates.length} enrolment code(s) appear more than once in this file. ` +
        'Attendance is stored per employee per day, so one person\'s month would overwrite the other\'s.',
      detail: duplicates.slice(0, DETAIL_LIMIT).map(
        ([key, list]) => `code ${key}: ${list.map((e) => `${e.code} (${e.name || 'no name'})`).join(' , ')}`,
      ),
    });
  }

  if (invalid.length > 0) {
    blocks.push({
      kind: 'invalid_code_in_file',
      severity: 'hard',
      count: invalid.length,
      message: `${invalid.length} employee block(s) have a blank or unreadable enrolment code and cannot be attributed to anyone.`,
      detail: invalid.slice(0, DETAIL_LIMIT).map((e) => e.name || '(no name)'),
    });
  }

  if (counts.importable === 0) {
    blocks.push({
      kind: 'zero_importable',
      severity: 'hard',
      count: rows.length,
      message:
        `None of the ${rows.length} employee(s) in this file are linked to a staff record, ` +
        'so this import would write nothing. Link the codes first.',
      detail: [],
    });
  }

  const unknown = rows.filter((r) => r.match === 'absent' || r.match === 'ambiguous_match');
  if (unknown.length > 0) {
    blocks.push({
      kind: 'unknown_staff_present',
      severity: 'acknowledgeable',
      count: unknown.length,
      message: `${unknown.length} person(s) in this file have no usable staff record and will be excluded from the import.`,
      detail: unknown.slice(0, DETAIL_LIMIT).map((r) => `${r.code} · ${r.device_name || '(no name)'}`),
    });
  }

  const warnings: BiometricWarning[] = [];
  const importableRows = rows.filter((r) => r.importable);

  // UNIQUE(staff_id) permits unlimited NULLs, so "unique" does not imply
  // "present" — 198 of 864 staff have none.
  const noCode = importableRows.filter((r) => !r.staff_code || r.staff_code.trim() === '');
  if (noCode.length > 0) {
    warnings.push({
      kind: 'missing_staff_code',
      count: noCode.length,
      message: `${noCode.length} employee(s) being imported have no staff ID on their record.`,
      detail: noCode.slice(0, DETAIL_LIMIT).map((r) => `${r.code} · ${r.staff_name ?? r.device_name}`),
    });
  }

  // hr_attendance_records.hr_organization_id is NOT NULL, so these days are
  // dropped mid-write and only counted afterwards. Say so before the commit.
  const noOrg = importableRows.filter((r) => {
    const s = r.staff_uuid ? byId.get(r.staff_uuid) : null;
    if (!s) return false;
    return !s.institution_id || !organisationByInstitution.has(s.institution_id);
  });
  if (noOrg.length > 0) {
    warnings.push({
      kind: 'missing_organisation',
      count: noOrg.length,
      message:
        `${noOrg.length} employee(s) belong to an institution with no HR organization. ` +
        'Their day records cannot be stored and will be skipped.',
      detail: noOrg.slice(0, DETAIL_LIMIT).map((r) => `${r.code} · ${r.staff_name ?? r.device_name}`),
    });
  }

  return {
    employees: rows,
    counts,
    blocks,
    warnings,
    // Placeholders. finaliseValidation is the only place these are decided.
    can_import: false,
    requires_acknowledgement: false,
  };
}

export function finaliseValidation(
  validation: BiometricUploadValidation,
  unreconciled: Array<{ code: string; name: string }>,
): BiometricUploadValidation {
  const blocks = [...validation.blocks];

  if (unreconciled.length > 0) {
    blocks.push({
      kind: 'unreconciled_totals',
      severity: 'acknowledgeable',
      count: unreconciled.length,
      message:
        `${unreconciled.length} employee(s) do not reconcile against the machine's own ` +
        'Present/Absent totals. The expected weekly-off flip is already accounted for, so this is a genuine disagreement.',
      detail: unreconciled.slice(0, DETAIL_LIMIT).map((u) => `${u.code} · ${u.name || '(no name)'}`),
    });
  }

  return {
    ...validation,
    blocks,
    can_import: !blocks.some((b) => b.severity === 'hard'),
    requires_acknowledgement: blocks.some((b) => b.severity === 'acknowledgeable'),
  };
}
