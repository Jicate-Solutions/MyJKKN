// lib/services/accreditation/owner-candidates.ts
// ============================================================================
// The pool an IQAC coordinator picks an accreditation owner from, shared by
// both owner desks (/accreditation/manage/owners and
// /accreditation/naac/narratives/owners) so the two can never disagree about
// who is eligible.
//
// Both desks used to read `profiles.role` alone. Roles live in TWO places on
// this platform — the legacy scalar profiles.role and the multi-role
// user_roles → custom_roles.role_key pair that user_has_permission() itself
// unions — so a person whose PRIMARY role is something else while user_roles
// carries HOD was invisible to the picker. 84 people were hidden that way,
// including a Pharmacy HOD whose primary role is Digital Coordinator.
//
// The union cannot be done from the browser: user_roles' SELECT policies let a
// caller read only their own rows unless they hold is_admin or roles.edit, so a
// client-side join returns exactly one person — themselves. The read therefore
// goes through fn_accreditation_owner_candidates, a SECURITY DEFINER function
// gated on the same accreditation.naac.narrative view/manage permissions the
// pages are gated on.
// ============================================================================

export interface OwnerCandidate {
  id: string;
  full_name: string | null;
  email: string | null;
  /** Primary (legacy) role. Kept for display and debugging, not for filtering. */
  role?: string | null;
  institution_id?: string | null;
}

/**
 * Reads the eligible-owner pool.
 *
 * A caller without the accreditation permissions gets a 42501 from the
 * function rather than an empty list, so "nobody is eligible" and "you may not
 * ask" stay distinguishable; the error is left to propagate for that reason.
 */
export async function fetchOwnerCandidates(
  sb: { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }
): Promise<OwnerCandidate[]> {
  const { data, error } = await sb.rpc('fn_accreditation_owner_candidates');
  if (error) throw error;
  return (data ?? []) as OwnerCandidate[];
}
