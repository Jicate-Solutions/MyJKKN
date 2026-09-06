/**
 * Staff bulk edit: build the lookup context, evaluate every row, then write.
 *
 * evaluate() is what BOTH preview and apply run. apply() calls evaluate() first and never
 * trusts a client-supplied preview.
 */
import { BaseService } from '@/lib/services/base-service';
import { getErrorMessage } from '@/lib/utils';
import {
  validateStaffBulkEditRow,
  normaliseBiometricCode,
  type ParsedStaffRow,
  type ValidationContext,
  type BulkEditIssue,
  type StaffLookupRow
} from './staff-bulk-edit-validation';
import { EDITABLE_COLUMNS, type StaffEditableField } from './staff-bulk-edit-columns';

export interface BulkEditRow {
  rowNumber: number;
  institutionEmail: string;
  name: string;
  status: 'change' | 'nochange' | 'error';
  changes: { field: string; from: string | null; to: string | null }[];
  issues: BulkEditIssue[];
}

export interface BulkEditReport {
  total_rows: number;
  counts: { updated: number; skipped: number; failed: number };
  rows: BulkEditRow[];
  updated_staff: { id: string; institution_email: string }[];
}

/**
 * Register the unique values a row has just claimed, so a LATER row in the same file
 * collides with them.
 *
 * Why this exists: validateStaffBulkEditRow is per-row and pure. It catches a value that
 * is already owned in the DATABASE (via ctx.emailOwner / ctx.biometricOwner), but it
 * cannot see that two DIFFERENT rows of the same upload both claim the same NEW Personal
 * Email or biometric code — neither is in the database yet, so both validate cleanly and
 * the second one raises 23505 at write time. That is precisely the late failure the
 * preview screen exists to prevent.
 *
 * Exported so it can be unit-tested without a database.
 */
export function claimUniqueValues(
  ctx: ValidationContext,
  staff: StaffLookupRow,
  updates: Partial<Record<StaffEditableField, string | null>>
): void {
  if (updates.email) {
    ctx.emailOwner.set(String(updates.email).toLowerCase(), staff.id);
  }
  // The pair is coupled: a code claims a slot on a machine. Use the new value where the
  // row supplied one, otherwise what is already on file — the same "effective pair" rule
  // the validator uses.
  const machine =
    (updates.biometric_institution_id as string | null) ??
    (staff.biometric_institution_id as string | null);
  const code = normaliseBiometricCode(
    (updates.biometric_id as string | null) ?? (staff.biometric_id as string | null)
  );
  if (machine && code) {
    ctx.biometricOwner.set(`${machine}|${code}`, staff.id);
  }
}

/** Exported for unit test. `updated` counts rows that WILL be / WERE written. */
export function summariseRows(rows: BulkEditRow[]) {
  return {
    updated: rows.filter(r => r.status === 'change').length,
    skipped: rows.filter(r => r.status === 'nochange').length,
    failed: rows.filter(r => r.status === 'error').length
  };
}

/** PostgREST URLs blow past the length limit on long IN lists and return 400. */
const CHUNK = 200;
function chunk<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// PostgREST caps an unbounded select() at 1000 rows by default. The uniqueness-owner and
// name lookups below have no per-institution or per-email filter to shrink them, so an
// unbounded select() would silently truncate once a table crosses that cap instead of
// erroring — the same "quiet truncation" failure mode as a default-limited dropdown query.
// Bound them explicitly, generously above current scale.
const LOOKUP_RANGE_END = 9999;

/**
 * Whether the staff lookup should be scoped to `accessibleInstitutionIds`.
 *
 * accessibleInstitutionIds: an EMPTY array means "all institutions" — the super-admin /
 * admission-global bypass value returned by createApiInstitutionFilter
 * (lib/auth/api-institution-filter.ts) — NOT "no institutions." `.in('institution_id', [])`
 * matches zero rows, which would make every uploaded row report "not found" for exactly
 * those callers. The house convention (see applyInstitutionFilterToQuery in the same file)
 * is to skip the filter entirely when the list is empty, never to branch on an isSuperAdmin
 * flag. Exported so the decision can be unit-tested without a database.
 */
export function scopesToInstitutions(accessibleInstitutionIds: string[]): boolean {
  return accessibleInstitutionIds.length > 0;
}

export class BulkStaffEditService extends BaseService {
  /**
   * accessibleInstitutionIds: empty array = all institutions (super-admin / admission-global
   * bypass), not none. See scopesToInstitutions().
   */
  static async buildContext(
    emails: string[],
    accessibleInstitutionIds: string[]
  ): Promise<ValidationContext> {
    const supabase = this.supabase as any;
    const keys = Array.from(new Set(emails.map(e => e.trim().toLowerCase()))).filter(Boolean);

    // ── staff rows for the uploaded emails, scoped to accessible institutions ──
    // NOTE: no `institutions` embed here on purpose. If you ever add one, it MUST be
    // institutions!staff_institution_id_fkey(...) or PostgREST raises PGRST201.
    const staffByEmail = new Map<string, StaffLookupRow>();
    const selectCols = [
      'id', 'institution_id', 'institution_email', 'first_name', 'last_name',
      ...EDITABLE_COLUMNS.map(c => c.field)
    ].join(', ');

    const scoped = scopesToInstitutions(accessibleInstitutionIds);
    for (const part of chunk(keys)) {
      let query = supabase
        .from('staff')
        .select(selectCols)
        .in('institution_email', part);
      if (scoped) {
        query = query.in('institution_id', accessibleInstitutionIds);
      }
      const { data, error } = await query;
      if (error) throw new Error(getErrorMessage(error));
      for (const row of data ?? []) {
        staffByEmail.set(String(row.institution_email).trim().toLowerCase(), row as StaffLookupRow);
      }
    }

    // ── uniqueness owners: personal email, biometric (machine, code) ──
    // Unscoped by design: Personal Email and the biometric pair are unique across ALL
    // staff, not just the accessible institutions, so a collision outside the caller's
    // scope must still be caught here — otherwise it only surfaces as a 23505 at write time.
    // Staff ID is absent deliberately: since 2026-08-28 it is database-generated and
    // permanent, so bulk edit cannot write it and cannot collide on it.
    const emailOwner = new Map<string, string>();
    const biometricOwner = new Map<string, string>();
    {
      const { data, error } = await supabase
        .from('staff')
        .select('id, email, biometric_id, biometric_institution_id')
        .range(0, LOOKUP_RANGE_END);
      if (error) throw new Error(getErrorMessage(error));
      for (const r of data ?? []) {
        if (r.email) emailOwner.set(String(r.email).toLowerCase(), r.id);
        const code = normaliseBiometricCode(r.biometric_id);
        if (code && r.biometric_institution_id) {
          biometricOwner.set(`${r.biometric_institution_id}|${code}`, r.id);
        }
      }
    }

    // ── name -> id lookups ──
    // labelById is the reverse of all three, built from the same rows so it cannot drift.
    // Display-only: it turns the UUIDs in a preview change line back into readable names.
    const labelById = new Map<string, string>();

    const departmentsByInstitution = new Map<string, Map<string, string>>();
    {
      const { data, error } = await supabase
        .from('departments')
        .select('id, department_name, institution_id')
        .range(0, LOOKUP_RANGE_END);
      if (error) throw new Error(getErrorMessage(error));
      for (const d of data ?? []) {
        if (!departmentsByInstitution.has(d.institution_id)) {
          departmentsByInstitution.set(d.institution_id, new Map());
        }
        departmentsByInstitution
          .get(d.institution_id)!
          .set(String(d.department_name).trim().toLowerCase(), d.id);
        labelById.set(d.id, String(d.department_name));
      }
    }

    const categoriesByName = new Map<string, string>();
    {
      const { data, error } = await supabase
        .from('employment_categories')
        .select('id, category_name')
        .range(0, LOOKUP_RANGE_END);
      if (error) throw new Error(getErrorMessage(error));
      for (const c of data ?? []) {
        categoriesByName.set(String(c.category_name).trim().toLowerCase(), c.id);
        labelById.set(c.id, String(c.category_name));
      }
    }

    // ALL institutions — a biometric machine may belong to another institution.
    const institutionsByName = new Map<string, string>();
    {
      const { data, error } = await supabase
        .from('institutions')
        .select('id, name')
        .range(0, LOOKUP_RANGE_END);
      if (error) throw new Error(getErrorMessage(error));
      for (const i of data ?? []) {
        institutionsByName.set(String(i.name).trim().toLowerCase(), i.id);
        labelById.set(i.id, String(i.name));
      }
    }

    return {
      staffByEmail,
      departmentsByInstitution,
      categoriesByName,
      institutionsByName,
      emailOwner,
      biometricOwner,
      labelById
    };
  }

  /** accessibleInstitutionIds: empty array = all institutions (super-admin / admission-global
   *  bypass), not none. See scopesToInstitutions(). */
  static async evaluate(
    rows: ParsedStaffRow[],
    accessibleInstitutionIds: string[]
  ): Promise<{
    report: BulkEditReport;
    writes: Map<string, Partial<Record<StaffEditableField, string | null>>>;
    ctx: ValidationContext;
  }> {
    const ctx = await this.buildContext(rows.map(r => r.institutionEmail), accessibleInstitutionIds);
    const seen = new Set<string>();
    const reportRows: BulkEditRow[] = [];
    const writes = new Map<string, Partial<Record<StaffEditableField, string | null>>>();

    const headerOf = new Map(EDITABLE_COLUMNS.map(c => [c.field, c.header] as const));
    // A `lookup` column stores a UUID but the sheet speaks names, so a change line for one
    // has to be translated back or it reads as gibberish. Driven off the column contract's
    // own `kind` rather than a hand-listed set of fields, so a lookup column added later is
    // covered automatically.
    const kindOf = new Map(EDITABLE_COLUMNS.map(c => [c.field, c.kind] as const));
    const display = (field: StaffEditableField, value: string | null) => {
      if (value == null || value === '') return null;
      return kindOf.get(field) === 'lookup' ? (ctx.labelById?.get(value) ?? value) : value;
    };

    for (const row of rows) {
      const key = row.institutionEmail.trim().toLowerCase();
      const { issues, updates } = validateStaffBulkEditRow(row, ctx, seen);
      seen.add(key);

      const staff = ctx.staffByEmail.get(key);
      const name = staff ? `${staff.first_name ?? ''} ${staff.last_name ?? ''}`.trim() : '';

      if (issues.length > 0) {
        reportRows.push({ rowNumber: row.rowNumber, institutionEmail: row.institutionEmail, name, status: 'error', changes: [], issues });
        continue;
      }

      const changes = Object.entries(updates).map(([field, to]) => ({
        field: headerOf.get(field as StaffEditableField) ?? field,
        from: display(field as StaffEditableField, (staff?.[field] as string | null) ?? null),
        to: display(field as StaffEditableField, (to as string | null) ?? null)
      }));

      if (changes.length === 0) {
        reportRows.push({ rowNumber: row.rowNumber, institutionEmail: row.institutionEmail, name, status: 'nochange', changes: [], issues: [] });
        continue;
      }

      reportRows.push({ rowNumber: row.rowNumber, institutionEmail: row.institutionEmail, name, status: 'change', changes, issues: [] });
      if (staff) {
        writes.set(staff.id, updates);

        // CLAIM the newly-taken unique values into ctx as we go.
        //
        // validateStaffBulkEditRow is per-row and pure, so on its own it cannot see that
        // TWO DIFFERENT rows in the same file both claim the same new Personal Email or
        // biometric code. `seen` only tracks the match key (Institution Email). Without
        // this block, both rows validate cleanly and the second one raises 23505 at write
        // time — the exact class of late failure the preview screen exists to prevent.
        // Registering the claim here makes the later row collide in ctx.emailOwner /
        // ctx.biometricOwner and surface as a `record` issue instead.
        claimUniqueValues(ctx, staff, updates);
      }
    }

    const report: BulkEditReport = {
      total_rows: rows.length,
      counts: summariseRows(reportRows),
      rows: reportRows,
      updated_staff: []
    };
    return { report, writes, ctx };
  }

  /** accessibleInstitutionIds: empty array = all institutions (super-admin / admission-global
   *  bypass), not none. See scopesToInstitutions(). */
  static async apply(
    rows: ParsedStaffRow[],
    accessibleInstitutionIds: string[],
    skipInvalid: boolean
  ): Promise<{ report: BulkEditReport; refused: boolean }> {
    const { report, writes, ctx } = await this.evaluate(rows, accessibleInstitutionIds);

    // The gate is enforced HERE, on the server. The UI switch only sends the flag.
    if (report.counts.failed > 0 && !skipInvalid) {
      return { report, refused: true };
    }

    const supabase = this.supabase as any;
    const updated: { id: string; institution_email: string }[] = [];

    // Reverse-index staff.id -> its staff row / report row ONCE, rather than re-scanning
    // ctx.staffByEmail and report.rows on every write below (both keyed by
    // trim().toLowerCase(institutionEmail), matching how ctx.staffByEmail was built).
    const staffById = new Map<string, StaffLookupRow>();
    const rowByStaffId = new Map<string, BulkEditRow>();
    for (const row of report.rows) {
      if (row.status !== 'change') continue;
      const staff = ctx.staffByEmail.get(row.institutionEmail.trim().toLowerCase());
      if (!staff) continue;
      staffById.set(staff.id, staff);
      rowByStaffId.set(staff.id, row);
    }

    for (const [staffId, updates] of writes) {
      // '' -> null for the nullable FK, or Postgres raises 22P02.
      const payload: Record<string, unknown> = { ...updates, updated_at: new Date().toISOString() };
      if (payload.biometric_institution_id === '') payload.biometric_institution_id = null;

      const { error } = await supabase.from('staff').update(payload).eq('id', staffId);

      if (error) {
        const row = rowByStaffId.get(staffId);
        if (row) {
          row.status = 'error';
          row.changes = [];
          row.issues = [{ field: 'Institution Email', kind: 'record', message: getErrorMessage(error) }];
        }
        continue;
      }

      const staff = staffById.get(staffId);
      updated.push({ id: staffId, institution_email: staff?.institution_email ?? '' });
    }

    report.counts = summariseRows(report.rows);
    report.updated_staff = updated;
    return { report, refused: false };
  }
}
