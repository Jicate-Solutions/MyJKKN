'use client';

// /admission/counselors/team/allocation — Tab 3: Institution + source mapping.
// Shell (ContentLayout + Breadcrumb + header + TeamNav) lives in ../layout.tsx.

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { AllocationTab } from '../_components/allocation-tab';

export default function AllocationPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;
  const institutionId: string | undefined = isAdmin ? undefined : profile?.institution_id ?? undefined;

  return <AllocationTab institutionId={institutionId} />;
}
