'use client';

// /admission/counselors/team/activity — Tab 5: Cascade events & audit log.
// Shell (ContentLayout + Breadcrumb + header + TeamNav) lives in ../layout.tsx.

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { ActivityTab } from '../_components/activity-tab';

export default function ActivityPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;
  const institutionId: string | undefined = isAdmin ? undefined : profile?.institution_id ?? undefined;

  return <ActivityTab institutionId={institutionId} />;
}
