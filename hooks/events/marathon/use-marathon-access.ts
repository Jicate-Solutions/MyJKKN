// hooks/events/marathon/use-marathon-access.ts
// Role-based access control for marathon module pages.
//
// Access levels:
// - Super Admin / Admin: Full access to all pages
// - Principal / HOD / Faculty: Can view registrations for their institution
// - Student: Can only register and view their own registration

'use client';

import { useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

export type MarathonAccessLevel = 'full' | 'institution' | 'self' | 'none';

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

const ADMIN_ROLES = ['super_admin', 'admin', 'administrator'];
const INSTITUTION_ROLES = ['principal', 'hod', 'faculty', 'vice_principal', 'dean'];
const SELF_ONLY_ROLES = ['student'];

export function useMarathonAccess(): MarathonAccess {
  const { profile, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permLoading } = usePermissions();

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
        profileId,
        institutionId,
        role,
        isSuperAdmin,
        isLoading,
      };
    }

    // Principal, HOD, Faculty — can view institution registrations
    if (INSTITUTION_ROLES.includes(role)) {
      return {
        level: 'institution',
        canManage: false,
        canViewRegistrations: true,
        canRegister: true,
        selfOnly: false,
        profileId,
        institutionId,
        role,
        isSuperAdmin: false,
        isLoading,
      };
    }

    // Student — can only register and view own registration
    if (SELF_ONLY_ROLES.includes(role)) {
      return {
        level: 'self',
        canManage: false,
        canViewRegistrations: true,
        canRegister: true,
        selfOnly: true,
        profileId,
        institutionId,
        role,
        isSuperAdmin: false,
        isLoading,
      };
    }

    // Unknown role — minimal access (can register self)
    return {
      level: 'self',
      canManage: false,
      canViewRegistrations: true,
      canRegister: true,
      selfOnly: true,
      profileId,
      institutionId,
      role,
      isSuperAdmin: false,
      isLoading,
    };
  }, [profile, isSuperAdmin, authLoading, permLoading]);
}
