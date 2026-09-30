/**
 * Campus Walk — the fake-fix guard, and who the college head is.
 *
 * ── DIRECTOR'S RULINGS, 2026-09-30 interview ────────────────────────────────
 * (3) The fixer's photo closes a job at once (lib/campus-walk/closure.ts). To
 *     keep that honest, 1 in 10 jobs closed by a fixer's photo is picked for a
 *     spot check. The college head (the principal of the job's college) checks
 *     it — or the Director, for the jobs he raised himself. They see the before
 *     and after photos and tap "Looks fixed" or "Not fixed"; "Not fixed" reopens
 *     it exactly like the reporter's button (lib/campus-walk/reopen.ts).
 * (1) When a reporter taps "Not fixed" a SECOND time on the same job, the
 *     college head is told it failed twice. The head lookup lives here so both
 *     rulings name the same person.
 *
 * ── THE PICK IS DETERMINISTIC PER TASK ─────────────────────────────────────
 * sha256(task id), first 32 bits, modulo 10. Random across tasks (uuids are
 * random), but the same task always gets the same answer — so a test can name
 * a task that is picked, and a retried close never flips a coin twice. A job
 * that was picked, failed its check and was fixed again is picked again, which
 * is the point: a second look at a job that already failed one.
 *
 * ── WHO CHECKS ──────────────────────────────────────────────────────────────
 * "The Director for jobs he raised": every job that did NOT arrive through
 * InstaSolver arrived through the Campus Walk capture screen, which is the
 * Director's alone (D2, lib/campus-walk/reporters.ts). A job with no college on
 * record has no college head, so it goes to the Director rather than to nobody.
 */

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePrincipalsByInstitution } from '@/lib/services/academic/intake-readiness-alarm';

/** 1 in this many photo-closed jobs is spot checked (Director, 2026-09-30). */
export const SPOT_CHECK_ONE_IN = 10;

/** The page a checker opens, and the page the "failed twice" bell opens. */
export const SPOT_CHECKS_URL = '/campus-walk/spot-checks';

export type SpotChecker = 'college_head' | 'director';
export type SpotCheckState = 'pending' | 'passed' | 'failed' | 'superseded';

export interface SpotCheck {
  state: SpotCheckState;
  checker: SpotChecker;
  /** The college whose head checks it. Null when the Director checks it. */
  institution_id: string | null;
  picked_at: string;
  decided_at?: string | null;
  decided_by_profile_id?: string | null;
  note?: string | null;
}

/** True for the 1 in 10 tasks the fake-fix guard looks at. */
export function isSpotCheckPick(taskId: string): boolean {
  const hex = createHash('sha256').update(String(taskId)).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % SPOT_CHECK_ONE_IN === 0;
}

/** The job's college: the one it was filed under, else the reporter's own. */
export function institutionOfTask(metadata: Record<string, any> | null | undefined): string | null {
  const m = metadata ?? {};
  if (typeof m.institution_id === 'string' && m.institution_id) return m.institution_id;
  if (typeof m.reporter_institution_id === 'string' && m.reporter_institution_id) {
    return m.reporter_institution_id;
  }
  return null;
}

/** Who checks this job — see the header. */
export function spotCheckerFor(metadata: Record<string, any> | null | undefined): SpotChecker {
  const m = metadata ?? {};
  if (m.front_door !== 'instasolver') return 'director';
  return institutionOfTask(m) ? 'college_head' : 'director';
}

/** The pending record written INSIDE the close, or null when not picked. */
export function pendingSpotCheck(
  taskId: string,
  metadata: Record<string, any>,
  nowIso: string
): SpotCheck | null {
  if (!isSpotCheckPick(taskId)) return null;
  const checker = spotCheckerFor(metadata);
  return {
    state: 'pending',
    checker,
    institution_id: checker === 'college_head' ? institutionOfTask(metadata) : null,
    picked_at: nowIso,
    decided_at: null,
    decided_by_profile_id: null,
    note: null,
  };
}

/**
 * The college head(s) of one college: the principal, found the way the rest of
 * the platform finds one — Role Management holders plus the legacy
 * profiles.role = 'principal' string (resolvePrincipalsByInstitution).
 * Never throws; an unreadable lookup is "nobody", and the caller says so.
 */
export async function resolveCollegeHeadIds(
  admin: SupabaseClient,
  institutionId: string | null
): Promise<string[]> {
  if (!institutionId) return [];
  try {
    const byInstitution = await resolvePrincipalsByInstitution(admin, [institutionId]);
    return byInstitution.get(institutionId) ?? [];
  } catch (e: any) {
    console.error('[campus-walk/spot-check] college head lookup failed:', e?.message ?? e);
    return [];
  }
}

/** What a signed-in person may check. */
export interface SpotCheckViewer {
  profileId: string;
  isDirector: boolean;
  /** Colleges this person is the head of. Empty for everyone else. */
  headOfInstitutionIds: string[];
}

/**
 * Whether this viewer may decide this spot check. The route and the page both
 * ask here, so the list on screen and the rule that enforces it agree.
 */
export function viewerMayCheck(viewer: SpotCheckViewer, spotCheck: SpotCheck | null | undefined): boolean {
  if (!spotCheck) return false;
  if (spotCheck.checker === 'director') return viewer.isDirector;
  return Boolean(spotCheck.institution_id) && viewer.headOfInstitutionIds.includes(spotCheck.institution_id as string);
}

/**
 * Resolve the viewer. The Director is whoever the Campus Walk D2 setting names
 * (passed in as `isDirector`, from isCampusWalkReporter); a college head is a
 * principal of their own college.
 */
export async function resolveSpotCheckViewer(
  admin: SupabaseClient,
  profileId: string,
  isDirector: boolean
): Promise<SpotCheckViewer> {
  const { data: profile } = await admin
    .from('profiles')
    .select('institution_id')
    .eq('id', profileId)
    .maybeSingle();
  const institutionId = (profile?.institution_id as string | null) ?? null;
  const heads = await resolveCollegeHeadIds(admin, institutionId);
  return {
    profileId,
    isDirector,
    headOfInstitutionIds: institutionId && heads.includes(profileId) ? [institutionId] : [],
  };
}
