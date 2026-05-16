'use client';

// /admission/counselors/team — Team Management hub, Members tab (default).
// Shell (ContentLayout + Breadcrumb + header + TeamNav) lives in layout.tsx.
// This file renders ONLY the Members tab body.

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { MembersTab } from './_components/members-tab';

export default function TeamPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;

  // Super-admins see all institutions (pass undefined); others scoped to own institution.
  const institutionId: string | undefined = isAdmin ? undefined : profile?.institution_id ?? undefined;

  return <MembersTab institutionId={institutionId} isAdmin={isAdmin} />;
}
