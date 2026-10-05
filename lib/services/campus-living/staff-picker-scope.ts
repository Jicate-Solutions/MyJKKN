/**
 * Which institution_id, if any, the "Assign Warden -> Staff Member" search may
 * narrow itself to.
 *
 * A super admin's `profiles.institution_id` is a HOME institution, not a scope:
 * 13 of the 15 super admins in prod have one set, and using it as a filter hid
 * 860 of 872 staff rows from them — including the warden this was reported for
 * (boyshostel@jkkn.ac.in, whose staff row sits in JKKN Main Office while the
 * reporting admin's home institution is Jicate Solutions).
 *
 * Everyone else is confined by the `staff_select_scope_aware` RLS policy, which
 * already resolves 'own_institution' against _user_accessible_institutions().
 * Returning `undefined` therefore does not widen what a scoped user can read —
 * the database still decides. This mirrors `useHostelBlocks`, which applies the
 * same `isSuperAdmin ? undefined : institutionId` rule to the Block dropdown
 * rendered beside this picker.
 */
export function resolveStaffSearchInstitutionId(args: {
  isSuperAdmin: boolean;
  profileInstitutionId: string | null | undefined;
}): string | undefined {
  if (args.isSuperAdmin) return undefined;
  // Empty string must not become `.eq('institution_id', '')` — that compares a
  // uuid column against '' and fails the whole search rather than returning
  // everything. Preserves the original `if (institutionId)` guard.
  return args.profileInstitutionId ? args.profileInstitutionId : undefined;
}
