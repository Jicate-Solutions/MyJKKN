// lib/utils/bos/coe-course-display.ts
//
// Resolve the CURRENT course_code / course_name for a syllabus from COE, keyed
// by the stable COE course id. bos_course_syllabi.course_code/course_name are
// snapshots that COE may rename; for detail views and PDF reports we prefer the
// live values so a COE rename is reflected without re-saving every syllabus.
//
// Used on detail + PDF paths only (not the list) — see the plan
// docs/plans/bos_syllabus_course_id_anchor.md.

import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';

export interface CourseDisplay {
  course_code: string;
  course_name: string;
}

// Module-level cache, 10-min TTL. COE course ids are immutable, so caching by id
// is safe; the value (code/name) is refreshed after the TTL.
const cache = new Map<string, { value: CourseDisplay | null; expires: number }>();
const TTL_MS = 10 * 60 * 1000;

/**
 * Fetch the live course_code/course_name from COE by its stable course id.
 * Returns null when courseId is empty, COE is unreachable, or the course is not
 * found — callers fall back to the stored snapshot.
 */
export async function resolveCourseDisplay(
  courseId: string | null | undefined,
): Promise<CourseDisplay | null> {
  if (!courseId) return null;

  const now = Date.now();
  const hit = cache.get(courseId);
  if (hit && hit.expires > now) return hit.value;

  let value: CourseDisplay | null = null;
  try {
    const client = CoeRestClient.create();
    const raw = await client.get<unknown>(`/api/v1/courses/${courseId}`);
    // COE single-record responses may be wrapped in { data: {...} }.
    const c = (raw && typeof raw === 'object' && 'data' in raw
      ? (raw as { data?: unknown }).data
      : raw) as { course_code?: string; course_name?: string; course_title?: string } | null;
    if (c?.course_code) {
      value = {
        course_code: c.course_code,
        course_name: c.course_name ?? c.course_title ?? '',
      };
    }
  } catch {
    value = null; // fall back to the stored snapshot
  }

  cache.set(courseId, { value, expires: now + TTL_MS });
  return value;
}

/**
 * Convenience: returns the syllabus's display code/name, preferring the live COE
 * values (by course_id) and falling back to the stored snapshot.
 */
export async function courseDisplayFor(syllabus: {
  course_id?: string | null;
  course_code: string;
  course_name: string;
}): Promise<CourseDisplay> {
  const live = await resolveCourseDisplay(syllabus.course_id);
  return live ?? { course_code: syllabus.course_code, course_name: syllabus.course_name };
}
