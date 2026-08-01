// lib/services/solutions/department-capability-service.ts
// ---------------------------------------------------------------------------
// The capability register for the 44 activated solution departments.
//
// sh_solution_departments.capabilities is a Postgres text[] (verified live on
// 2026-08-01 via the PostgREST OpenAPI: `{"format":"text[]","type":"array"}`).
// It is NOT jsonb, so the array-or-object tolerance this codebase needs for
// jsonb columns does not apply here — PostgREST always hands back a JSON array
// or null. `readCapabilityCodes` still normalises null and non-array junk,
// because a text[] column with no DEFAULT can hold NULL and a hand-written row
// can hold anything.
//
// The codes stored in that array are `capability_code` values from
// sh_department_capabilities — a per-institution catalogue seeded with 16
// is_system defaults. Postgres cannot FK-constrain an element of an array, so
// this service is the only thing standing between the column and the free-text
// spelling drift that made the 2026-04 editor useless. Every write is validated
// against the active catalogue rows for that department's institution.
// ---------------------------------------------------------------------------

import { BaseService } from '../base-service';
import { DepartmentTrackerService } from './department-tracker-service';

// ============================================
// TYPES
// ============================================

export interface DepartmentCapability {
  id: string;
  institution_id: string;
  capability_code: string;
  capability_name: string;
  description: string | null;
  sort_order: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DepartmentCapabilityRow {
  /** sh_solution_departments.id — the row whose capabilities we edit. */
  id: string;
  department_id: string;
  institution_id: string;
  status: string;
  department_name: string;
  department_code: string | null;
  institution_name: string;
  /** capability_code values currently declared. Never null. */
  capability_codes: string[];
}

/**
 * Thrown when the catalogue table is absent — i.e. the Director has not yet
 * applied 20260801181500_sh_department_capabilities_catalogue.sql. The page
 * turns this into an explicit "not installed yet" panel rather than a crash,
 * because the migration ships as a file and is applied separately.
 */
export class CapabilityCatalogueMissingError extends Error {
  constructor() {
    super('The capability catalogue table has not been created yet.');
    this.name = 'CapabilityCatalogueMissingError';
  }
}

/** PostgREST/Postgres codes that mean "this relation does not exist". */
const RELATION_MISSING_CODES = new Set(['42P01', 'PGRST205', 'PGRST106']);

function isRelationMissing(error: { code?: string | null } | null): boolean {
  return !!error?.code && RELATION_MISSING_CODES.has(error.code);
}

/**
 * CLAUDE.md rule 27 — a refusal must say so, and say who can fix it. Postgres
 * answers an RLS denial with 42501 and the text "new row violates row-level
 * security policy", which tells the person nothing they can act on.
 */
const RLS_DENIED = '42501';

function describeWriteFailure(error: { code?: string | null; message?: string }): Error {
  if (error.code === RLS_DENIED) {
    return new Error(
      'You do not have access to change this. Ask your Solutions Hub administrator ' +
        'to grant you solutions.departments.capabilities.edit for this institution.'
    );
  }
  return new Error(error.message || 'The change could not be saved.');
}

/**
 * Normalise whatever the driver hands back for a text[] column into a clean
 * list of codes. Handles null (no DEFAULT on the live column) and drops
 * non-string / blank entries rather than rendering `undefined` chips.
 */
export function readCapabilityCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

/** Shape a free-typed capability name into a legal capability_code. */
export function toCapabilityCode(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

// Mirrors chk_sh_department_capability_code_shape in the migration.
const CAPABILITY_CODE_SHAPE = /^[a-z][a-z0-9_]{1,39}$/;

export function isValidCapabilityCode(code: string): boolean {
  return CAPABILITY_CODE_SHAPE.test(code);
}

// Row shapes returned by the joined selects below.
interface JoinedDepartmentRow {
  id: string;
  department_id: string;
  institution_id: string;
  status: string;
  capabilities: unknown;
  department: { department_name: string; department_code: string | null } | null;
  institution: { name: string } | null;
}

// ============================================
// SERVICE
// ============================================

export class DepartmentCapabilityService extends BaseService {
  /**
   * Every activated solution department with its declared capability codes.
   * Ordered institution, then department, so the page can group without a
   * second pass.
   */
  static async listDepartments(): Promise<DepartmentCapabilityRow[]> {
    const { data, error } = await this.supabase
      .from('sh_solution_departments')
      .select(`
        id,
        department_id,
        institution_id,
        status,
        capabilities,
        department:departments!department_id(department_name, department_code),
        institution:institutions!institution_id(name)
      `)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const rows = ((data ?? []) as unknown as JoinedDepartmentRow[]).map((row) => ({
      id: row.id,
      department_id: row.department_id,
      institution_id: row.institution_id,
      status: row.status,
      department_name: row.department?.department_name ?? 'Unnamed department',
      department_code: row.department?.department_code ?? null,
      institution_name: row.institution?.name ?? 'Unknown institution',
      capability_codes: readCapabilityCodes(row.capabilities),
    }));

    return rows.sort(
      (a, b) =>
        a.institution_name.localeCompare(b.institution_name) ||
        a.department_name.localeCompare(b.department_name)
    );
  }

  /**
   * The capability catalogue. Institution-scoped: pass an institution id to
   * get that college's list, omit it to load every list the caller's RLS
   * scope allows (the register page needs several colleges at once).
   *
   * Throws CapabilityCatalogueMissingError when the table is not there yet.
   */
  static async listCatalogue(institutionId?: string): Promise<DepartmentCapability[]> {
    let query = this.supabase
      .from('sh_department_capabilities')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('capability_name', { ascending: true });

    if (institutionId) query = query.eq('institution_id', institutionId);

    const { data, error } = await query;

    if (error) {
      if (isRelationMissing(error)) throw new CapabilityCatalogueMissingError();
      throw error;
    }
    return (data ?? []) as DepartmentCapability[];
  }

  /**
   * Replace one department's declared capabilities.
   *
   * Validation is the whole point of this method: a code that is not an
   * ACTIVE catalogue row for that department's institution is rejected here,
   * because the database cannot reject it (no FK is possible on a text[]
   * element). Duplicates are collapsed and order is normalised so two saves
   * of the same set produce the same stored array.
   */
  static async setCapabilities(
    solutionDepartmentId: string,
    institutionId: string,
    codes: string[]
  ): Promise<string[]> {
    const requested = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean))).sort();

    if (requested.length > 0) {
      const catalogue = await this.listCatalogue(institutionId);
      const allowed = new Set(catalogue.map((c) => c.capability_code));
      const unknown = requested.filter((c) => !allowed.has(c));
      if (unknown.length > 0) {
        throw new Error(
          `Not in this institution's capability list: ${unknown.join(', ')}. ` +
            'Add it to the list first, then declare it.'
        );
      }
    }

    // Reuses the writer that survived the 2026-04-02 delete of the
    // /solutions/departments tree. It has had no caller since; this is its
    // first one back.
    try {
      await DepartmentTrackerService.updateCapabilities(solutionDepartmentId, requested);
    } catch (err: unknown) {
      throw describeWriteFailure(err as { code?: string | null; message?: string });
    }
    return requested;
  }

  /**
   * Add a capability to an institution's catalogue and return it, so the
   * declare dialog can select it immediately. A value list nobody can extend
   * is not a value list — this is the CRUD-create half of that promise.
   *
   * Re-activates a soft-deleted row with the same code instead of failing on
   * the unique constraint.
   */
  static async addCatalogueEntry(
    institutionId: string,
    capabilityName: string
  ): Promise<DepartmentCapability> {
    const name = capabilityName.trim();
    if (!name) throw new Error('Give the capability a name.');

    const code = toCapabilityCode(name);
    if (!isValidCapabilityCode(code)) {
      throw new Error(
        'That name does not make a usable code. Use letters and digits, ' +
          'for example "3D printing" is not enough on its own — try "3D printing service".'
      );
    }

    const { data: existing, error: lookupError } = await this.supabase
      .from('sh_department_capabilities')
      .select('*')
      .eq('institution_id', institutionId)
      .eq('capability_code', code)
      .maybeSingle();

    if (lookupError) {
      if (isRelationMissing(lookupError)) throw new CapabilityCatalogueMissingError();
      throw lookupError;
    }

    if (existing) {
      const row = existing as DepartmentCapability;
      if (row.is_active) return row;

      const { data: reactivated, error: reactivateError } = await this.supabase
        .from('sh_department_capabilities')
        .update({ is_active: true, capability_name: name })
        .eq('id', row.id)
        .select('*')
        .single();

      if (reactivateError) throw reactivateError;
      return reactivated as DepartmentCapability;
    }

    const { data, error } = await this.supabase
      .from('sh_department_capabilities')
      .insert({
        institution_id: institutionId,
        capability_code: code,
        capability_name: name,
        sort_order: 900,
        is_system: false,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      if (isRelationMissing(error)) throw new CapabilityCatalogueMissingError();
      throw describeWriteFailure(error);
    }
    return data as DepartmentCapability;
  }
}
