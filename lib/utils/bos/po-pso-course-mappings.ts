// ─────────────────────────────────────────────────────────────────────────────
// lib/utils/bos/po-pso-course-mappings.ts
//
// Course × PO/PSO rows for one (institution, regulation, programme) target —
// shared by the /api/bos/po-pso/course-mappings GET (HOD matrix) and the
// PO/PSO PDF export, so both print the same courses and levels.
//
// Courses = union of (a) the programme's latest learning pathways (boards
// governing the programme via bos_board_programmes, plus the board whose
// board_code equals the programme code — the engineering convention) and
// (b) explicit rows in bos_course_outcome_mappings. A course without an
// explicit row carries levels DERIVED from its CO-PO matrix
// (source='syllabus').
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCoeBoardMaps } from '@/lib/utils/bos/coe-boards';
import {
  deriveCourseLevels,
  sanitizeLevels,
  type CorrelationLevel,
  type ProgrammeOutcomeTarget,
} from '@/lib/utils/bos/programme-outcomes';
import type { BosCourseOutcomeMapping } from '@/types/bos';

export interface CourseMappingRow {
  course_code: string;
  course_name: string;
  course_id: string | null;
  semester: number | null;
  syllabus_id: string | null;
  mapping_id: string | null;
  source: 'explicit' | 'syllabus' | 'none';
  po_levels: Record<string, CorrelationLevel>;
  pso_levels: Record<string, CorrelationLevel>;
}

const PATHWAY_TABLE = 'bos_course_syllabi';

async function boardIdsForProgramme(
  db: SupabaseClient,
  target: ProgrammeOutcomeTarget
): Promise<string[]> {
  const ids = new Set<string>();
  const { data } = await db
    .from('bos_board_programmes')
    .select('board_id')
    .in('institutions_id', target.ids)
    .eq('programme_code', target.programmeCode)
    .eq('is_active', true);
  for (const r of (data ?? []) as { board_id: string }[]) ids.add(r.board_id);

  // Engineering convention: the board's code IS the programme code.
  const boards = await fetchCoeBoardMaps(target.ids);
  for (const [id, b] of boards) {
    if ((b.board_code ?? '').toUpperCase() === target.programmeCode) ids.add(id);
  }
  return [...ids];
}

/** Service-role read — the caller has already authorized the target. */
export async function loadCourseMappingRows(
  db: SupabaseClient,
  target: ProgrammeOutcomeTarget
): Promise<CourseMappingRow[]> {
  const boardIds = await boardIdsForProgramme(db, target);

  const [pathwaysRes, explicitRes] = await Promise.all([
    boardIds.length > 0
      ? db
          .from(PATHWAY_TABLE)
          .select('id, course_id, course_code, course_name, semester, po_mappings, created_at')
          .in('institutions_id', target.ids)
          .in('board_id', boardIds)
          .in('regulation_id', target.regIds)
          .eq('is_latest', true)
          .eq('is_archived', false)
          .order('semester', { ascending: true, nullsFirst: false })
          .order('course_code', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    db
      .from('bos_course_outcome_mappings')
      .select('*')
      .in('institutions_id', target.ids)
      .in('regulation_id', target.regIds)
      .eq('programme_code', target.programmeCode)
      .eq('is_active', true),
  ]);
  if (pathwaysRes.error) throw pathwaysRes.error;
  if (explicitRes.error) throw explicitRes.error;

  const explicitByCode = new Map<string, BosCourseOutcomeMapping>();
  for (const m of (explicitRes.data ?? []) as BosCourseOutcomeMapping[]) {
    explicitByCode.set(m.course_code.toUpperCase(), m);
  }

  const rows = new Map<string, CourseMappingRow>();
  type PathwayLite = {
    id: string; course_id: string | null; course_code: string; course_name: string;
    semester: number | null; po_mappings: unknown;
  };
  for (const s of (pathwaysRes.data ?? []) as PathwayLite[]) {
    const key = s.course_code.toUpperCase();
    if (rows.has(key)) continue; // first (lowest semester) wins
    const explicit = explicitByCode.get(key);
    const derived = deriveCourseLevels(s.po_mappings as never);
    rows.set(key, {
      course_code: s.course_code,
      course_name: explicit?.course_name || s.course_name,
      course_id: s.course_id ?? explicit?.course_id ?? null,
      semester: s.semester,
      syllabus_id: s.id,
      mapping_id: explicit?.id ?? null,
      source: explicit
        ? 'explicit'
        : (Object.keys(derived.po).length + Object.keys(derived.pso).length > 0 ? 'syllabus' : 'none'),
      po_levels: explicit ? sanitizeLevels(explicit.po_levels) : derived.po,
      pso_levels: explicit ? sanitizeLevels(explicit.pso_levels) : derived.pso,
    });
  }
  // Explicit rows for courses that have no learning pathway (yet).
  for (const [key, m] of explicitByCode) {
    if (rows.has(key)) continue;
    rows.set(key, {
      course_code: m.course_code,
      course_name: m.course_name ?? '',
      course_id: m.course_id ?? null,
      semester: null,
      syllabus_id: null,
      mapping_id: m.id,
      source: 'explicit',
      po_levels: sanitizeLevels(m.po_levels),
      pso_levels: sanitizeLevels(m.pso_levels),
    });
  }

  return [...rows.values()];
}
