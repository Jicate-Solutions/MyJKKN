'use client';

// members-tab.tsx
// Tab 1 of /admission/counselors/team — full counselor management surface.
// Hosts Add Counselor button + AddCounselorDialog + CounselorList (search,
// filters, bulk actions, edit, soft-delete with guardrails, source assignment).
// Replaces the legacy lightweight Members tab; the Manage view on
// /admission/counselors has been retired and this is now the single source
// of CRUD for counselors.

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { usePermissions } from '@/hooks/use-permissions';
import { Button } from '@/components/ui/button';
import { AddCounselorDialog } from '@/app/(routes)/admission/counselors/_components/add-counselor-dialog';
import { CounselorList } from '@/app/(routes)/admission/counselors/_components/counselor-list';

interface MembersTabProps {
  institutionId: string | undefined;
  isAdmin: boolean;
}

export function MembersTab({ institutionId, isAdmin }: MembersTabProps) {
  const { canAccess } = usePermissions();
  const [addOpen, setAddOpen] = useState(false);
  // CounselorList owns its own refetchKey internally; remounting via `key`
  // forces a fresh fetch after a successful Add (simpler than threading a
  // ref or callback into the existing component).
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <PermissionGuard module="admission" action="counselors.view">
      <div className="space-y-4">
        {canAccess('admission', 'counselors.create') && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Counselor
            </Button>
          </div>
        )}

        <CounselorList
          key={refreshKey}
          institutionId={institutionId}
          isGlobalUser={isAdmin}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />

        <AddCounselorDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          institutionId={institutionId}
          onSuccess={() => {
            setAddOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      </div>
    </PermissionGuard>
  );
}
