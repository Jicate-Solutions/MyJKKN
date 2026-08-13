// hooks/accreditation/use-visible-institutions.ts
// ============================================================================
// The college switcher's rows, narrowed to what the signed-in person can
// actually see, with a label that says so.
//
// Two reads, joined by intersection:
//   1. `useJKKNInstitutions()` — every assessed (iqac-coded) college. Unchanged.
//   2. `useUserInstitutionAccess()` — the reader's accessible institution ids,
//      from `get_user_accessible_institutions`: their own campus UNION any
//      active `user_institution_access` grants UNION every active institution
//      when a role carries institution_scope='all'.
//
// Read (2) rather than inferring from a role name. `canAccessAllInstitutions`
// on that same hook is deliberately NOT used: it is
// `isSuperAdmin || isAdmissionGlobalUser || profile.institution_id === null`,
// a role-adjacent proxy that would misread anyone holding partial grants. The
// label is derived from the DATA — |accessible ∩ assessed| against |assessed| —
// which needs no role list and stays correct when roles change.
//
// This hook reads. It does not widen anything: RLS decides what any of these
// queries return, exactly as before.
// ============================================================================

import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useJKKNInstitutions } from '@/hooks/accreditation/use-body-dashboard';
import {
  describeVisibleScope,
  type VisibleScope,
} from '@/app/(routes)/accreditation/_lib/visible-institutions';

export interface VisibleInstitutions extends VisibleScope {
  /** True while either read is still in flight. Drives the Select's disabled state. */
  isLoading: boolean;
}

export function useVisibleInstitutions(): VisibleInstitutions {
  const { profile } = useAuth();
  const { data: assessed, isLoading: assessedLoading } = useJKKNInstitutions();
  const {
    getAccessibleInstitutionIds,
    loading: accessLoading,
    error: accessError,
  } = useUserInstitutionAccess();

  const accessibleIds = getAccessibleInstitutionIds();

  // An empty set while signed in is indistinguishable from a read that has not
  // answered, so it is treated as UNKNOWN rather than as "sees nothing" — the
  // scope module falls open to the previous behaviour on that verdict.
  //
  // Note what this does NOT cover, and why the scope module needs its own
  // `none-visible` state: a reader at a campus with no iqac_code has a
  // perfectly good access set of exactly one id, so `accessKnown` is TRUE here.
  // The emptiness appears only after intersecting with the assessed colleges,
  // one level down. 1,070 production profiles are in exactly that shape.
  const accessKnown =
    Boolean(profile?.id) && !accessLoading && !accessError && accessibleIds.length > 0;

  const scope = describeVisibleScope(assessed ?? [], accessibleIds, accessKnown);

  return { ...scope, isLoading: assessedLoading || accessLoading };
}
