// ─────────────────────────────────────────────────────────────────────────────
// lib/utils/bos/programme-outcomes.ts
//
// Shared resolution, authorization and write helpers for the programme-level
// PO / PSO tables (bos_programme_outcomes / bos_programme_specific_outcomes)
// and the HOD course × PO/PSO matrix (bos_course_outcome_mappings).
//
// These tables are the SINGLE source of truth for PO/PSO — read by
// /bos/po-pso, the /bos/compositions Outcomes tab and the syllabus CO-PO
// editor. Every write path in the app funnels through syncOutcomeSet /
// the per-row helpers here so the rules stay identical:
//
//   • rows are NEVER deleted — removal = is_active=false (soft deactivate)
//   • codes are stable (PO1 stays PO1); a re-added code reactivates the row
//   • programme_id / department_id are stamped from `programs` on insert
//
// Write model (mirrors the BoS spec):
//   super-admin                       → everything
//   principal of the institution      → every programme at the institution
//   HOD                               → programmes whose programs.department_id
//                                       is one of the departments they head
//   any active board member           → programmes their board governs
//                                       (bos_board_programmes, existing rule)
// Routes authorize here, then write with the service-role client (the DB
// policies on these tables are chairman/admin-only — same editor-flow
// pattern as bos_master_pos / bos_ta_da_claims).
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BosBoardScope } from '@/lib/utils/bos/bos-access';
import { isMemberForProgramme } from '@/lib/utils/bos/bos-chairman-access';
import { intersectBosScope, resolveCasRegulationIds } from '@/lib/utils/bos/institution-scope';
import { resolvePoPsoTarget } from '@/lib/utils/bos/po-pso-access';
import type { BosPOMappingsData, BosProgrammeOutcome, BosProgrammeSpecificOutcome } from '@/types/bos';

export type OutcomeKind = 'po' | 'pso';

export const OUTCOME_TABLE: Record<OutcomeKind, string> = {
  po: 'bos_programme_outcomes',
  pso: 'bos_programme_specific_outcomes',
};
export const OUTCOME_CODE_COLUMN: Record<OutcomeKind, 'po_code' | 'pso_code'> = {
  po: 'po_code',
  pso: 'pso_code',
};
export const OUTCOME_PREFIX: Record<OutcomeKind, 'PO' | 'PSO'> = { po: 'PO', pso: 'PSO' };

export type OutcomeRow = BosProgrammeOutcome | BosProgrammeSpecificOutcome;

export interface ProgrammeRef {
  id: string;
  institution_id: string;
  department_id: string | null;
  program_id: string;
  program_name: string;
}

export interface ProgrammeOutcomeTarget {
  /** Full CAS sibling set (MyJKKN UUIDs) — use for reads. */
  ids: string[];
  /** Canonical MyJKKN UUID new rows are written under. */
  canonicalId: string;
  /** Requested regulation id — new rows are written under it. */
  regulationId: string;
  /** CAS-expanded regulation ids (same code under each sibling). */
  regIds: string[];
  /** Upper-cased programme code (bos_programme_outcomes convention). */
  programmeCode: string;
  /** Matching `programs` row (any CAS sibling) — null when unknown. */
  programme: ProgrammeRef | null;
}

/**
 * Resolves the (institution, regulation, programme) triple every PO/PSO
 * route works on. institutionsId may be a MyJKKN OR COE UUID (see
 * resolvePoPsoTarget); regulation and institution are CAS-expanded.
 */
export async function resolveProgrammeOutcomeTarget(
  db: SupabaseClient,
  input: { institutionsId: string; regulationId: string; programmeCode: string }
): Promise<ProgrammeOutcomeTarget | null> {
  const target = await resolvePoPsoTarget(db, input.institutionsId);
  if (!target) return null;

  const programmeCode = input.programmeCode.trim().toUpperCase();
  if (!programmeCode) return null;

  const [regIds, programme] = await Promise.all([
    resolveCasRegulationIds(db, input.regulationId),
    findProgramme(db, target.ids, programmeCode),
  ]);

  // Prefer writing under the institution that actually owns the programme
  // row (CAS: Aided vs Self) so department_id / programme_id line up.
  const canonicalId =
    programme && target.ids.includes(programme.institution_id)
      ? programme.institution_id
      : target.canonicalId;

  return {
    ids: target.ids,
    canonicalId,
    regulationId: input.regulationId,
    regIds: regIds.length > 0 ? regIds : [input.regulationId],
    programmeCode,
    programme,
  };
}

async function findProgramme(
  db: SupabaseClient,
  institutionIds: string[],
  programmeCode: string
): Promise<ProgrammeRef | null> {
  if (institutionIds.length === 0) return null;
  const { data } = await db
    .from('programs')
    .select('id, institution_id, department_id, program_id, program_name')
    .in('institution_id', institutionIds)
    .ilike('program_id', programmeCode)
    .order('is_active', { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as ProgrammeRef | undefined;
  return row ?? null;
}

/** Is this user allowed to READ the target's PO/PSO sets? */
export async function canReadProgrammeOutcomes(
  supabase: SupabaseClient,
  scope: BosBoardScope,
  target: Pick<ProgrammeOutcomeTarget, 'ids'>,
  seeAll: boolean
): Promise<boolean> {
  if (seeAll) return true;
  if (target.ids.some((id) => scope.institutionsOf.has(id))) return true;
  const allowed = await intersectBosScope(supabase, scope, target.ids);
  return allowed.length > 0;
}

/** May this user WRITE the target programme's PO/PSO sets or course matrix? */
export async function canWriteProgrammeOutcomes(
  scope: BosBoardScope,
  userId: string,
  target: ProgrammeOutcomeTarget
): Promise<boolean> {
  if (scope.isSuperAdmin) return true;

  const inTarget = new Set(target.ids);
  const atInstitution =
    scope.allInstitutionIds.some((id) => inTarget.has(id)) ||
    (!!scope.institutionsId && inTarget.has(scope.institutionsId));

  if (scope.isPrincipal && atInstitution) return true;

  // HOD: the programme's owning department must be one they head. The
  // department belongs to an institution in the target set by construction
  // (programs.department_id → departments.institution_id).
  if (
    scope.isHod &&
    target.programme?.department_id &&
    scope.hodDepartmentIds.has(target.programme.department_id)
  ) {
    return true;
  }

  // Existing rule: any active member of a board governing the programme.
  if (scope.memberOf.size === 0) return false;
  for (const id of target.ids) {
    if (await isMemberForProgramme(userId, target.programmeCode, id)) return true;
  }
  return false;
}

// ── Codes ───────────────────────────────────────────────────────────────────

export function outcomeNumber(code: string, prefix: 'PO' | 'PSO'): number {
  const m = code.toUpperCase().match(new RegExp(`^${prefix}(\\d+)$`));
  return m ? Number(m[1]) : 0;
}

/** Next free code — max numeric suffix over ALL rows (active or not) + 1. */
export function nextOutcomeCode(existingCodes: string[], prefix: 'PO' | 'PSO'): string {
  const max = existingCodes.reduce((acc, c) => Math.max(acc, outcomeNumber(c, prefix)), 0);
  return `${prefix}${max + 1}`;
}

export function sortOutcomeRows<T extends OutcomeRow>(rows: T[], kind: OutcomeKind): T[] {
  const col = OUTCOME_CODE_COLUMN[kind];
  const prefix = OUTCOME_PREFIX[kind];
  return [...rows].sort((a, b) => {
    const na = outcomeNumber((a as Record<string, string>)[col] ?? '', prefix);
    const nb = outcomeNumber((b as Record<string, string>)[col] ?? '', prefix);
    if (na !== nb) return na - nb;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function listOutcomes<T extends OutcomeRow>(
  db: SupabaseClient,
  target: Pick<ProgrammeOutcomeTarget, 'ids' | 'regIds' | 'programmeCode'>,
  kind: OutcomeKind,
  opts: { includeInactive?: boolean } = {}
): Promise<T[]> {
  let q = db
    .from(OUTCOME_TABLE[kind])
    .select('*')
    .in('institutions_id', target.ids)
    .in('regulation_id', target.regIds)
    .eq('programme_code', target.programmeCode);
  if (!opts.includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q.order('sort_order', { ascending: true });
  if (error) throw error;
  return sortOutcomeRows((data ?? []) as T[], kind);
}

// ── Writes (never DELETE) ───────────────────────────────────────────────────

function insertStamp(target: ProgrammeOutcomeTarget, userId: string) {
  return {
    institutions_id: target.canonicalId,
    regulation_id: target.regulationId,
    programme_code: target.programmeCode,
    programme_id: target.programme?.id ?? null,
    department_id: target.programme?.department_id ?? null,
    created_by: userId,
    updated_by: userId,
  };
}

/**
 * Batch "replace" with NO deletes: upsert each incoming row by code (update
 * description / order, reactivate), then soft-deactivate active rows whose
 * code is no longer present. Used by the taxonomy batch editors
 * (compositions Outcomes tab) so they honour the no-delete rule too.
 */
export async function syncOutcomeSet<T extends OutcomeRow>(
  db: SupabaseClient,
  target: ProgrammeOutcomeTarget,
  kind: OutcomeKind,
  rows: Array<{ code: string; description?: string | null }>,
  userId: string
): Promise<T[]> {
  const table = OUTCOME_TABLE[kind];
  const col = OUTCOME_CODE_COLUMN[kind];

  const existing = await listOutcomes<T>(db, target, kind, { includeInactive: true });
  const byCode = new Map<string, T>();
  for (const r of existing) byCode.set(((r as Record<string, string>)[col] ?? '').toUpperCase(), r);

  const keep = new Set<string>();
  const inserts: Record<string, unknown>[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const code = rows[idx].code.trim().toUpperCase();
    if (!code) continue;
    keep.add(code);
    const description = rows[idx].description?.trim() ?? null;
    const current = byCode.get(code);
    if (current) {
      const { error } = await db
        .from(table)
        .update({ description, sort_order: idx + 1, is_active: true, updated_by: userId })
        .eq('id', current.id);
      if (error) throw error;
    } else {
      inserts.push({ ...insertStamp(target, userId), [col]: code, description, sort_order: idx + 1 });
    }
  }

  if (inserts.length > 0) {
    const { error } = await db.from(table).insert(inserts);
    if (error) throw error;
  }

  const toDeactivate = existing
    .filter((r) => r.is_active !== false && !keep.has(((r as Record<string, string>)[col] ?? '').toUpperCase()))
    .map((r) => r.id);
  if (toDeactivate.length > 0) {
    const { error } = await db
      .from(table)
      .update({ is_active: false, updated_by: userId })
      .in('id', toDeactivate);
    if (error) throw error;
  }

  return listOutcomes<T>(db, target, kind);
}

/** Add ONE outcome with the next free code (HOD row-level "Add PO/PSO"). */
export async function createOutcome<T extends OutcomeRow>(
  db: SupabaseClient,
  target: ProgrammeOutcomeTarget,
  kind: OutcomeKind,
  input: { description: string; code?: string },
  userId: string
): Promise<T> {
  const table = OUTCOME_TABLE[kind];
  const col = OUTCOME_CODE_COLUMN[kind];
  const prefix = OUTCOME_PREFIX[kind];

  const existing = await listOutcomes<T>(db, target, kind, { includeInactive: true });
  const codes = existing.map((r) => (r as Record<string, string>)[col] ?? '');
  const code = (input.code?.trim().toUpperCase() || nextOutcomeCode(codes, prefix));

  // A code that already exists (e.g. a deactivated PO3) is reactivated with
  // the new description instead of violating the unique constraint.
  const clash = existing.find((r) => ((r as Record<string, string>)[col] ?? '').toUpperCase() === code);
  if (clash) {
    const { data, error } = await db
      .from(table)
      .update({ description: input.description.trim(), is_active: true, updated_by: userId })
      .eq('id', clash.id)
      .select()
      .single();
    if (error) throw error;
    return data as T;
  }

  const maxOrder = existing.reduce((acc, r) => Math.max(acc, r.sort_order ?? 0), 0);
  const { data, error } = await db
    .from(table)
    .insert({
      ...insertStamp(target, userId),
      [col]: code,
      description: input.description.trim(),
      sort_order: maxOrder + 1,
    })
    .select()
    .single();
  if (error) throw error;
  return data as T;
}

/** Edit description and/or flip is_active on ONE outcome row. */
export async function updateOutcome<T extends OutcomeRow>(
  db: SupabaseClient,
  target: Pick<ProgrammeOutcomeTarget, 'ids' | 'regIds' | 'programmeCode'>,
  kind: OutcomeKind,
  id: string,
  patch: { description?: string; is_active?: boolean },
  userId: string
): Promise<T | null> {
  const table = OUTCOME_TABLE[kind];
  const update: Record<string, unknown> = { updated_by: userId };
  if (patch.description !== undefined) update.description = patch.description.trim();
  if (patch.is_active !== undefined) update.is_active = patch.is_active;

  // The scope filter makes the id un-forgeable across programmes/institutions.
  const { data, error } = await db
    .from(table)
    .update(update)
    .eq('id', id)
    .in('institutions_id', target.ids)
    .in('regulation_id', target.regIds)
    .eq('programme_code', target.programmeCode)
    .select()
    .maybeSingle();
  if (error) throw error;
  return (data as T | null) ?? null;
}

// ── Correlation levels ──────────────────────────────────────────────────────
// Canonical storage in bos_course_outcome_mappings is 1 / 2 / 3. Syllabus
// po_mappings hold BOTH encodings (L/M/H from the editor, "1"/"2"/"3" from
// the docx importer — see po_mapping value-encoding note), so reads tolerate
// both and the UI renders per institution convention.

export type CorrelationLevel = 0 | 1 | 2 | 3;

export function normalizeLevel(v: unknown): CorrelationLevel {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim().toUpperCase();
  if (s === 'H' || s === '3') return 3;
  if (s === 'M' || s === '2') return 2;
  if (s === 'L' || s === '1') return 1;
  return 0;
}

export function sanitizeLevels(input: unknown): Record<string, CorrelationLevel> {
  const out: Record<string, CorrelationLevel> = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const code = k.trim().toUpperCase();
    const level = normalizeLevel(v);
    if (code && level > 0) out[code] = level;
  }
  return out;
}

/**
 * Course-level PO/PSO levels DERIVED from a syllabus CO–PO matrix: the
 * maximum correlation any CO declares against each outcome.
 */
export function deriveCourseLevels(
  poMappings: BosPOMappingsData | Record<string, unknown> | null | undefined
): { po: Record<string, CorrelationLevel>; pso: Record<string, CorrelationLevel> } {
  const po: Record<string, CorrelationLevel> = {};
  const pso: Record<string, CorrelationLevel> = {};
  const mappings = (poMappings as BosPOMappingsData | null | undefined)?.mappings;
  if (!Array.isArray(mappings)) return { po, pso };
  for (const m of mappings) {
    for (const [k, v] of Object.entries(m?.pos ?? {})) {
      const lvl = normalizeLevel(v);
      const code = k.toUpperCase();
      if (lvl > (po[code] ?? 0)) po[code] = lvl;
    }
    for (const [k, v] of Object.entries(m?.psos ?? {})) {
      const lvl = normalizeLevel(v);
      const code = k.toUpperCase();
      if (lvl > (pso[code] ?? 0)) pso[code] = lvl;
    }
  }
  return { po, pso };
}
