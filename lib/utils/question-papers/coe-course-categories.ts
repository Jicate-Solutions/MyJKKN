/**
 * COE course_code → course_category map (server-side, cached).
 *
 * `courses.course_category` is COE's CANONICAL theory/practical classifier — the
 * same field `ia_paper_templates.course_type_applicability` stores (normalized,
 * comma-joined) and that COE's generate uses via `pickTemplateForCourse`. Live CAS
 * values: Theory (996), Practical (231), Field Work (24), Project (19),
 * Group Project (4), Theory + Practical (3).
 *
 * Do NOT classify from `course_type` ("Core", "Elective", "Core Practical") or from
 * the course title — both disagree with the category in real data, e.g.
 *   24UTFCP05 "…FASHION ACCESSORIES PRACTICAL"  type=Core     category=Theory + Practical
 *   24PZOE09  "MEDICAL LABORATORY TECHNIQUES"   type=Elective category=Theory
 *
 * The IA question-papers list endpoint doesn't return the category, so we page
 * `/api/v1/courses` (COE PostgREST caps ~1000/page; CAS has ~1.3k) and memoise per
 * institution_code for 10 minutes — the course master is effectively static.
 */

import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';

const CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

const cache = new Map<string, { at: number; map: Map<string, string> }>();

export async function getCoeCourseCategoryMap(
  institutionCode: string
): Promise<Map<string, string>> {
  const hit = cache.get(institutionCode);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.map;

  const client = CoeRestClient.create();
  const map = new Map<string, string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await client.get<{ data: any[] }>('/api/v1/courses', {
      institution_code: institutionCode,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const rows = res?.data ?? [];
    for (const c of rows) {
      if (c?.course_code) map.set(c.course_code, c.course_category ?? '');
    }
    if (rows.length < PAGE_SIZE) break;
  }

  cache.set(institutionCode, { at: Date.now(), map });
  return map;
}

// Pure classification helpers live in ./course-category (client-safe); re-exported
// here for server callers that already import this module.
export { normalizeCourseCategory, isPracticalCategory } from './course-category';
