/**
 * COE ↔ MyJKKN course sync — orchestration entry points (server-side only).
 *
 * Composes the course master mirror (coe-course-mirror) and the course-mapping
 * resolver (coe-mapping-sync) for COE-mastered institutions, plus a TTL-guarded
 * `ensureCoeMirrorFresh` for on-demand refresh from page loaders.
 *
 * Direction of truth is PER-INSTITUTION via institutions.course_master_source:
 *   'coe'    → CAS, Engineering. Courses synced DOWN from COE (this module).
 *   'myjkkn' → everyone else (default). No-op here; authored locally.
 *
 * NEVER import from client code.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveInstitutionContext,
  type InstitutionContext,
} from '@/lib/utils/institutions/institution-resolver';
import { mirrorCoeCourses, type CourseMirrorResult } from './coe-course-mirror';
import { syncCoeMappings, type MappingSyncResult } from './coe-mapping-sync';

export type { CourseMirrorResult } from './coe-course-mirror';
export type { MappingSyncResult, MappingSkip } from './coe-mapping-sync';
export { mirrorCoeCourses } from './coe-course-mirror';
export { syncCoeMappings } from './coe-mapping-sync';

export interface CoeSyncResult {
  institutionId: string;
  mirror: CourseMirrorResult;
  mappings: MappingSyncResult;
}

/** True when this institution's course master lives in COE. */
export async function isCoeMastered(
  supabase: SupabaseClient,
  myjkknInstitutionId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('institutions')
    .select('course_master_source')
    .eq('id', myjkknInstitutionId)
    .maybeSingle();
  return data?.course_master_source === 'coe';
}

/**
 * Full sync for one institution: mirror the course master, THEN translate the
 * course-scheme into course_mappings (mappings depend on the mirrored courses
 * for course_code → UUID resolution). Resolves the institution context once and
 * threads it through both steps to avoid a duplicate COE /institutions lookup.
 */
export async function runCoeCourseSync(
  supabase: SupabaseClient,
  myjkknInstitutionId: string,
): Promise<CoeSyncResult> {
  const ctx: InstitutionContext | null = await resolveInstitutionContext(
    myjkknInstitutionId,
    supabase as unknown as Parameters<typeof resolveInstitutionContext>[1],
  );

  const mirror = await mirrorCoeCourses(supabase, myjkknInstitutionId, ctx);
  const mappings = await syncCoeMappings(supabase, myjkknInstitutionId, ctx);
  return { institutionId: myjkknInstitutionId, mirror, mappings };
}

// ── On-demand freshness guard ─────────────────────────────────────────────────
// Throttles per-institution sync so a course/timetable page load triggers at
// most one COE refresh per TTL window. Per-server-instance (serverless) — the
// scheduled cron is the authoritative refresh; this just keeps an actively-used
// institution reasonably fresh between cron runs. Failures NEVER bubble to the
// caller: a stale mirror must never break a page render.

const DEFAULT_MIRROR_TTL_MS = (() => {
  const n = Number(process.env.COE_MIRROR_TTL_MS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 5 * 60 * 1000;
})();

const lastSyncByInstitution = new Map<string, number>();

/**
 * Best-effort: if `institutionId` is COE-mastered and its mirror is older than
 * the TTL, refresh it. No-op (instant) otherwise. Swallows all errors.
 *
 * @returns true if a sync ran, false if skipped (fresh / not COE-mastered / error).
 */
export async function ensureCoeMirrorFresh(
  supabase: SupabaseClient,
  myjkknInstitutionId: string,
  opts?: { ttlMs?: number },
): Promise<boolean> {
  try {
    const ttl = opts?.ttlMs ?? DEFAULT_MIRROR_TTL_MS;
    const last = lastSyncByInstitution.get(myjkknInstitutionId) ?? 0;
    if (Date.now() - last < ttl) return false;

    if (!(await isCoeMastered(supabase, myjkknInstitutionId))) {
      // Cache the negative result for the TTL too, so MyJKKN-mastered
      // institutions don't re-check course_master_source on every page load.
      lastSyncByInstitution.set(myjkknInstitutionId, Date.now());
      return false;
    }

    const r = await runCoeCourseSync(supabase, myjkknInstitutionId);
    // One COE institution covers ALL its MyJKKN UUIDs in a single pass (CAS →
    // both Aided + Self). Stamp every covered id so viewing the sibling next
    // doesn't trigger a redundant full re-sync within the TTL window.
    const now = Date.now();
    for (const id of r.mirror.myjkknInstitutionIds.length ? r.mirror.myjkknInstitutionIds : [myjkknInstitutionId]) {
      lastSyncByInstitution.set(id, now);
    }
    return true;
  } catch (err) {
    console.warn(
      '[coe-sync] ensureCoeMirrorFresh failed (non-fatal):',
      myjkknInstitutionId,
      (err as Error).message,
    );
    return false;
  }
}
