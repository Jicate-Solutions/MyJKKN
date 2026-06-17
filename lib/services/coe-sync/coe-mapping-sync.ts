/**
 * COE course-scheme → MyJKKN course_mappings sync (server-side only).
 *
 * COE keys a mapping by CODE (program_code, semester_code, course_code). MyJKKN's
 * course_mappings needs UUIDs (degree_id, department_id, program_id, semester_id,
 * course_id). This module is the code→UUID resolver.
 *
 * Resolution chain (cheaper than it looks):
 *   program_code  → programs.program_id  (program_id IS the shared code COE echoes)
 *                   degree_id + department_id come FREE off the resolved program row
 *   semester_code → semesters by (program_id, semester_code)
 *   course_code   → courses (already mirrored, matched by course_code)
 *
 * Anything that fails to resolve is collected into `skipped` — NEVER silently
 * dropped — so a drifted program_id / missing semester / un-mirrored course is
 * visible in the run summary.
 *
 * Run AFTER mirrorCoeCourses() so course_code → course UUID lookups hit.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInstitutionContext,
  type InstitutionContext,
} from '@/lib/utils/institutions/institution-resolver';
import type { BosCourseMapping } from '@/types/bos-courses';

export interface MappingSkip {
  institutionId: string;
  program_code: string | null;
  semester_code: string | null;
  course_code: string | null;
  reason:
    | 'program_code unmatched'
    | 'semester_code unmatched'
    | 'course not mirrored'
    | 'incomplete COE row';
}

export interface MappingSyncResult {
  institutionId: string;
  myjkknInstitutionIds: string[];
  coeMappingsFetched: number;
  upserted: number;
  skipped: MappingSkip[];
  errors: string[];
}

const MAPPING_LIMIT = 2000;

interface ProgramRef {
  id: string;
  degree_id: string;
  department_id: string;
}

function unwrapMappings(raw: unknown): BosCourseMapping[] {
  if (Array.isArray(raw)) return raw as BosCourseMapping[];
  return ((raw as { data?: BosCourseMapping[] })?.data ?? []) as BosCourseMapping[];
}

/**
 * Sync COE course-mappings into MyJKKN course_mappings for ONE institution
 * (and its CAS sibling, if any). Caller confirms the institution is COE-mastered.
 */
export async function syncCoeMappings(
  supabase: SupabaseClient,
  myjkknInstitutionId: string,
  ctx?: InstitutionContext | null,
): Promise<MappingSyncResult> {
  const result: MappingSyncResult = {
    institutionId: myjkknInstitutionId,
    myjkknInstitutionIds: [],
    coeMappingsFetched: 0,
    upserted: 0,
    skipped: [],
    errors: [],
  };

  const context =
    ctx ??
    (await resolveInstitutionContext(
      myjkknInstitutionId,
      supabase as unknown as Parameters<typeof resolveInstitutionContext>[1],
    ));

  if (!context || !context.coe_id) {
    result.errors.push('Institution not mapped in COE (no coe_id)');
    return result;
  }

  const targetIds =
    context.myjkkn_institution_ids.length > 0
      ? context.myjkkn_institution_ids
      : [myjkknInstitutionId];
  result.myjkknInstitutionIds = targetIds;

  const client = CoeRestClient.create();
  const coeMappings = unwrapMappings(
    await client.get<unknown>('/api/v1/course-mapping', {
      institutions_id: context.coe_id,
      is_active: 'true',
      details: 'false',
      limit: String(MAPPING_LIMIT),
    }),
  );
  result.coeMappingsFetched = coeMappings.length;

  for (const institutionId of targetIds) {
    // ── Build the three code→UUID lookups for THIS institution ───────────────
    const [programsRes, semestersRes, coursesRes] = await Promise.all([
      supabase
        .from('programs')
        .select('id, program_id, degree_id, department_id')
        .eq('institution_id', institutionId),
      supabase
        .from('semesters')
        .select('id, program_id, semester_code')
        .eq('institution_id', institutionId),
      supabase
        .from('courses')
        .select('id, course_code')
        .eq('institution_id', institutionId),
    ]);

    if (programsRes.error || semestersRes.error || coursesRes.error) {
      result.errors.push(
        `lookup(${institutionId}): ${(programsRes.error ?? semestersRes.error ?? coursesRes.error)?.message}`,
      );
      continue;
    }

    // program_code === programs.program_id (the shared natural key)
    const programByCode = new Map<string, ProgramRef>();
    for (const p of programsRes.data ?? []) {
      if (p.program_id) {
        programByCode.set(String(p.program_id), {
          id: p.id,
          degree_id: p.degree_id,
          department_id: p.department_id,
        });
      }
    }
    // semester keyed by (program UUID + semester_code)
    const semesterByKey = new Map<string, string>();
    for (const s of semestersRes.data ?? []) {
      if (s.program_id && s.semester_code) {
        semesterByKey.set(`${s.program_id}|${s.semester_code}`, s.id);
      }
    }
    const courseByCode = new Map<string, string>();
    for (const c of coursesRes.data ?? []) {
      if (c.course_code) courseByCode.set(c.course_code, c.id);
    }

    // ── Resolve each COE mapping row ─────────────────────────────────────────
    const upsertRows: Array<{
      institution_id: string;
      degree_id: string;
      department_id: string;
      program_id: string;
      semester_id: string;
      course_id: string;
      is_active: boolean;
    }> = [];

    for (const m of coeMappings) {
      const programCode = m.program_code ?? null;
      const semesterCode = m.semester_code ?? null;
      const courseCode = m.course_code ?? null;

      if (!programCode || !semesterCode || !courseCode) {
        result.skipped.push({
          institutionId, program_code: programCode, semester_code: semesterCode,
          course_code: courseCode, reason: 'incomplete COE row',
        });
        continue;
      }

      const program = programByCode.get(programCode);
      if (!program) {
        result.skipped.push({
          institutionId, program_code: programCode, semester_code: semesterCode,
          course_code: courseCode, reason: 'program_code unmatched',
        });
        continue;
      }

      const semesterId = semesterByKey.get(`${program.id}|${semesterCode}`);
      if (!semesterId) {
        result.skipped.push({
          institutionId, program_code: programCode, semester_code: semesterCode,
          course_code: courseCode, reason: 'semester_code unmatched',
        });
        continue;
      }

      const courseId = courseByCode.get(courseCode);
      if (!courseId) {
        result.skipped.push({
          institutionId, program_code: programCode, semester_code: semesterCode,
          course_code: courseCode, reason: 'course not mirrored',
        });
        continue;
      }

      upsertRows.push({
        institution_id: institutionId,
        degree_id: program.degree_id,
        department_id: program.department_id,
        program_id: program.id,
        semester_id: semesterId,
        course_id: courseId,
        is_active: true,
      });
    }

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from('course_mappings')
        .upsert(upsertRows, {
          onConflict:
            'institution_id,degree_id,department_id,program_id,semester_id,course_id',
        });
      if (error) {
        result.errors.push(`upsert(${institutionId}): ${error.message}`);
        continue;
      }
      result.upserted += upsertRows.length;
    }
  }

  return result;
}
