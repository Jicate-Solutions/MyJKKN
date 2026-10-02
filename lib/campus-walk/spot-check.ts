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
 * ── THE PICK IS RANDOM, AT CLOSE TIME ──────────────────────────────────────
 * crypto.randomInt(10) === 0, rolled once inside the close (repair round,
 * 1 Oct). The first cut hashed the task id, which sits in the fixer's own URL,
 * so a fixer could work out in advance which jobs would be looked at. A retried
 * close never rolls twice: the close is a compare-and-set, and a retry finds
 * the job already closed. A job whose last spot check FAILED is always picked
 * again when it is fixed again — a second look at a job that already failed one.
 *
 * ── WHO CHECKS ──────────────────────────────────────────────────────────────
 * "The Director for jobs he raised": every job that did NOT arrive through
 * InstaSolver arrived through the Campus Walk capture screen, which is the
 * Director's alone (D2, lib/campus-walk/reporters.ts). A job with no college on
 * record has no college head, so it goes to the Director rather than to nobody.
 *
 * NEVER THE FIXER (repair round, 1 Oct). When no estate office resolves, ruling
 * 4 makes the principal the owner — so the college head can be the person who
 * sent the fix photo. The check then goes to the next person in the chain, the
 * Director. The fixer is written on the check (fixer_profile_id) and
 * viewerMayCheck refuses them whatever else they are.
 *
 * ONE RULE FOR THE BELL AND THE BUTTONS. "The Director" is resolveDirectors
 * (Role Management's director role) both for who is belled and for who may
 * decide; "the college head" is resolvePrincipalsByInstitution for the job's
 * college both ways. The first cut belled one list and gated on another.
 */

import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePrincipalsByInstitution } from '@/lib/services/academic/intake-readiness-alarm';
import { resolveDirectors, validateTargeting } from '@/lib/services/director-desk/handover-chase-service';

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
  /** Who sent the fix photo — never allowed to decide this check. */
  fixer_profile_id?: string | null;
  /** True when the college head was the fixer and the check went up to the Director. */
  escalated_from_fixer?: boolean;
  decided_at?: string | null;
  decided_by_profile_id?: string | null;
  note?: string | null;
}

/** One roll of the 1-in-10 die. Random at close time — see the header. */
export function rollSpotCheck(): boolean {
  return randomInt(SPOT_CHECK_ONE_IN) === 0;
}

/**
 * Whether this close is spot checked: always when the job's last check failed,
 * otherwise the roll.
 */
export function isSpotCheckPick(
  metadata: Record<string, any> | null | undefined,
  roll: () => boolean = rollSpotCheck
): boolean {
  if ((metadata ?? {}).spot_check?.state === 'failed') return true;
  return roll();
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

/**
 * The pending record written INSIDE the close. The caller has already decided
 * the job is picked and who checks it (checkerForClose).
 */
export function pendingSpotCheck(
  metadata: Record<string, any>,
  nowIso: string,
  checker: { checker: SpotChecker; institution_id: string | null; escalated_from_fixer: boolean },
  fixerProfileId: string | null
): SpotCheck {
  return {
    state: 'pending',
    checker: checker.checker,
    institution_id: checker.institution_id,
    picked_at: nowIso,
    fixer_profile_id: fixerProfileId,
    escalated_from_fixer: checker.escalated_from_fixer,
    decided_at: null,
    decided_by_profile_id: null,
    note: null,
  };
}

/** The Director(s), the same list for the bell and the buttons. Never throws. */
export async function resolveDirectorIds(admin: SupabaseClient): Promise<string[]> {
  try {
    const director = await resolveDirectors(admin);
    const check = validateTargeting(director.ids);
    return check.ok ? check.userIds : [];
  } catch (e: any) {
    console.error('[campus-walk/spot-check] director lookup failed:', e?.message ?? e);
    return [];
  }
}

/**
 * Who checks this close, and who is belled — never the fixer. A college-head
 * check whose only heads are the fixer goes up to the Director.
 */
export async function checkerForClose(
  admin: SupabaseClient,
  metadata: Record<string, any>,
  fixerProfileId: string | null
): Promise<{ checker: SpotChecker; institution_id: string | null; escalated_from_fixer: boolean; recipients: string[] }> {
  const notFixer = (ids: string[]) => ids.filter((id) => id && id !== fixerProfileId);
  if (spotCheckerFor(metadata) === 'college_head') {
    const institutionId = institutionOfTask(metadata);
    const allHeads = await resolveCollegeHeadIds(admin, institutionId);
    const heads = notFixer(allHeads);
    if (heads.length > 0) {
      return { checker: 'college_head', institution_id: institutionId, escalated_from_fixer: false, recipients: heads };
    }
    const escalated = allHeads.length > 0; // a head exists, but it is the fixer
    if (!escalated) {
      return { checker: 'college_head', institution_id: institutionId, escalated_from_fixer: false, recipients: [] };
    }
    return {
      checker: 'director',
      institution_id: null,
      escalated_from_fixer: true,
      recipients: notFixer(await resolveDirectorIds(admin)),
    };
  }
  return {
    checker: 'director',
    institution_id: null,
    escalated_from_fixer: false,
    recipients: notFixer(await resolveDirectorIds(admin)),
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

/** The fixer on the check, else the one on the job — whoever sent the photo. */
function fixerOf(spotCheck: SpotCheck, metadata?: Record<string, any> | null): string | null {
  if (typeof spotCheck.fixer_profile_id === 'string' && spotCheck.fixer_profile_id) return spotCheck.fixer_profile_id;
  const fromJob = (metadata ?? {}).fix?.submitted_by_profile_id;
  return typeof fromJob === 'string' && fromJob ? fromJob : null;
}

/**
 * Whether this viewer may decide this spot check. The route and the page both
 * ask here, so the list on screen and the rule that enforces it agree. The
 * person who sent the fix photo never may, whatever else they are.
 */
export function viewerMayCheck(
  viewer: SpotCheckViewer,
  spotCheck: SpotCheck | null | undefined,
  metadata?: Record<string, any> | null
): boolean {
  if (!spotCheck) return false;
  if (fixerOf(spotCheck, metadata) === viewer.profileId) return false;
  if (spotCheck.checker === 'director') return viewer.isDirector;
  return Boolean(spotCheck.institution_id) && viewer.headOfInstitutionIds.includes(spotCheck.institution_id as string);
}

/**
 * Resolve the viewer with the same two lookups the bells use: resolveDirectorIds
 * for the Director, resolvePrincipalsByInstitution for a college head. That
 * lookup only ever returns principals whose own profile is in the college
 * (intake-readiness-alarm.ts filters profiles.institution_id on both paths), so
 * the viewer's own college is the only one they can head — the person belled is
 * the person let in.
 */
export async function resolveSpotCheckViewer(admin: SupabaseClient, profileId: string): Promise<SpotCheckViewer> {
  const [directors, profileRes] = await Promise.all([
    resolveDirectorIds(admin),
    admin.from('profiles').select('institution_id').eq('id', profileId).maybeSingle(),
  ]);
  const institutionId = ((profileRes as any)?.data?.institution_id as string | null) ?? null;
  const heads = await resolveCollegeHeadIds(admin, institutionId);
  return {
    profileId,
    isDirector: directors.includes(profileId),
    headOfInstitutionIds: institutionId && heads.includes(profileId) ? [institutionId] : [],
  };
}
