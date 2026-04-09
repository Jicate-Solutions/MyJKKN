// hooks/events/marathon/use-marathon-access.ts
// Role-based access control for marathon module pages.
//
// Access levels:
// - Super Admin / Admin: Full access to all pages
// - Custom roles with events.marathon.view: Full access (e.g., event_coordinator)
// - Principal / HOD / Faculty: Institution-level registrations
// - Committee Member/Lead: Committees page only (scoped to their committees)
// - Student: Own registration only

'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

export type MarathonAccessLevel = 'full' | 'institution' | 'committee_member' | 'self' | 'none';

export interface MarathonAccess {
  /** Overall access level */
  level: MarathonAccessLevel;
  /** Can view all marathon management pages (dashboard, sponsors, budget, etc.) */
  canManage: boolean;
  /** Can view registrations (own institution for institution-level, own only for self) */
  canViewRegistrations: boolean;
  /** Can register participants */
  canRegister: boolean;
  /** Can view own registration only */
  selfOnly: boolean;
  /** Can access the Committees page (committee leads/members get scoped access) */
  canAccessCommittees: boolean;
  /** User's profile ID (for filtering own registrations) */
  profileId: string | null;
  /** User's institution ID (for filtering institution registrations) */
  institutionId: string | null;
  /** User's role */
  role: string;
  /** Is super admin */
  isSuperAdmin: boolean;
  /** Is loading */
  isLoading: boolean;
}

const ADMIN_ROLES = ['super_admin', 'admin', 'administrator', 'event_coordinator'];
const INSTITUTION_ROLES = ['principal', 'hod', 'faculty', 'vice_principal', 'dean'];
const SELF_ONLY_ROLES = ['student'];

export function useMarathonAccess(): MarathonAccess {
  const { profile, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, canAccess, isLoading: permLoading } = usePermissions();

  return useMemo(() => {
    const isLoading = authLoading || permLoading;
    const role = profile?.role ?? '';
    const profileId = profile?.id ?? null;
    const institutionId = profile?.institution_id ?? null;

    // Super admin or admin roles — full access
    if (isSuperAdmin || ADMIN_ROLES.includes(role)) {
      return {
        level: 'full',
        canManage: true,
        canViewRegistrations: true,
        canRegister: true,
        selfOnly: false,
        canAccessCommittees: true,
        profileId,
        institutionId,
        role,
        isSuperAdmin,
        isLoading,
      };
    }

    // Custom roles with explicit events.marathon.view permission — full access
    // (e.g., event_coordinator)
    if (canAccess('events.marathon', 'view')) {
      return {
        level: 'full',
        canManage: true,
        canViewRegistrations: true,
        canRegister: true,
        selfOnly: false,
        canAccessCommittees: true,
        profileId,
        institutionId,
        role,
        isSuperAdmin: false,
        isLoading,
      };
    }

    // Custom roles with committees.manage permission — committees module only
    if (canAccess('events.marathon.committees', 'manage')) {
      return {
        level: 'committee_member',
        canManage: false,
        canViewRegistrations: true,
        canRegister: true,
        selfOnly: false,
        canAccessCommittees: true,
        profileId,
        institutionId,
        role,
        isSuperAdmin: false,
        isLoading,
      };
    }

    // Principal, HOD, Faculty — can view institution registrations
    // (Committee membership check happens at the page level — they can also
    // access committees if they're listed as lead/member)
    if (INSTITUTION_ROLES.includes(role)) {
      return {
        level: 'institution',
        canManage: false,
        canViewRegistrations: true,
        canRegister: true,
        selfOnly: false,
        canAccessCommittees: true, // runtime check via useCommitteeMembership
        profileId,
        institutionId,
        role,
        isSuperAdmin: false,
        isLoading,
      };
    }

    // Student — can only register and view own registration
    // Committee access is granted at the page level if they're a committee member
    if (SELF_ONLY_ROLES.includes(role)) {
      return {
        level: 'self',
        canManage: false,
        canViewRegistrations: true,
        canRegister: true,
        selfOnly: true,
        canAccessCommittees: true, // runtime check via useCommitteeMembership
        profileId,
        institutionId,
        role,
        isSuperAdmin: false,
        isLoading,
      };
    }

    // Custom/unknown roles — default to institution-level access
    return {
      level: institutionId ? 'institution' : 'self',
      canManage: false,
      canViewRegistrations: true,
      canRegister: true,
      selfOnly: !institutionId,
      canAccessCommittees: true, // runtime check via useCommitteeMembership
      profileId,
      institutionId,
      role,
      isSuperAdmin: false,
      isLoading,
    };
  }, [profile, isSuperAdmin, canAccess, authLoading, permLoading]);
}
