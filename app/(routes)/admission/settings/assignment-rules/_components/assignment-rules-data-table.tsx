'use client';

// assignment-rules-data-table.tsx
// Thin wrapper: delegates to shared component, reads institutionId from auth.
// Logic lives in: components/shared/assignment-rules-crud/data-table.tsx

import { useAuth } from '@/hooks/use-auth';
import { AssignmentRulesDataTable as SharedDataTable } from '@/components/shared/assignment-rules-crud';

export function AssignmentRulesDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';

  return <SharedDataTable institutionId={institutionId} showCreateButton />;
}
