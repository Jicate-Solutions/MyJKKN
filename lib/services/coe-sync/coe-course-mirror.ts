/**
 * COE → MyJKKN course master mirror (server-side only).
 *
 * For COE-mastered institutions (CAS, Engineering), pulls the COE course list
 * and upserts it into the local MyJKKN `courses` table so the timetable — which
 * reads `courses.id` — keeps working with zero changes. `coe_course_id` is the
 * bridge written on each row.
 *
 * CAS fan-out: one COE institution resolves to TWO MyJKKN UUIDs (Aided + Self).
 * Each COE course is upserted once PER MyJKKN UUID, both rows sharing the same
 * coe_course_id. This reuses the canonical resolver's myjkkn_institution_ids[]
 * array — we never re-derive the CAS pairing here.
 *
 * Idempotent: upsert on (institution_id, course_code). Never hard-deletes —
 * courses that vanish from COE are soft-deactivated (is_active=false) because old
 * timetable JSON may still reference them.
 *
 * NEVER import from client code — uses the service-role client + COE API key.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import {
  resolveInstitutionContext,
  type InstitutionContext,
} from '@/lib/utils/institutions/institution-resolver';
import type { BosCourseMaster, BosCourseListResponse } from '@/types/bos-courses';

export interface CourseMirrorResult {
  institutionId: string;
  /** All MyJKKN UUIDs written to (1, or 2 for CAS). */
  myjkknInstitutionIds: string[];
  coeCoursesFetched: number;
  upserted: number;
  softDeactivated: number;
  errors: string[];
}

const COURSE_PAGE_SIZE = 500;
const MAX_COURSE_PAGES = 20; // 10k course safety ceiling per institution

/** Unwrap COE's array-or-{data} response shape. */
function unwrapCourses(raw: unknown): BosCourseMaster[] {
  if (Array.isArray(raw)) return raw as BosCourseMaster[];
  return (raw as BosCourseListResponse)?.data ?? [];
}

/**
 * Fetch the full active COE course list for an institution, paging until COE
 * returns a short page. Courses inactive in COE are intentionally excluded —
 * the soft-deactivation step below flips any local twin to is_active=false.
 */
async function fetchAllCoeCourses(
  client: CoeRestClient,
  coeInstitutionId: string,
): Promise<BosCourseMaster[]> {
  const all: BosCourseMaster[] = [];
  for (let page = 0; page < MAX_COURSE_PAGES; page++) {
    const raw = await client.get<unknown>('/api/v1/courses', {
      institutions_id: coeInstitutionId,
      is_active: 'true',
      limit: String(COURSE_PAGE_SIZE),
      offset: String(page * COURSE_PAGE_SIZE),
    });
    const rows = unwrapCourses(raw).filter(
      (c) => !c.institutions_id || c.institutions_id === coeInstitutionId,
    );
    all.push(...rows);
    if (rows.length < COURSE_PAGE_SIZE) break;
  }
  return all;
}

/**
 * Mirror COE courses into MyJKKN for ONE institution (and its CAS sibling, if any).
 * Caller is responsible for confirming the institution is COE-mastered.
 */
export async function mirrorCoeCourses(
  supabase: SupabaseClient,
  myjkknInstitutionId: string,
  ctx?: InstitutionContext | null,
): Promise<CourseMirrorResult> {
  const result: CourseMirrorResult = {
    institutionId: myjkknInstitutionId,
    myjkknInstitutionIds: [],
    coeCoursesFetched: 0,
    upserted: 0,
    softDeactivated: 0,
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

  // CAS → both Aided + Self UUIDs; everyone else → exactly one.
  const targetIds =
    context.myjkkn_institution_ids.length > 0
      ? context.myjkkn_institution_ids
      : [myjkknInstitutionId];
  result.myjkknInstitutionIds = targetIds;

  const client = CoeRestClient.create();
  const coeCourses = await fetchAllCoeCourses(client, context.coe_id);
  result.coeCoursesFetched = coeCourses.length;

  const liveCoeIds = new Set(coeCourses.map((c) => c.id));

  for (const institutionId of targetIds) {
    // ── Upsert the live COE set ──────────────────────────────────────────────
    const rows = coeCourses.map((c) => ({
      institution_id: institutionId,
      course_code: c.course_code,
      course_name: c.course_name ?? c.course_title ?? c.course_code,
      theory_hours: c.theory_hours ?? 0,
      practical_hours: c.practical_hours ?? 0,
      is_active: true,
      coe_course_id: c.id,
      coe_synced_at: new Date().toISOString(),
    }));

    if (rows.length > 0) {
      const { error } = await supabase
        .from('courses')
        .upsert(rows, { onConflict: 'institution_id,course_code' });
      if (error) {
        result.errors.push(`upsert(${institutionId}): ${error.message}`);
        continue;
      }
      result.upserted += rows.length;
    }

    // ── Soft-deactivate locally-mirrored courses no longer in COE ────────────
    // Only touch rows we previously linked (coe_course_id NOT NULL) for THIS
    // institution. Never hard-delete — timetable_data JSON may still reference them.
    const { data: existing, error: exErr } = await supabase
      .from('courses')
      .select('id, coe_course_id')
      .eq('institution_id', institutionId)
      .not('coe_course_id', 'is', null)
      .eq('is_active', true);

    if (exErr) {
      result.errors.push(`select-existing(${institutionId}): ${exErr.message}`);
      continue;
    }

    const stale = (existing ?? [])
      .filter((r: { coe_course_id: string | null }) => !liveCoeIds.has(r.coe_course_id ?? ''))
      .map((r: { id: string }) => r.id);

    if (stale.length > 0) {
      const { error: deErr } = await supabase
        .from('courses')
        .update({ is_active: false, coe_synced_at: new Date().toISOString() })
        .in('id', stale);
      if (deErr) {
        result.errors.push(`soft-deactivate(${institutionId}): ${deErr.message}`);
        continue;
      }
      result.softDeactivated += stale.length;
    }
  }

  return result;
}
