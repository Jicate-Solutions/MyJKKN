// =============================================================================
// lib/services/pde-curriculum-service.ts
// PDE <-> BoS Outcome Connector — curriculum reads + CLO/PO attainment math.
// =============================================================================
//
// Spec: specs/pde-bos-outcome-connector-2026-06-11.md (locked 2026-06-11)
//
// Step-0 verdict (extend-vs-new): NEW service. lib/services/obe/* are
// client-side CRUD over the obe_program_outcomes / obe_co_po_mapping tables —
// a parallel, exam-based OBE substrate with no attainment math and no
// bos_course_syllabi awareness. This connector parses the BoS JSONB shapes
// (course_learning_outcomes.clos[], po_mappings.mappings[]) which no existing
// service touches. Pattern sources: pde-course-linkage-service.ts (function
// exports, server client, fold-in-TS, READ_CAP) + pde-cohort-service.ts
// (aggregator shape) + pde-demonstration-service.ts (fn_get_policy_json reads).
//
// HARD NEGATIVE: bos_* and vac_* tables are strictly READ-ONLY here (T4.3
// discipline). This service never writes anything.
//
// Attainment math (spec §7):
//   CLO_attainment(syllabus, n) = distinct learners with ≥1 PASSED demo whose
//                                 clo_refs_confirmed contains n
//                               ÷ distinct learners with ≥1 demo on syllabus
//                                 (status not draft/withdrawn)
//   PO_attainment(PO_k) = Σ CLO_attainment × weight(H/M/L) ÷ Σ weights
//     weights from platform_policies 'pde.obe.po_weight_map' (zero-deploy tune)
//
// Denominator is "participating learners" (Director-locked §4.2) — label it so
// in every UI. Attainment reads clo_refs_confirmed ONLY (§4.8): the validator-
// confirmed set, never the learner's raw proposals.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  AttainmentDemoRow,
  BosSyllabusOption,
  CLOAttainmentRow,
  CurriculumAttainmentResult,
  OutcomeAttainmentRow,
  PoMappingEntry,
  SyllabusAttainment,
  SyllabusCLO,
  SyllabusCLOResult,
  VacCourseOption,
} from '@/lib/types/pde-curriculum';

type AnyClient = SupabaseClient<any, any, any>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard read cap matching pde-course-linkage-service / cohort-service. */
const READ_CAP = 5000;

/** Syllabus list cap — 397 latest rows live today; headroom for growth. */
const SYLLABUS_LIST_CAP = 1000;

/** Defaults mirror the migration's policy seeds; used when policy read fails. */
const DEFAULT_CLO_TAG_CAP = 2;
const DEFAULT_PO_WEIGHT_MAP: Record<string, number> = { H: 1.0, M: 0.5, L: 0.25 };

/** Demos in these states don't count as participation (drafts are private;
 * withdrawn is learner-retracted). Rejected demos DO count as participation —
 * the learner engaged — they just never attain (passed-only numerator). */
const NON_PARTICIPATING_STATUSES = new Set(['draft', 'withdrawn']);

async function resolveClient(client?: AnyClient): Promise<AnyClient> {
  if (client) return client;
  return (await createServerSupabaseClient()) as unknown as AnyClient;
}

// ---------------------------------------------------------------------------
// Pure parsers / folds (exported for vitest — no Supabase dependency)
// ---------------------------------------------------------------------------

/**
 * Parse bos_course_syllabi.course_learning_outcomes into SyllabusCLO[].
 * Handles both `{ clos: [...] }` (the probed live shape) and a bare array
 * (JSONB columns in this codebase may store either — CLAUDE.md rule).
 * Malformed entries are skipped, never thrown.
 */
export function parseSyllabusClos(raw: unknown): SyllabusCLO[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as any).clos)
      ? (raw as any).clos
      : [];

  const out: SyllabusCLO[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const n = Number((entry as any).clo_number);
    if (!Number.isInteger(n) || n <= 0) continue;
    out.push({
      clo_number: n,
      description: typeof (entry as any).description === 'string' ? (entry as any).description : '',
      k_values: Array.isArray((entry as any).k_values)
        ? (entry as any).k_values.filter((k: unknown) => typeof k === 'string')
        : [],
    });
  }
  return out.sort((a, b) => a.clo_number - b.clo_number);
}

/**
 * Parse bos_course_syllabi.po_mappings into PoMappingEntry[]. The co_id →
 * clo_number join is by convention ("CO3" → 3); entries whose co_id carries
 * no digits get clo_number=null and are ignored by the PO roll-up.
 */
export function parsePoMappings(raw: unknown): PoMappingEntry[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as any).mappings)
      ? (raw as any).mappings
      : [];

  const out: PoMappingEntry[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const coId = typeof (entry as any).co_id === 'string' ? (entry as any).co_id : '';
    const digits = coId.replace(/\D/g, '');
    const cloNumber = digits ? Number(digits) : null;
    const pos = (entry as any).pos;
    const psos = (entry as any).psos;
    out.push({
      co_id: coId,
      clo_number: Number.isInteger(cloNumber) && (cloNumber as number) > 0 ? cloNumber : null,
      pos: pos && typeof pos === 'object' && !Array.isArray(pos) ? pos : {},
      psos: psos && typeof psos === 'object' && !Array.isArray(psos) ? psos : {},
    });
  }
  return out;
}

/** Normalize a clo_refs / clo_refs_confirmed JSONB value to number[]. */
export function normalizeCloRefs(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const v of raw) {
    const n = Number(v);
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Fold demonstration rows into per-CLO attainment for one syllabus version.
 * Pure — never divides by zero: 0 participants → attainment_pct null.
 */
export function foldCloAttainment(
  clos: SyllabusCLO[],
  demos: AttainmentDemoRow[],
): { participating_learners: number; clos: CLOAttainmentRow[] } {
  const participating = new Set<string>();
  const attainedByClo = new Map<number, Set<string>>();

  for (const demo of demos) {
    if (NON_PARTICIPATING_STATUSES.has(demo.status)) continue;
    participating.add(demo.learner_id);
    if (demo.passed !== true) continue;
    for (const n of normalizeCloRefs(demo.clo_refs_confirmed)) {
      if (!attainedByClo.has(n)) attainedByClo.set(n, new Set());
      attainedByClo.get(n)!.add(demo.learner_id);
    }
  }

  const denominator = participating.size;
  return {
    participating_learners: denominator,
    clos: clos.map((clo) => {
      const attained = attainedByClo.get(clo.clo_number)?.size ?? 0;
      return {
        clo_number: clo.clo_number,
        description: clo.description,
        attained_learners: attained,
        participating_learners: denominator,
        attainment_pct:
          denominator > 0 ? Math.round((attained / denominator) * 1000) / 10 : null,
      };
    }),
  };
}

/**
 * Weighted PO/PSO roll-up across syllabi (spec §7). Only CLOs with computable
 * attainment (non-null pct) contribute; unknown correlation grades (not in the
 * weight map) are skipped rather than guessed.
 */
export function foldPoAttainment(
  sections: Array<{ attainment: SyllabusAttainment; mappings: PoMappingEntry[] }>,
  weightMap: Record<string, number>,
): { po: OutcomeAttainmentRow[]; pso: OutcomeAttainmentRow[] } {
  interface Acc {
    weightedSum: number;
    weightTotal: number;
    clos: number;
  }
  const poAcc = new Map<string, Acc>();
  const psoAcc = new Map<string, Acc>();

  const bump = (
    acc: Map<string, Acc>,
    key: string,
    grade: string,
    attainmentPct: number,
  ) => {
    const weight = weightMap[grade];
    if (typeof weight !== 'number' || weight <= 0) return;
    const cur = acc.get(key) ?? { weightedSum: 0, weightTotal: 0, clos: 0 };
    cur.weightedSum += attainmentPct * weight;
    cur.weightTotal += weight;
    cur.clos += 1;
    acc.set(key, cur);
  };

  for (const { attainment, mappings } of sections) {
    const cloPct = new Map<number, number>();
    for (const row of attainment.clos) {
      if (row.attainment_pct !== null) cloPct.set(row.clo_number, row.attainment_pct);
    }
    for (const mapping of mappings) {
      if (mapping.clo_number === null) continue;
      const pct = cloPct.get(mapping.clo_number);
      if (pct === undefined) continue;
      for (const [key, grade] of Object.entries(mapping.pos)) {
        bump(poAcc, key, String(grade), pct);
      }
      for (const [key, grade] of Object.entries(mapping.psos)) {
        bump(psoAcc, key, String(grade), pct);
      }
    }
  }

  const toRows = (acc: Map<string, Acc>): OutcomeAttainmentRow[] =>
    Array.from(acc.entries())
      .map(([outcome_key, a]) => ({
        outcome_key,
        attainment_pct:
          a.weightTotal > 0 ? Math.round((a.weightedSum / a.weightTotal) * 10) / 10 : null,
        total_weight: Math.round(a.weightTotal * 100) / 100,
        contributing_clos: a.clos,
      }))
      // natural sort: PO2 before PO10
      .sort((a, b) =>
        a.outcome_key.localeCompare(b.outcome_key, undefined, { numeric: true }),
      );

  return { po: toRows(poAcc), pso: toRows(psoAcc) };
}

// ---------------------------------------------------------------------------
// Policy reads (fn_get_policy_json — per-institution overrides honored later)
// ---------------------------------------------------------------------------

/** Max CLOs a learner may propose per demonstration. Fail-soft to 2. */
export async function getCloTagCap(client?: AnyClient): Promise<number> {
  const supabase = await resolveClient(client);
  const { data, error } = await (supabase as any).rpc('fn_get_policy_json', {
    p_key: 'pde.obe.clo_tag_cap',
    p_default: DEFAULT_CLO_TAG_CAP,
    p_scope_id: null,
  });
  if (error) return DEFAULT_CLO_TAG_CAP;
  const n = Number(data);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_CLO_TAG_CAP;
}

/** H/M/L → weight map for the PO roll-up. Fail-soft to seeded defaults. */
export async function getPoWeightMap(
  client?: AnyClient,
): Promise<Record<string, number>> {
  const supabase = await resolveClient(client);
  const { data, error } = await (supabase as any).rpc('fn_get_policy_json', {
    p_key: 'pde.obe.po_weight_map',
    p_default: DEFAULT_PO_WEIGHT_MAP,
    p_scope_id: null,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    return DEFAULT_PO_WEIGHT_MAP;
  }
  const out: Record<string, number> = {};
  for (const [grade, weight] of Object.entries(data as Record<string, unknown>)) {
    const w = Number(weight);
    if (Number.isFinite(w) && w > 0) out[grade] = w;
  }
  return Object.keys(out).length > 0 ? out : DEFAULT_PO_WEIGHT_MAP;
}

// ---------------------------------------------------------------------------
// Curriculum reads (BoS / VAC pickers — own-institution scoped, spec §4.9)
//
// All three go through SECURITY DEFINER RPCs (migration 20260611233000), NOT
// plain table reads: bos_course_syllabi RLS requires BoS board membership and
// vac_courses RLS requires a user_institution_access row — learners (and
// non-BoS faculty validators) can't pass either. The RPCs expose only
// picker-minimal columns and enforce own-institution scoping at the DB layer.
// ---------------------------------------------------------------------------

/**
 * Approved BoS syllabi for the CALLER's institution. "Approved" := is_latest
 * AND NOT is_archived (bos_course_syllabi has no approval-status column).
 */
export async function listApprovedSyllabi(
  client?: AnyClient,
): Promise<BosSyllabusOption[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await (supabase as any).rpc('fn_pde_list_approved_syllabi');

  if (error) throw new Error(`pde-curriculum listApprovedSyllabi: ${error.message}`);
  return ((data ?? []) as BosSyllabusOption[]).slice(0, SYLLABUS_LIST_CAP);
}

/** Active VAC courses for the caller's institution (course-level lane — no CLOs). */
export async function listVacCourses(
  client?: AnyClient,
): Promise<VacCourseOption[]> {
  const supabase = await resolveClient(client);
  const { data, error } = await (supabase as any).rpc('fn_pde_list_vac_courses');

  if (error) throw new Error(`pde-curriculum listVacCourses: ${error.message}`);
  return ((data ?? []) as VacCourseOption[]).slice(0, SYLLABUS_LIST_CAP);
}

/** Raw RPC row shape for fn_pde_get_syllabus_outcomes. */
interface SyllabusOutcomeRow {
  id: string;
  course_code: string;
  course_name: string;
  version_number: number;
  course_learning_outcomes: unknown;
  po_mappings: unknown;
}

/** Fetch outcome JSONB for a set of syllabus versions (caller-scoped RPC). */
async function fetchSyllabusOutcomes(
  syllabusIds: string[],
  client?: AnyClient,
): Promise<SyllabusOutcomeRow[]> {
  if (syllabusIds.length === 0) return [];
  const supabase = await resolveClient(client);
  const { data, error } = await (supabase as any).rpc('fn_pde_get_syllabus_outcomes', {
    p_syllabus_ids: syllabusIds,
  });
  if (error) throw new Error(`pde-curriculum fetchSyllabusOutcomes: ${error.message}`);
  return (data ?? []) as SyllabusOutcomeRow[];
}

/** One syllabus + its parsed CLO list. Null when missing / out of scope. */
export async function getSyllabusCLOs(
  syllabusId: string,
  client?: AnyClient,
): Promise<SyllabusCLOResult | null> {
  const rows = await fetchSyllabusOutcomes([syllabusId], client);
  const data = rows[0];
  if (!data) return null;

  return {
    syllabus: {
      id: data.id,
      course_code: data.course_code,
      course_name: data.course_name,
      version_number: data.version_number,
    },
    clos: parseSyllabusClos(data.course_learning_outcomes),
  };
}

// ---------------------------------------------------------------------------
// Attainment
// ---------------------------------------------------------------------------

interface DemoFetchRow {
  learner_id: string;
  status: string;
  passed: boolean | null;
  clo_refs_confirmed: unknown;
  bos_syllabus_id: string | null;
}

function toAttainmentRows(rows: DemoFetchRow[]): AttainmentDemoRow[] {
  return rows.map((r) => ({
    learner_id: r.learner_id,
    status: r.status,
    passed: r.passed,
    clo_refs_confirmed: normalizeCloRefs(r.clo_refs_confirmed),
  }));
}

/** CLO attainment for ONE syllabus version. */
export async function computeCLOAttainment(
  syllabusId: string,
  client?: AnyClient,
): Promise<SyllabusAttainment | null> {
  const supabase = await resolveClient(client);
  const syllabus = await getSyllabusCLOs(syllabusId, supabase);
  if (!syllabus) return null;

  const { data, error } = await (supabase as any)
    .from('pde_demonstrations')
    .select('learner_id, status, passed, clo_refs_confirmed, bos_syllabus_id')
    .eq('bos_syllabus_id', syllabusId)
    .limit(READ_CAP);

  if (error) throw new Error(`pde-curriculum computeCLOAttainment: ${error.message}`);

  const rows = (data ?? []) as DemoFetchRow[];
  const folded = foldCloAttainment(syllabus.clos, toAttainmentRows(rows));

  return {
    syllabus_id: syllabus.syllabus.id,
    course_code: syllabus.syllabus.course_code,
    course_name: syllabus.syllabus.course_name,
    version_number: syllabus.syllabus.version_number,
    participating_learners: folded.participating_learners,
    demo_count: rows.filter((r) => !NON_PARTICIPATING_STATUSES.has(r.status)).length,
    clos: folded.clos,
  };
}

/**
 * Full attainment picture: per-syllabus CLO sections + weighted PO/PSO roll-up.
 * institutionId narrows the demo set; omitted = whatever RLS allows
 * (super_admin sees all — mirrors PDEAccreditationEvidenceService).
 * Guaranteed-safe on zero evidence: returns empty sections, never divides by 0.
 */
export async function computePOAttainment(
  institutionId?: string | null,
  client?: AnyClient,
): Promise<CurriculumAttainmentResult> {
  const supabase = await resolveClient(client);

  let query = (supabase as any)
    .from('pde_demonstrations')
    .select('learner_id, status, passed, clo_refs_confirmed, bos_syllabus_id')
    .not('bos_syllabus_id', 'is', null)
    .limit(READ_CAP);
  if (institutionId) query = query.eq('institution_id', institutionId);

  const { data, error } = await query;
  if (error) throw new Error(`pde-curriculum computePOAttainment: ${error.message}`);

  const rows = (data ?? []) as DemoFetchRow[];
  const empty: CurriculumAttainmentResult = {
    institution_id: institutionId ?? null,
    generated_at: new Date().toISOString(),
    syllabi: [],
    po: [],
    pso: [],
    participating_learners: 0,
  };
  if (rows.length === 0) return empty;

  // Group demos by syllabus version (version pinning → one section per row id).
  const bySyllabus = new Map<string, DemoFetchRow[]>();
  for (const row of rows) {
    if (!row.bos_syllabus_id) continue;
    if (!bySyllabus.has(row.bos_syllabus_id)) bySyllabus.set(row.bos_syllabus_id, []);
    bySyllabus.get(row.bos_syllabus_id)!.push(row);
  }

  const syllabusIds = Array.from(bySyllabus.keys());
  const syllabusRows = await fetchSyllabusOutcomes(syllabusIds, supabase);

  const weightMap = await getPoWeightMap(supabase);
  const sections: Array<{ attainment: SyllabusAttainment; mappings: PoMappingEntry[] }> = [];
  const allParticipants = new Set<string>();

  for (const syl of syllabusRows) {
    const demos = bySyllabus.get(syl.id) ?? [];
    const clos = parseSyllabusClos(syl.course_learning_outcomes);
    const folded = foldCloAttainment(clos, toAttainmentRows(demos));
    for (const d of demos) {
      if (!NON_PARTICIPATING_STATUSES.has(d.status)) allParticipants.add(d.learner_id);
    }
    sections.push({
      attainment: {
        syllabus_id: syl.id,
        course_code: syl.course_code,
        course_name: syl.course_name,
        version_number: syl.version_number,
        participating_learners: folded.participating_learners,
        demo_count: demos.filter((d) => !NON_PARTICIPATING_STATUSES.has(d.status)).length,
        clos: folded.clos,
      },
      mappings: parsePoMappings(syl.po_mappings),
    });
  }

  sections.sort((a, b) =>
    `${a.attainment.course_code}#${a.attainment.version_number}`.localeCompare(
      `${b.attainment.course_code}#${b.attainment.version_number}`,
      undefined,
      { numeric: true },
    ),
  );

  const rolled = foldPoAttainment(sections, weightMap);

  return {
    institution_id: institutionId ?? null,
    generated_at: new Date().toISOString(),
    syllabi: sections.map((s) => s.attainment),
    po: rolled.po,
    pso: rolled.pso,
    participating_learners: allParticipants.size,
  };
}
