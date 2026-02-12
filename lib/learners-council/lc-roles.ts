/**
 * Learners Council Role Resolution
 * Resolves a user's effective LC role from profile + membership data.
 * Used across LC module pages for access control and visibility.
 */

export type LCRole =
  | 'md'
  | 'principal'
  | 'hod'
  | 'senior_learner_advisor'
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
  if (profileRole === 'admin' || profileRole === 'staff') return 'senior_learner_advisor';

  // LC roles from lc_members/lc_positions lookup
  if (membership) {
    if (membership.position_category === 'executive') return 'lc_executive';
    if (membership.position_category === 'institution_president') return 'yuva_chair';
    if (membership.yuva_role === 'co_chair') return 'yuva_co_chair';
    if (membership.position_category === 'portfolio_head' || membership.position_category === 'at_large') return 'lc_member';
  }

  return 'learner';
}

/** Check if a role is a staff/admin role */
export function isStaffRole(role: LCRole): boolean {
  return ['md', 'principal', 'hod', 'senior_learner_advisor'].includes(role);
}

/** Check if the profile.role is a staff role (quick check without LC membership) */
export function isStaffOrAdminRole(profileRole: string | null): boolean {
  return STAFF_ROLES.includes(profileRole as any);
}

/** Check if a role can create announcements */
export function canCreateAnnouncements(role: LCRole): boolean {
  return ['md', 'principal', 'hod', 'senior_learner_advisor', 'lc_executive', 'yuva_chair'].includes(role);
}

/** Check if a role can manage elections */
export function canManageElections(role: LCRole): boolean {
  return isStaffRole(role);
}

/** Check if a role should see the Selection tab */
export function canSeeSelectionTab(role: LCRole): boolean {
  // Staff + any LC member can see selection (to self-nominate / vote)
  return role !== 'learner';
}
