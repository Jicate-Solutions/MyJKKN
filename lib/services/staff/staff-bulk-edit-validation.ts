/**
 * The ONE validator for staff bulk edit.
 *
 * Both /api/staff/bulk-edit/preview and /api/staff/bulk-edit/apply import and call this.
 * Neither route may inline a rule. In the learners' equivalent feature the preview route
 * imported its validator and never called it, so format errors first appeared AFTER the
 * write had run — exactly what a preview screen exists to prevent.
 *
 * Pure: no database access. The caller supplies every lookup through ValidationContext.
 */
import { validateEmail, validatePhone, parseFlexibleDate } from '@/lib/utils/staff-field-validators';
import { getLocationIdByFuzzyName, getLocationDisplayName } from '@/lib/data/locations';
import {
  EDITABLE_COLUMNS,
  GENDERS,
  MARITAL_STATUSES,
  BLOOD_GROUPS,
  type StaffEditableField
} from './staff-bulk-edit-columns';

export interface BulkEditIssue {
  field: string;
  message: string;
  kind: 'format' | 'record';
}

export interface StaffLookupRow {
  id: string;
  institution_id: string;
  institution_email: string;
  [field: string]: unknown;
}

export interface ParsedStaffRow {
  rowNumber: number;
  institutionEmail: string;
  /** keyed by template header */
  cells: Record<string, string>;
}

export interface ValidationContext {
  /** lower(btrim(institution_email)) -> staff row, already scoped to accessible institutions */
  staffByEmail: Map<string, StaffLookupRow>;
  /** institution_id -> (lowercased department name -> id) */
  departmentsByInstitution: Map<string, Map<string, string>>;
  /** lowercased category name -> id */
  categoriesByName: Map<string, string>;
  /** lowercased institution name -> id (ALL institutions: a machine may belong to another) */
  institutionsByName: Map<string, string>;
  /** lowercased personal email -> owning staff id */
  emailOwner: Map<string, string>;
  /** `${institution_id}|${normalisedCode}` -> owning staff id */
  biometricOwner: Map<string, string>;
  /**
   * id -> display name, for departments, employment categories and institutions.
   *
   * Not used for validation — the validator never reads it. It exists so the preview can
   * render "Biometric Machine: (empty) -> JKKN College of Pharmacy" instead of a bare UUID,
   * which is unreadable and reads to the user as the edit not having been understood.
   * Optional so a caller that only wants to validate need not build it.
   */
  labelById?: Map<string, string>;
}

/**
 * Mirror of the SQL fn_norm_biometric_code. All-digit codes of 1..18 chars compare
 * numerically (00002 = 002 = 2); anything else is trimmed and uppercased. The 18-char
 * cap matches the SQL, which caps there so a long code cannot overflow bigint.
 */
export function normaliseBiometricCode(code: string | null | undefined): string | null {
  if (code == null) return null;
  const t = code.trim();
  if (t === '') return null;
  if (/^[0-9]{1,18}$/.test(t)) return BigInt(t).toString();
  return t.toUpperCase();
}

const norm = (v: string | null | undefined) => (v ?? '').trim();
const lower = (v: string | null | undefined) => norm(v).toLowerCase();

export function validateStaffBulkEditRow(
  row: ParsedStaffRow,
  ctx: ValidationContext,
  seenEmails: Set<string>
): { issues: BulkEditIssue[]; updates: Partial<Record<StaffEditableField, string | null>> } {
  const issues: BulkEditIssue[] = [];
  const updates: Partial<Record<StaffEditableField, string | null>> = {};

  const key = lower(row.institutionEmail);

  if (seenEmails.has(key)) {
    issues.push({
      field: 'Institution Email',
      kind: 'record',
      message: `${row.institutionEmail} appears more than once in this file.`
    });
    return { issues, updates };
  }

  const staff = ctx.staffByEmail.get(key);
  if (!staff) {
    issues.push({
      field: 'Institution Email',
      kind: 'record',
      message: `Institution email ${row.institutionEmail} not found in the institutions you can access.`
    });
    return { issues, updates };
  }

  for (const col of EDITABLE_COLUMNS) {
    // The biometric pair is validated together, once, after this loop — see the comment
    // down there for why a column-by-column pass over these two headers isn't enough.
    if (col.field === 'biometric_id' || col.field === 'biometric_institution_id') continue;

    const raw = norm(row.cells[col.header]);
    if (raw === '') continue; // blank = leave unchanged, never clear

    switch (col.field) {
      case 'email': {
        if (!validateEmail(raw)) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not a valid email address.` });
          break;
        }
        const owner = ctx.emailOwner.get(raw.toLowerCase());
        if (owner && owner !== staff.id) {
          issues.push({ field: col.header, kind: 'record', message: `${raw} already belongs to another staff member.` });
          break;
        }
        if (raw !== (staff.email as string)) updates.email = raw;
        break;
      }

      case 'phone': {
        if (!validatePhone(raw)) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not a valid phone number (at least 10 digits).` });
          break;
        }
        if (raw !== (staff.phone as string)) updates.phone = raw;
        break;
      }

      case 'pincode': {
        if (!/^\d{6}$/.test(raw)) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not a 6-digit pincode.` });
          break;
        }
        if (raw !== (staff.pincode as string | null)) updates.pincode = raw;
        break;
      }

      case 'date_of_birth':
      case 'date_of_joining': {
        const parsed = parseFlexibleDate(raw);
        if (!parsed.isValid) {
          issues.push({ field: col.header, kind: 'format', message: parsed.error ?? `"${raw}" is not a valid date.` });
          break;
        }
        if (parsed.convertedDate !== (staff[col.field] as string | null)) {
          updates[col.field] = parsed.convertedDate;
        }
        break;
      }

      case 'gender':
      case 'marital_status': {
        const allowed = (col.field === 'gender' ? GENDERS : MARITAL_STATUSES) as readonly string[];
        const value = raw.toLowerCase();
        if (!allowed.includes(value)) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not allowed. Use one of: ${allowed.join(', ')}.` });
          break;
        }
        if (value !== (staff[col.field] as string | null)) updates[col.field] = value;
        break;
      }

      case 'blood_group': {
        const match = (BLOOD_GROUPS as readonly string[]).find(b => b.toLowerCase() === raw.toLowerCase());
        if (!match) {
          issues.push({ field: col.header, kind: 'format', message: `"${raw}" is not allowed. Use one of: ${BLOOD_GROUPS.join(', ')}.` });
          break;
        }
        if (match !== (staff.blood_group as string | null)) updates.blood_group = match;
        break;
      }

      case 'department_id': {
        const byName = ctx.departmentsByInstitution.get(staff.institution_id);
        const id = byName?.get(raw.toLowerCase());
        if (!id) {
          issues.push({ field: col.header, kind: 'record', message: `No department named "${raw}" exists in this person's institution.` });
          break;
        }
        if (id !== (staff.department_id as string | null)) updates.department_id = id;
        break;
      }

      case 'category_id': {
        const id = ctx.categoriesByName.get(raw.toLowerCase());
        if (!id) {
          issues.push({ field: col.header, kind: 'record', message: `No employment category named "${raw}" exists.` });
          break;
        }
        if (id !== (staff.category_id as string | null)) updates.category_id = id;
        break;
      }

      // State and District are dataset-validated as of 2026-08-28, when the
      // stored values were standardised (nine spellings of "Tamil Nadu", 50
      // district values for ~20 real districts). Left as free text this sheet
      // would re-introduce the mess within weeks — a bulk edit writes far more
      // rows than the form does.
      //
      // The canonical spelling is written back, so "TAMILNADU" is accepted and
      // stored as "Tamil Nadu" rather than rejected: the operator's intent is
      // unambiguous and refusing it would just be pedantry.
      case 'state': {
        const id = getLocationIdByFuzzyName(raw, 'state');
        if (!id) {
          issues.push({
            field: col.header,
            kind: 'record',
            message: `"${raw}" is not a known state. Use the spelling shown in the staff form's State dropdown.`
          });
          break;
        }
        const canonical = getLocationDisplayName(id, 'state');
        if (canonical !== (staff.state as string | null)) updates.state = canonical;
        break;
      }

      case 'district': {
        // Resolved within the person's state where known, so an ambiguous name
        // cannot silently land in the wrong state's district.
        const stateId = getLocationIdByFuzzyName(
          (updates.state as string | undefined) ?? (staff.state as string | null),
          'state'
        );
        const id = getLocationIdByFuzzyName(raw, 'district', stateId || undefined);
        if (!id) {
          issues.push({
            field: col.header,
            kind: 'record',
            message: `"${raw}" is not a known district. Use the spelling shown in the staff form's District dropdown.`
          });
          break;
        }
        const canonical = getLocationDisplayName(id, 'district', stateId || undefined);
        if (canonical !== (staff.district as string | null)) updates.district = canonical;
        break;
      }

      default: {
        // plain text: address, designation
        if (raw !== (staff[col.field] as string | null)) updates[col.field] = raw;
      }
    }
  }

  // ── Biometric pair ──────────────────────────────────────────────────────────────────────
  //
  // staff_biometric_scope_chk requires a code to have a machine; staff_biometric_uq requires
  // the (machine, normalised code) pair to be unique. Both constraints span BOTH columns, so
  // "Biometric Code" and "Biometric Machine" cannot be validated independently per-column
  // without missing a real clash: moving a person's EXISTING code onto a different machine
  // (code cell left blank = "leave unchanged", per the blank-cell rule) can collide with
  // someone already enrolled under that code on the new machine — a case a purely
  // per-column check never looks at, and which would only surface as a 23505 at write time,
  // exactly the failure mode this module exists to prevent.
  const bioCodeRaw = norm(row.cells['Biometric Code']);
  const bioMachineRaw = norm(row.cells['Biometric Machine']);
  const codeGiven = bioCodeRaw !== '';
  const machineGiven = bioMachineRaw !== '';

  if (codeGiven || machineGiven) {
    let machineId: string | undefined;
    if (machineGiven) {
      machineId = ctx.institutionsByName.get(bioMachineRaw.toLowerCase());
      if (!machineId) {
        issues.push({
          field: 'Biometric Machine',
          kind: 'record',
          message: `No institution named "${bioMachineRaw}" exists, so it cannot own a machine.`
        });
      }
    } else {
      // Machine cell left blank: fall back to whatever machine is already on file, so an
      // edit that only touches the code doesn't get flagged for a pair the person already has.
      machineId = (staff.biometric_institution_id as string | null) ?? undefined;
    }

    // The code in play for this pair check: the new value if the cell was filled, otherwise
    // whatever is already stored (blank cell = unchanged, but the pair still needs checking
    // against wherever it ends up).
    const effectiveCode = codeGiven ? bioCodeRaw : (staff.biometric_id as string | null);
    const normalisedCode = normaliseBiometricCode(effectiveCode);

    if (!machineGiven && normalisedCode && !machineId) {
      // A code is in play (new or on file) with nowhere to pair it — the cell was left
      // blank AND there is no machine on file either.
      issues.push({
        field: 'Biometric Code',
        kind: 'format',
        message: 'A biometric code needs its machine. Fill in "Biometric Machine" as well, or clear the code.'
      });
    } else if (machineId && normalisedCode) {
      const owner = ctx.biometricOwner.get(`${machineId}|${normalisedCode}`);
      if (owner && owner !== staff.id) {
        issues.push({
          field: 'Biometric Code',
          kind: 'record',
          message: `Code ${effectiveCode} is already issued to another staff member on that machine (codes ignore leading zeros).`
        });
      } else {
        if (codeGiven) {
          const currentNormalised = normaliseBiometricCode(staff.biometric_id as string | null);
          if (normalisedCode !== currentNormalised) updates.biometric_id = bioCodeRaw;
        }
        if (machineGiven && machineId !== (staff.biometric_institution_id as string | null)) {
          updates.biometric_institution_id = machineId;
        }
      }
    }
    // Remaining case: the machine resolved but NO code is in play at all — none in the cell
    // and none on file. Deliberately a no-op, not a write.
    //
    // A machine on its own identifies nobody: enrolment is the PAIR, and every reader filters
    // on a non-null code (BiometricMappingService.listForMachine, the attendance import's
    // (machine, normalised code) match). Storing a bare machine would be noise that no query
    // ever returns.
    //
    // It also has to stay a no-op because the template can pre-fill "Biometric Machine" for a
    // whole sheet (see the biometric_institution_id param on the template route). Writing here
    // would turn that convenience into a mass update of every staff member who has no code —
    // hundreds of meaningless writes from one dropdown choice.
    //
    // This is NOT the "move someone's machine" case: when a code exists on file, effectiveCode
    // is non-null and the branch above handles the move, clash check included.
  }

  return { issues, updates };
}
