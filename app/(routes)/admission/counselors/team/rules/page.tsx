'use client';

// /admission/counselors/team/rules — Tab 4: Read-only assignment rules display.
// Edit/CRUD lives at /admission/settings/assignment-rules.
// Shell (ContentLayout + Breadcrumb + header + TeamNav) lives in ../layout.tsx.

import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { RulesTab } from '../_components/rules-tab';

export default function RulesPage() {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;
  const institutionId: string | undefined = isAdmin ? undefined : profile?.institution_id ?? undefined;

  return <RulesTab institutionId={institutionId} />;
}
