'use client';

// rules-tab.tsx
// Full-CRUD assignment rules tab for /admission/counselors/team.
// Mounts the shared AssignmentRulesDataTable (same component as settings/assignment-rules).
// Removes the old read-only "Edit in Settings" link.
//
// Shared component: components/shared/assignment-rules-crud/

import { AssignmentRulesDataTable } from '@/components/shared/assignment-rules-crud';

interface RulesTabProps {
  institutionId: string | undefined;
}

export function RulesTab({ institutionId }: RulesTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">Assignment Rules</h3>
        <p className="text-sm text-muted-foreground">
          Rules determine how incoming leads are routed to counselors.
          Higher-priority rules run first.
        </p>
      </div>
      <AssignmentRulesDataTable institutionId={institutionId} showCreateButton />
    </div>
  );
}
