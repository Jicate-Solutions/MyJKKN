'use client';

// Foundation & Competitive-Exam Programme — hub.
// Permission-guarded landing (foundation.dashboard.view). Orients faculty /
// coordinators and routes into the console. Denials render an explicit 403
// (PermissionError), never a silent redirect (CLAUDE.md #27).

import { usePermissions } from '@/hooks/use-permissions';
import { PermissionError } from '@/components/errors/permission-error';
import { Skeleton } from '@/components/ui/skeleton';
import { FoundationHeader } from './_components/foundation-header';
import { HubOverview } from './_components/hub-overview';

export default function FoundationHubPage() {
  const { isLoading, canAccess } = usePermissions();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 md:px-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!canAccess('foundation', 'dashboard.view')) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
        <PermissionError
          message="You do not have access to the Foundation Programme."
          requiredPermission="foundation.dashboard.view"
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-6 md:px-8">
      <FoundationHeader
        title="Foundation & Competitive-Exam Programme"
        subtitle="School-grade foundation and government / competitive-exam coaching — cohorts, diagnostics, and per-student mastery maps."
      />
      <HubOverview />
    </div>
  );
}
