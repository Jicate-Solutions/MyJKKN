'use client';

// /admission/counselors/team/roster — Tab 2: 7-day schedule grid.
// Shell (ContentLayout + Breadcrumb + header + TeamNav) lives in ../layout.tsx.

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { RosterTab } from '../_components/roster-tab';

export default function RosterPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;
  const institutionId: string | undefined = isAdmin ? undefined : profile?.institution_id ?? undefined;

  return <RosterTab institutionId={institutionId} isAdmin={isAdmin} />;
}
