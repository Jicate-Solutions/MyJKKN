// =============================================================================
// lib/services/pde-bos-evidence-service.ts
// PDE Tier 4 — T4.3 — read-only aggregator surfacing PDE demonstrations
// keyed to a BoS course review.
// =============================================================================
//
// Read-only. Uses the standard server Supabase client; RLS on bos_course_reviews,
// bos_course_syllabi and pde_demonstrations enforces authz.
//
// Linkage today
// -------------
// `pde_demonstrations` has no `course_id` column. The available join is by
// `institution_id` (the review's institution). We also pull the latest
// `bos_course_syllabi` row by `course_code` to surface PO mappings, since the
// syllabus table denormalizes course_code rather than course_id.
//
// When pde_demonstrations gets a course_id column in a later tier, tighten the
// .eq() filter inside `getEvidenceForReview` without changing the public shape.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type {
  BosCourseReview,
  BosReviewWithDemoCount,
  BosSyllabusLink,
  PdeBosEvidence,
  PdeEvidenceDemonstration,
} from '@/lib/types/pde-bos-evidence';
import type {
  PDECategoryKey,
  PDEDemonstrationStatus,
} from '@/lib/types/pde-demonstrations';

type AnyClient = SupabaseClient<any, any, any>;

async function resolveClient(client?: AnyClient): Promise<AnyClient> {
  if (client) return client;
  return (await createClient()) as unknown as AnyClient;
}

/**
 * Fetch one BoS course review by id + the PDE evidence captured for the
 * same institution. Returns null when the review id does not exist (or RLS
 * hides it from the caller).
 */
export async function getEvidenceForReview(
  reviewId: string,
  client?: AnyClient,
): Promise<PdeBosEvidence | null> {
  const supabase = await resolveClient(client);

  const { data: reviewRow, error: reviewErr } = await (supabase as any)
    .from('bos_course_reviews')
    .select('*')
    .eq('id', reviewId)
    .maybeSingle();

  if (reviewErr) throw reviewErr;
  if (!reviewRow) return null;

  const review = reviewRow as BosCourseReview;

  // Latest syllabus for this course_code in this institution — fetched FIRST so
  // the demonstration query can use the direct FK when available.
  const { data: syllabusRow } = await (supabase as any)
    .from('bos_course_syllabi')
    .select('id, course_code, course_name, po_mappings, is_latest')
    .eq('institutions_id', review.institution_id)
    .eq('course_code', review.course_code)
    .eq('is_latest', true)
    .maybeSingle();

  // Curriculum connector (2026-06-11): pde_demonstrations.bos_syllabus_id is
  // live — when this review's course has a syllabus, surface only the demos
  // actually linked to it. Fallback to the original institution-wide read when
  // no syllabus exists (public shape unchanged, per the T4.3 design note).
  let demoQuery = (supabase as any)
    .from('pde_demonstrations')
    .select('id, category_key, skill_name, status, weighted_score, created_at')
    .order('created_at', { ascending: false })
    .limit(500);
  demoQuery = syllabusRow
    ? demoQuery.eq('bos_syllabus_id', syllabusRow.id)
    : demoQuery.eq('institution_id', review.institution_id);

  const { data: demoRows, error: demoErr } = await demoQuery;

  if (demoErr) throw demoErr;

  const demonstrations: PdeEvidenceDemonstration[] = (demoRows ?? []).map(
    (row: any) => ({
      id: row.id,
      category_key: row.category_key as PDECategoryKey,
      skill_name: row.skill_name ?? null,
      status: row.status as PDEDemonstrationStatus,
      weighted_score: row.weighted_score ?? null,
      created_at: row.created_at,
    }),
  );

  const demonstrations_by_category = demonstrations.reduce(
    (acc, d) => {
      acc[d.category_key] = (acc[d.category_key] ?? 0) + 1;
      return acc;
    },
    {} as Partial<Record<PDECategoryKey, number>>,
  );

  // syllabusRow was fetched above (before the demo query) so the FK filter
  // could use it — here we only shape the public link object.
  const syllabus_link: BosSyllabusLink | null = syllabusRow
    ? {
        id: syllabusRow.id,
        course_code: syllabusRow.course_code,
        course_name: syllabusRow.course_name,
        po_mappings: syllabusRow.po_mappings ?? null,
      }
    : null;

  return {
    review,
    demonstrations,
    demonstrations_by_category,
    syllabus_link,
  };
}

/**
 * List BoS course reviews + a per-review demonstration count.
 *
 * Optimization
 * ------------
 * Two queries (reviews, then demos by institution_id ∈ set) folded in TS.
 * Acceptable while review volumes are low (early adoption). Switch to an SQL
 * aggregate RPC once review counts cross ~1k.
 */
export async function listReviewsWithPdeEvidence(
  institutionId?: string,
  client?: AnyClient,
): Promise<BosReviewWithDemoCount[]> {
  const supabase = await resolveClient(client);

  let q = (supabase as any)
    .from('bos_course_reviews')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (institutionId) q = q.eq('institution_id', institutionId);

  const { data: reviewRows, error: reviewErr } = await q;
  if (reviewErr) throw reviewErr;

  const reviews = (reviewRows ?? []) as BosCourseReview[];
  if (reviews.length === 0) return [];

  const institutionIds = Array.from(
    new Set(reviews.map((r) => r.institution_id)),
  );

  // Demo counts grouped by institution. We aggregate in TS — fine for the
  // current scale; an RPC is the upgrade path.
  const { data: demoRows, error: demoErr } = await (supabase as any)
    .from('pde_demonstrations')
    .select('institution_id')
    .in('institution_id', institutionIds);

  if (demoErr) throw demoErr;

  const demoCountByInstitution = new Map<string, number>();
  for (const row of demoRows ?? []) {
    const inst = (row as any).institution_id as string | null;
    if (!inst) continue;
    demoCountByInstitution.set(inst, (demoCountByInstitution.get(inst) ?? 0) + 1);
  }

  return reviews.map((review) => ({
    review,
    demo_count: demoCountByInstitution.get(review.institution_id) ?? 0,
  }));
}
