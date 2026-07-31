/**
 * Learners Council Role Resolution
 * Resolves a user's effective LC role from profile + membership data.
 * Used across LC module pages for access control and visibility.
 */

export type LCRole =
  | 'md'
  | 'principal'
  | 'hod'
  | 'learning_facilitator_advisor'
  | 'lc_executive'
  | 'lc_member'
  | 'yuva_chair'
  | 'yuva_co_chair'
  | 'learner';

/** Staff roles that map directly from profile.role */
const STAFF_ROLES = ['admin', 'super_admin', 'staff', 'hod', 'principal'] as const;

export interface LCMembershipInfo {
  position_category?: string | null;
  tier?: string | null;
  yuva_role?: string | null;
}

/**
 * Resolve a user's effective LC role from their profile and LC membership.
 *
 * @param profileRole - The user's profile.role (e.g. 'super_admin', 'staff', 'student')
 * @param membership  - LC membership info from lc_members + lc_positions join
 */
export function getLCRole(profileRole: string | null, membership: LCMembershipInfo | null): LCRole {
  // Staff roles from profile.role
  if (profileRole === 'super_admin') return 'md';
  if (profileRole === 'principal') return 'principal';
  if (profileRole === 'hod') return 'hod';
  if (profileRole === 'admin' || profileRole === 'staff') return 'learning_facilitator_advisor';

  // LC roles from lc_members/lc_positions lookup
  if (membership) {
    if (membership.position_category === 'executive') return 'lc_executive';
    if (membership.position_category === 'institution_president') return 'yuva_chair';

    // YUVA vertical-based roles (chapter_chair, stakeholder_chair, vertical_chair, etc.)
    if (membership.yuva_role?.endsWith('_chair') && !membership.yuva_role.endsWith('_co_chair')) return 'yuva_chair';
    if (membership.yuva_role?.endsWith('_co_chair')) return 'yuva_co_chair';

    if (membership.position_category === 'portfolio_head' || membership.position_category === 'at_large') return 'lc_member';
  }

  return 'learner';
}

/** Check if a role is a staff/admin role */
export function isStaffRole(role: LCRole): boolean {
  return ['md', 'principal', 'hod', 'learning_facilitator_advisor'].includes(role);
}

/** Check if the profile.role is a staff role (quick check without LC membership) */
export function isStaffOrAdminRole(profileRole: string | null): boolean {
  return STAFF_ROLES.includes(profileRole as any);
}

/**
 * Council access flags, resolved from an active lc_members row rather than from
 * getLCRole().
 *
 * getLCRole() collapses to 'learner' for any position category it does not name
 * explicitly — today that silently includes every `representative` (15 of the 34 active
 * members) and every YUVA chair/co-chair, because their category is carried on
 * lc_positions.category while getLCRole() looks for a `yuva_role` field. It is therefore
 * not a sound basis for "is this person on the Council".
 *
 * These flags mirror fn_is_lc_member() / fn_is_lc_executive() in the database, so the UI
 * shows exactly what RLS will allow. Keep the two definitions in step.
 */
export interface LCAccess {
  /** Any active Learners Council member, any position, any institution. */
  isLCMember: boolean;
  /** An LC office bearer: President / Vice President / Secretary / Treasurer. */
  isLCExecutive: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
}

export function getLCAccess(
  profile: { role?: string | null; is_super_admin?: boolean | null } | null,
  membership: LCMembershipInfo | null
): LCAccess {
  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';
  return {
    isLCMember: membership != null,
    isLCExecutive: membership?.position_category === 'executive',
    isSuperAdmin,
    isStaff: isStaffOrAdminRole(profile?.role ?? null),
  };
}

/**
 * Who may SUBMIT (publish) an announcement to the Council.
 * Office bearers only, plus a super admin as break-glass. Staff deliberately excluded:
 * the Council publishes its own voice. Mirrored by fn_lc_announcement_guard_publish().
 */
export function canPublishAnnouncements(access: LCAccess): boolean {
  return access.isLCExecutive || access.isSuperAdmin;
}

/** Who may DRAFT an announcement. Any council member; staff keep the access they had. */
export function canDraftAnnouncements(access: LCAccess): boolean {
  return access.isLCMember || access.isSuperAdmin || access.isStaff;
}

/** Who may create/edit an OD approval chain, for any institution. */
export function canManageODChains(access: LCAccess): boolean {
  return access.isLCExecutive || access.isSuperAdmin;
}

/** Who may view the OD approval chains page (read-only for non-executives). */
export function canSeeODChains(access: LCAccess): boolean {
  return access.isLCMember || access.isSuperAdmin || access.isStaff;
}

/**
 * Who may act on an event proposal sitting in pending_review.
 * Exactly the people the dashboard already tells "Awaiting Your Approval" — the
 * leadership and advisor roles behind isStaffRole(), plus a super admin as
 * break-glass. Council members propose events; they do not clear their own queue.
 */
export function canReviewEventProposals(access: LCAccess): boolean {
  return access.isStaff || access.isSuperAdmin;
}

/** Check if a role can manage elections */
export function canManageElections(role: LCRole): boolean {
  return isStaffRole(role);
}
