// =============================================================================
// lib/services/pde-course-linkage-service.ts
// PDE Tier 4 — T4.2: course + lesson linkage service.
// =============================================================================
//
// Substrate for tying PDE demonstrations to academic courses (public.courses)
// and lessons (public.vac_lessons). Adds three read/write helpers used by the
// /api/pde/course-linkage REST surface:
//
//   - getDemonstrationsByCourse(courseId)  — aggregate + 5 samples
//   - getDemonstrationsByLesson(lessonId)  — aggregate + 5 samples
//   - linkDemonstrationToCourse(input)     — UPDATE pde_demonstrations
//
// Aggregation strategy mirrors lib/services/pde-cohort-service.ts: fold rows
// in TypeScript (acceptable at early-adoption volume). Switch to a PG
// aggregate RPC once a single course crosses ~5k demonstrations.
//
// RLS does the heavy lifting on the SELECT side — callers see only rows their
// role permits. The PATCH path is intentionally narrow: the learner who owns
// the demonstration OR an admin/staff role (enforced via RLS UPDATE policy
// on pde_demonstrations) may link. We don't re-check role here.
//
// HARD NEGATIVE: this module never reads or writes courses / vac_lessons
// schemas. It only references their PKs via the FK columns added in
// 20260520_pde_demonstrations_course_linkage.sql.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { PdeDemonstrationRow } from '@/lib/services/pde-scoring-service';
import type {
  DemonstrationsByCourseResult,
  DemonstrationsByLessonResult,
  LinkDemonstrationInput,
  LinkedDemonstration,
} from '@/lib/types/pde-course-linkage';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Sample cap returned in by-course / by-lesson aggregations. */
const SAMPLE_LIMIT = 5;

/** Hard read cap matching pde-cohort-service. */
const READ_CAP = 5000;

/** Status values we expect to see (kept open — we count whatever arrives). */
const KNOWN_STATUSES = ['draft', 'submitted', 'validated', 'scored', 'rejected'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyStatusMap(): Record<string, number> {
  return KNOWN_STATUSES.reduce(
    (acc, key) => {
      acc[key] = 0;
      return acc;
    },
    {} as Record<string, number>
  );
}

function isUuid(value: string): boolean {
  // RFC 4122 v1-v5 shape; cheap front-line guard before going to PG.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function resolveClient(
  supabase?: SupabaseClient
): Promise<SupabaseClient> {
  if (supabase) return supabase;
  return (await createServerSupabaseClient()) as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Aggregate demos linked to a single course. Returns counts by status +
 * category and up to SAMPLE_LIMIT recent rows. Returns an empty-shape result
 * when zero demos exist for the course (never throws on no rows).
 */
export async function getDemonstrationsByCourse(
  courseId: string,
  supabase?: SupabaseClient
): Promise<DemonstrationsByCourseResult> {
  if (!isUuid(courseId)) {
    throw new Error('course_id must be a uuid');
  }

  const client = await resolveClient(supabase);
  const { data, error } = await client
    .from('pde_demonstrations')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(READ_CAP);

  if (error) {
    throw new Error(`pde-course-linkage: ${error.message}`);
  }

  const rows = (data ?? []) as LinkedDemonstration[];
  const by_status = emptyStatusMap();
  const by_category: Record<string, number> = {};

  for (const row of rows) {
    by_status[row.status] = (by_status[row.status] ?? 0) + 1;
    by_category[row.category_key] = (by_category[row.category_key] ?? 0) + 1;
  }

  return {
    course_id: courseId,
    total: rows.length,
    by_status,
    by_category,
    samples: rows.slice(0, SAMPLE_LIMIT),
  };
}

/**
 * Aggregate demos linked to a single lesson. Same shape as the by-course
 * helper.
 */
export async function getDemonstrationsByLesson(
  lessonId: string,
  supabase?: SupabaseClient
): Promise<DemonstrationsByLessonResult> {
  if (!isUuid(lessonId)) {
    throw new Error('lesson_id must be a uuid');
  }

  const client = await resolveClient(supabase);
  const { data, error } = await client
    .from('pde_demonstrations')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: false })
    .limit(READ_CAP);

  if (error) {
    throw new Error(`pde-course-linkage: ${error.message}`);
  }

  const rows = (data ?? []) as LinkedDemonstration[];
  const by_status = emptyStatusMap();
  const by_category: Record<string, number> = {};

  for (const row of rows) {
    by_status[row.status] = (by_status[row.status] ?? 0) + 1;
    by_category[row.category_key] = (by_category[row.category_key] ?? 0) + 1;
  }

  return {
    lesson_id: lessonId,
    total: rows.length,
    by_status,
    by_category,
    samples: rows.slice(0, SAMPLE_LIMIT),
  };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Link (or unlink) a demonstration to a course and optionally a lesson.
 * Pass courseId=null to unlink the course; lessonId is optional and only
 * applied when present (undefined leaves it unchanged; null clears it).
 *
 * RLS enforces "who may UPDATE which row" — this function only writes the
 * FK columns and timestamps. Caller is responsible for authn (route layer).
 */
export async function linkDemonstrationToCourse(
  input: LinkDemonstrationInput,
  supabase?: SupabaseClient
): Promise<PdeDemonstrationRow> {
  const { demonstrationId, courseId, lessonId } = input;

  if (!isUuid(demonstrationId)) {
    throw new Error('demonstrationId must be a uuid');
  }
  if (courseId !== null && !isUuid(courseId)) {
    throw new Error('courseId must be a uuid or null');
  }
  if (lessonId !== undefined && lessonId !== null && !isUuid(lessonId)) {
    throw new Error('lessonId must be a uuid, null, or undefined');
  }

  const client = await resolveClient(supabase);

  const patch: Record<string, unknown> = {
    course_id: courseId,
    updated_at: new Date().toISOString(),
  };
  if (lessonId !== undefined) {
    patch.lesson_id = lessonId;
  }

  const { data, error } = await client
    .from('pde_demonstrations')
    .update(patch)
    .eq('id', demonstrationId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`pde-course-linkage: ${error.message}`);
  }
  if (!data) {
    throw new Error('pde-course-linkage: demonstration not found or RLS-denied');
  }

  return data as PdeDemonstrationRow;
}
