/**
 * Institution scoping for API routes.
 *
 * WHY THIS EXISTS
 * ---------------
 * The analytics client omits `institutionIds` to mean "all institutions"
 * (page.tsx sets `institutionIds: undefined` when canAccessAllInstitutions).
 * On the wire that is indistinguishable from "the caller didn't say", and the
 * routes each defaulted the omission to `profile.institution_id`.
 *
 * For institution-scoped staff that default is right. For a super admin it is
 * badly wrong: their profiles.institution_id points at their employer, not at
 * a college. sangeetha_v@jkkn.ac.in is scoped to "Jicate Solutions", which has
 * 2 learners (0 active) against 7,156 globally -- so the whole learners
 * analytics dashboard rendered empty. 12 of 14 super admins have an
 * institution_id set and were affected.
 *
 * The same expression had already been written four times with three different
 * answers: change-requests checked `role !== 'super_admin'`, stats and
 * incomplete-profiles checked nothing, and options didn't even select `role`.
 * One helper, so they cannot drift again.
 */

export interface InstitutionScopeProfile {
  role?: string | null;
  is_super_admin?: boolean | null;
  institution_id?: string | null;
}

/**
 * Mirrors the client's test in hooks/use-permissions.ts exactly -- role OR
 * flag. Today every super admin has both set, but checking only one would
 * silently re-open this bug the first time they diverge.
 */
export function canAccessAllInstitutions(profile: InstitutionScopeProfile): boolean {
  return profile.role === 'super_admin' || profile.is_super_admin === true;
}

/**
 * Resolve the institution filter for a request.
 *
 * @param profile     caller's profile; must have selected role, is_super_admin
 *                    and institution_id
 * @param explicitIds ids parsed from the `institutionIds` query param
 * @returns ids to filter by, or `null` for no filter (RLS still applies)
 */
export function resolveInstitutionScope(
  profile: InstitutionScopeProfile,
  explicitIds: string[] | null | undefined
): string[] | null {
  // An explicit selection always wins, for super admins too.
  if (explicitIds && explicitIds.length > 0) return explicitIds;

  // Omitted + allowed to see everything => genuinely everything.
  if (canAccessAllInstitutions(profile)) return null;

  // Omitted + institution-scoped => confine to their own institution.
  // A caller with no institution_id falls through to RLS, which is the
  // behaviour these routes already had.
  return profile.institution_id ? [profile.institution_id] : null;
}
