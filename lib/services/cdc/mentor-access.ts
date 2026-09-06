// lib/services/cdc/mentor-access.ts
// UX-only edit gate for the cross-college mentor pairings view (BUG-004291).
//
// The cdc_mentor_pairings RLS is the SOURCE OF TRUTH for who may write:
//   is_cdc_staff() AND role_has_institution_access(<mentee's institution>)
// This helper only decides whether the client SHOWS edit controls, so a
// coordinator viewing another college's pair (allowed cross-college VIEW) does
// not see status/edit buttons that would fail RLS.
//
// It covers the common cases — super admin, cdc_head (institution_scope='all'),
// and an own-institution match. Rare user_institution_access / CAS-sibling
// grants are not mirrored here: in those cases the control is hidden even though
// the write would succeed. That is the safe direction — RLS never wrongly
// ALLOWS; at worst a legitimate editor must open the pair to act.
import type { Profile } from '@/types/auth';

export function canEditMentorPairing(
  profile: Profile | null | undefined,
  ownerInstitutionId: string | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.is_super_admin) return true;

  const roleKeys = new Set<string>(
    [profile.role, ...(profile.user_roles?.map((r) => r.role_key ?? '') ?? [])].filter(
      Boolean,
    ) as string[],
  );
  // Institution-scope 'all' roles edit every college's pairs.
  if (roleKeys.has('cdc_head') || roleKeys.has('super_admin')) return true;

  // Otherwise: own-college only.
  return !!ownerInstitutionId && ownerInstitutionId === profile.institution_id;
}
